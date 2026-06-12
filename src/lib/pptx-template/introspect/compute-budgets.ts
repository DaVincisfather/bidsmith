import type { SlideShapes, ShapeText } from "./read-pptx";
import type { ManifestSlide } from "../manifest-types";
import type { FieldBudgets } from "../budget-types";

// HYBRIDMODELL (Stefan-beslut 2026-06-12, efter kalibrerings-stopp).
//
// Ren geometri kan inte reproducera de handsatta budgetarna: de enradiga
// normAutofit-boxarna (namn/period/avstämningar) krymper texten i PowerPoint i
// stället för att brytas, så boxhöjden säger inget om hur många tecken som ryms.
// Deras budgetar är därför REDAKTIONELLA — en fältsemantik, inte en boxmätning.
//
// Modellen är nu hybrid med två lager:
//   1. Redaktionellt tak (editorialCap): en konvention per FÄLT som gäller ALLA
//      mallar — exakt som etikett-mallarna är en konvention. Det är den
//      semantiska maxlängden för fältet (t.ex. ett fas-namn ryms i ~40 tecken).
//   2. Geometri kan bara SÄNKA budgeten, aldrig höja den:
//        budget = normAutofit ? tak : min(tak, geometrisk kapacitet)
//      - normAutofit (texten krymps) => geometrin är inte bindande, taket gäller
//        rakt av.
//      - ej normAutofit (boxen bryter/klipper text) => geometrin är bindande och
//        kan klippa taket nedåt via den geometriska kapacitetsformeln nedan.
//
// Den geometriska kapaciteten använder oförändrade kalibreringskonstanter
// (CWF 0,5, FILL 0,9, maxLines, divideByCap, ROUND_TO-avrundning bara på den
// geometriska sidan). Per-fält/per-mall-fudgefaktorer är fortsatt förbjudna —
// taket är fältsemantik, inte en trimmad faktor, och geometrin är ren mätning.
const EM = "—";
const EN = "–";
const EMU_PER_PT = 12700;

// KALIBRERINGSKONSTANTER — globala, gäller den GEOMETRISKA sidan (klamringen).
// Trimmade så anbudsmall-v2:s ej-normAutofit-boxar reproducerar facit inom ±10 %.
// Per-fält/per-mall-overrides är förbjudna — då förutsäger formeln inget.
const CHAR_WIDTH_FACTOR = 0.5; // snitteckenbredd ≈ 0,5 × fontstorlek (sans-serif)
const FILL_FACTOR = 0.9; // nyttjandegrad av boxen (padding, ojämn högermarg)
const DEFAULT_LINE_SPACING_PCT = 120;
const DEFAULT_FONT_PT = 18;
const ROUND_TO = 5; // geometrisk kapacitet avrundas till närmsta 5 (facit är runda tal)

interface BudgetTokenSpec {
  fieldPath: string;
  /** Redaktionellt tak — fältsemantik (maxlängd) som gäller ALLA mallar. Geometrin
   *  kan bara sänka budgeten under detta tak, aldrig höja den. Obligatoriskt:
   *  varje budgetbärande token måste ha ett tak (jfr etikett-konventionen). */
  editorialCap: number;
  /** Dela boxkapaciteten med slidens itemCaps[key] (en-box-kolumner med flera items).
   *  Påverkar bara den geometriska sidan; på normAutofit-vägen gäller taket rakt av. */
  divideByCap?: string;
  /** Maxrader oavsett boxhöjd — fältsemantik (t.ex. namn/period är enradiga).
   *  Påverkar bara den geometriska kapaciteten. */
  maxLines?: number;
}

// Tokens vars innehåll är AI-skrivet och längdbudgeterat. Övriga tokens
// (kundnamn, datum, konsultrader) fylls deterministiskt och behöver ingen budget.
// editorialCap = fältets semantiska maxlängd (konvention, alla mallar).
const BUDGET_TOKENS: Record<string, BudgetTokenSpec> = {
  [`{Fas 1 ${EM} namn}`]: { fieldPath: "phases[*].name", editorialCap: 40, maxLines: 1 },
  [`{M1${EN}M2}`]: { fieldPath: "phases[*].period", editorialCap: 10, maxLines: 1 },
  "{Mål}": { fieldPath: "phases[*].objective", editorialCap: 120 },
  "{Aktiviteter}": {
    fieldPath: "phases[*].activities[*]",
    editorialCap: 120,
    divideByCap: "activities",
  },
  "{Leveranser}": {
    fieldPath: "phases[*].deliverables[*]",
    editorialCap: 100,
    divideByCap: "deliverables",
  },
  "{Beslut}": {
    fieldPath: "phases[*].decisions[*]",
    editorialCap: 100,
    divideByCap: "decisions",
  },
  [`{Avstämning 1 ${EM} tidpunkt och innehåll}`]: {
    fieldPath: "checkpoints[*]",
    editorialCap: 80,
  },
  "{Beskrivning}": { fieldPath: "certs[*].description", editorialCap: 80 },
};

/** Nominellt klonantal när deck-positioner beräknas (references saknar itemCap). */
const NOMINAL_REFERENCE_CLONES = 2;

export interface ComputedBudgets {
  budgets: FieldBudgets;
  fieldSlides: Record<string, number>;
  /** Tokens i BUDGET_TOKENS på den geometriska vägen som saknar geometri.
   *  En normAutofit-shape utan geometri är OK (taket gäller) och varnar inte. */
  warnings: string[];
}

export function computeBudgets(
  slides: SlideShapes[],
  included: ManifestSlide[],
): ComputedBudgets {
  const budgets: FieldBudgets = {};
  const fieldSlides: Record<string, number> = {};
  const warnings: string[] = [];

  const deckPositions = computeDeckPositions(included);
  const bySource = new Map(slides.map((s) => [s.source, s]));

  for (const slideCfg of included) {
    const slide = bySource.get(slideCfg.source);
    if (!slide) continue;

    for (const shape of slide.shapes) {
      for (const token of shape.tokens) {
        const spec = BUDGET_TOKENS[token];
        if (!spec) continue;

        const value = budgetForOccurrence(shape, spec, slideCfg, token, warnings);
        if (value === null) continue;

        // Samma fält i flera boxar (namn/period på både overview och detail):
        // den snålaste boxen sätter budgeten; första förekomstens deck-position
        // blir flaggans slide (matchar FIELD_METADATAs nuvarande semantik).
        if (budgets[spec.fieldPath] === undefined || value < budgets[spec.fieldPath]) {
          budgets[spec.fieldPath] = value;
        }
        if (fieldSlides[spec.fieldPath] === undefined) {
          fieldSlides[spec.fieldPath] = deckPositions.get(slideCfg.source) ?? slideCfg.source;
        }
      }
    }
  }

  return { budgets, fieldSlides, warnings };
}

/**
 * Budget för en enskild token-förekomst enligt hybridmodellen.
 * normAutofit => taket gäller rakt av (geometrin inte bindande).
 * Annars => min(tak, geometrisk kapacitet). Returnerar null om geometrin
 * saknas på den geometriska vägen (loggar varning) — då bidrar inte förekomsten.
 */
function budgetForOccurrence(
  shape: ShapeText,
  spec: BudgetTokenSpec,
  slideCfg: ManifestSlide,
  token: string,
  warnings: string[],
): number | null {
  if (shape.autofit === "norm") {
    // Texten krymps till boxen — geometrin säger inget om teckenkapaciteten.
    return spec.editorialCap;
  }

  if (!shape.geometry) {
    warnings.push(
      `${token} på slide ${slideCfg.source} saknar explicit geometri — budget kan inte beräknas`,
    );
    return null;
  }

  const divisor = spec.divideByCap ? (slideCfg.itemCaps?.[spec.divideByCap] ?? 1) : 1;
  const capacity = boxCapacity(shape, spec.maxLines) / divisor;
  const geometric = Math.max(ROUND_TO, Math.round(capacity / ROUND_TO) * ROUND_TO);
  return Math.min(spec.editorialCap, geometric);
}

function boxCapacity(shape: ShapeText, maxLines?: number): number {
  const fontPt = shape.fontSizePt ?? DEFAULT_FONT_PT;
  const lineSpacingPct = shape.lineSpacingPct ?? DEFAULT_LINE_SPACING_PCT;
  const lineHeightEmu = fontPt * EMU_PER_PT * (lineSpacingPct / 100);
  const charWidthEmu = fontPt * EMU_PER_PT * CHAR_WIDTH_FACTOR;

  const geometricLines = Math.max(1, Math.floor(shape.geometry!.cy / lineHeightEmu));
  const lines = maxLines !== undefined ? Math.min(maxLines, geometricLines) : geometricLines;
  const charsPerLine = Math.floor(shape.geometry!.cx / charWidthEmu);

  return lines * charsPerLine * FILL_FACTOR;
}

/** 1-indexerad deck-position per source-slide, med nominella klonantal. */
function computeDeckPositions(included: ManifestSlide[]): Map<number, number> {
  const positions = new Map<number, number>();
  let pos = 0;
  for (const s of included) {
    positions.set(s.source, pos + 1);
    if (s.cloneFrom === "phases") {
      pos += s.itemCaps?.phases ?? 4;
    } else if (s.cloneFrom === "references") {
      pos += NOMINAL_REFERENCE_CLONES;
    } else {
      pos += 1;
    }
  }
  return positions;
}
