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
//        budget = enradig-normAutofit ? tak : min(tak, geometrisk kapacitet)
//      - normAutofit + ENRADIG box (geometrisk radräkning ≤ 1, resp. maxLines):
//        texten krymps horisontellt på en rad och ryms => taket gäller rakt av.
//      - normAutofit + FLERRADIG box: krympningen av redan radbruten prosa har
//        ett golv och spiller => geometrin binder som på ej-norm-vägen.
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
  /** PPTX-tabellfält (kravmatris/team): raderna autohöjer, så mallboxens höjd säger
   *  inget om kapaciteten. Sätt true => geometrin konsulteras aldrig, taket gäller
   *  alltid (rakt redaktionellt). Uteslutande med divideByCap/maxLines (ignoreras). */
  editorialOnly?: boolean;
  /** Dela boxkapaciteten med slidens itemCaps[key] (en-box-kolumner med flera items).
   *  Påverkar bara den geometriska sidan (ej-norm samt FLERRADIG normAutofit); på den
   *  enradiga normAutofit-vägen gäller taket rakt av och delningen tillämpas inte. */
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
  // Tabellfält (kravmatris slide 13, team slide 12): PPTX-tabeller med autohöjd —
  // editorialOnly, geometrin konsulteras aldrig. Varje fälts alla token-varianter
  // (rad 1 långform + rad 2–N kortform) delar tak + fieldPath.
  ...tableField("rows[*].requirement", 160, [
    `{Ska-krav 1 ${EM} formulering enligt upphandlingsunderlag}`,
    "{Ska-krav 2}",
    "{Ska-krav 3}",
    "{Ska-krav 4}",
    "{Ska-krav 5}",
    "{Ska-krav 6}",
  ]),
  ...tableField("rows[*].hurUppfylls", 160, [
    `{Hur krav 1 uppfylls ${EM} konkret beskrivning}`,
    "{Hur krav 2 uppfylls}",
    "{Hur krav 3 uppfylls}",
    "{Hur krav 4 uppfylls}",
    "{Hur krav 5 uppfylls}",
    "{Hur krav 6 uppfylls}",
  ]),
  ...tableField("rows[*].referens", 70, [
    "{CV/ref 1}",
    "{CV/ref 2}",
    "{CV/ref 3}",
    "{CV/ref 4}",
    "{CV/ref 5}",
    "{CV/ref 6}",
  ]),
  ...tableField("members[*].role", 60, [
    "{Roll 1}",
    "{Roll 2}",
    "{Roll 3}",
    "{Roll 4}",
    "{Roll 5}",
  ]),
};

/** Bygger editorialOnly-specar för ett tabellfälts alla token-varianter. */
function tableField(
  fieldPath: string,
  editorialCap: number,
  tokens: string[],
): Record<string, BudgetTokenSpec> {
  const spec: BudgetTokenSpec = { fieldPath, editorialCap, editorialOnly: true };
  return Object.fromEntries(tokens.map((t) => [t, spec]));
}

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
 * normAutofit + ENRADIG box => taket gäller rakt av: texten krymps horisontellt
 *   på en rad och ryms (namn/period/korta etiketter).
 * normAutofit + FLERRADIG box => geometrin binder som på ej-norm-vägen. Krympning
 *   av redan radbruten prosa har ett golv (PowerPoint slutar krympa), så en liten
 *   flerradig box spiller — taket ensamt ljuger då.
 * Ej norm (boxen bryter/klipper) => min(tak, geometrisk kapacitet).
 * Returnerar null om geometrin saknas på den geometriska vägen (loggar varning).
 */
function budgetForOccurrence(
  shape: ShapeText,
  spec: BudgetTokenSpec,
  slideCfg: ManifestSlide,
  token: string,
  warnings: string[],
): number | null {
  // Tabellfält: autohöjd-rader gör mallgeometrin meningslös — taket gäller alltid.
  if (spec.editorialOnly) return spec.editorialCap;

  if (shape.autofit === "norm") {
    // Utan geometri kan flerradighet inte avgöras — taket gäller (oförändrat).
    if (!shape.geometry) return spec.editorialCap;
    // Enradig box krymper säkert; flerradig prosa binder geometriskt.
    if (geometricLineCount(shape, spec.maxLines) <= 1) return spec.editorialCap;
    return clampedGeometricBudget(shape, spec, slideCfg);
  }

  if (!shape.geometry) {
    warnings.push(
      `${token} på slide ${slideCfg.source} saknar explicit geometri — budget kan inte beräknas`,
    );
    return null;
  }

  return clampedGeometricBudget(shape, spec, slideCfg);
}

/** min(tak, geometrisk kapacitet) med divideByCap och ROUND_TO-avrundning. */
function clampedGeometricBudget(
  shape: ShapeText,
  spec: BudgetTokenSpec,
  slideCfg: ManifestSlide,
): number {
  const divisor = spec.divideByCap ? (slideCfg.itemCaps?.[spec.divideByCap] ?? 1) : 1;
  const capacity = boxCapacity(shape, spec.maxLines) / divisor;
  const geometric = Math.max(ROUND_TO, Math.round(capacity / ROUND_TO) * ROUND_TO);
  return Math.min(spec.editorialCap, geometric);
}

/** Antal geometriska rader boxen rymmer, kapat av maxLines (fältsemantik). */
function geometricLineCount(shape: ShapeText, maxLines?: number): number {
  const fontPt = shape.fontSizePt ?? DEFAULT_FONT_PT;
  const lineSpacingPct = shape.lineSpacingPct ?? DEFAULT_LINE_SPACING_PCT;
  const lineHeightEmu = fontPt * EMU_PER_PT * (lineSpacingPct / 100);
  const geometricLines = Math.max(1, Math.floor(shape.geometry!.cy / lineHeightEmu));
  return maxLines !== undefined ? Math.min(maxLines, geometricLines) : geometricLines;
}

function boxCapacity(shape: ShapeText, maxLines?: number): number {
  const fontPt = shape.fontSizePt ?? DEFAULT_FONT_PT;
  const charWidthEmu = fontPt * EMU_PER_PT * CHAR_WIDTH_FACTOR;
  const lines = geometricLineCount(shape, maxLines);
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
