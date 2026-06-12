// src/lib/pptx-template/introspect/identify-slides.ts
import type { SlideShapes } from "./read-pptx";
import type { ManifestSlide } from "../manifest-types";

const EM = "—"; // —

interface SlideSignature {
  type: ManifestSlide["type"];
  variant?: ManifestSlide["variant"];
  requires: string[];
  cloneFrom?: ManifestSlide["cloneFrom"];
  itemCaps?: Record<string, number>;
  /**
   * Familjepredikat för klon-mallar (phase-detail, reference). Mockupen innehåller
   * pre-ifyllda illustrativa kopior av klon-mallen (slides 8–10 av 7, slide 15 av 14)
   * vars placeholders är SLOT-baserade ({Aktivitet 1}, {Referens 2 — kundnamn}, …) och
   * därför INTE matchar `requires`. `family` känner igen kopiorna via en diskriminerande
   * token så de exkluderas som dubletter i stället för "okända placeholders". `requires`
   * avgör fortfarande vilken slide som är kanonisk mall (första familjeträffen vinner).
   */
  family?: (tokens: Set<string>) => boolean;
}

const hasMatch = (tokens: Set<string>, re: RegExp): boolean =>
  [...tokens].some((t) => re.test(t));

// Härledd ur applicatorernas placeholder-maps — uppdatera båda vid konventionsändring.
// itemCaps speglar registryts värden (slot-antal i mallens layout).
const SIGNATURES: SlideSignature[] = [
  { type: "cover", requires: ["{Upphandlingens namn}", "{Kundnamn}", "{Anbudsdatum}"] },
  { type: "prose", variant: "kunden-idag", requires: ["{Nuläge}", "{Smärtpunkter}"] },
  { type: "prose", variant: "uppdraget", requires: ["{Stycken}"] },
  { type: "prose", variant: "vision", requires: ["{Utmaningar}", "{Värden}"] },
  {
    type: "phases-overview",
    requires: [`{Fas 1 ${EM} namn}`, "{Fas 1}", `{Fas 2 ${EM} namn}`],
    itemCaps: { phases: 4 },
  },
  {
    type: "phase-detail",
    requires: ["{Mål}", "{Aktiviteter}", "{Leveranser}", "{Beslut}"],
    cloneFrom: "phases",
    itemCaps: { activities: 4, deliverables: 3, decisions: 3 },
    // {Antal veckor} finns på slides 7–10 och ingen annanstans → familjemarkör.
    family: (t) => t.has("{Antal veckor}"),
  },
  {
    type: "quality-assurance",
    requires: ["{QA-process}", "{Kvalitetsledare}", "{Eskalering}"],
  },
  { type: "team-pricing", requires: [`{Konsult 1 ${EM} namn}`, "{Summa timmar}"] },
  {
    type: "requirement-matrix",
    requires: [`{Ska-krav 1 ${EM} formulering enligt upphandlingsunderlag}`],
  },
  {
    type: "reference",
    requires: [`{Referens 1 ${EM} kundnamn}`],
    cloneFrom: "references",
    // {Referens N — kundnamn} finns på slides 14–15 och ingen annanstans → familjemarkör.
    family: (t) => hasMatch(t, new RegExp(`^\\{Referens \\d+ ${EM} kundnamn\\}$`)),
  },
  { type: "confidentiality", requires: ["{OSL kap X §Y}"] },
  { type: "certifications", requires: ["{Certifikatnummer}", "{Giltighetstid}"] },
];

const FOOTER_TOKENS = new Set(["{Bolagsnamn}", "{Diarienummer}"]);

export interface IdentifiedSlides {
  included: ManifestSlide[];
  excluded: { source: number; reason: string }[];
}

export function identifySlides(slides: SlideShapes[]): IdentifiedSlides {
  const included: ManifestSlide[] = [];
  const excluded: IdentifiedSlides["excluded"] = [];
  const firstMatch = new Map<SlideSignature, number>(); // signatur → source som vann
  let tocAssigned = false;

  for (const slide of slides) {
    const tokenSet = new Set(slide.tokens);
    const matches = SIGNATURES.filter((sig) =>
      sig.requires.every((t) => tokenSet.has(t)),
    );

    if (matches.length > 1) {
      throw new Error(
        `slide ${slide.source} matchar flera signaturer (${matches
          .map((m) => m.type)
          .join(", ")}) — signaturtabellen ska vara disjunkt`,
      );
    }

    if (matches.length === 1) {
      const sig = matches[0];
      const winner = firstMatch.get(sig);
      if (winner !== undefined) {
        excluded.push({
          source: slide.source,
          reason: `duplikat av slide ${winner} — illustrativ kopia`,
        });
        continue;
      }
      firstMatch.set(sig, slide.source);
      const imgs = imageShapesOf(slide);
      included.push({
        source: slide.source,
        type: sig.type,
        ...(sig.variant ? { variant: sig.variant } : {}),
        ...(sig.cloneFrom ? { cloneFrom: sig.cloneFrom } : {}),
        ...(sig.itemCaps ? { itemCaps: sig.itemCaps } : {}),
        placeholders: slide.tokens,
        ...(imgs ? { imageShapes: imgs } : {}),
      });
      continue;
    }

    // Illustrativ kopia av en redan-matchad klon-mall: slot-baserade placeholders
    // matchar inte `requires`, men familjemarkören gör det. Exkludera som dublett
    // (annars hamnar slides 8–10/15 felaktigt under "okända placeholders").
    const familyWinner = familyDuplicateOf(slide.tokens, firstMatch);
    if (familyWinner !== undefined) {
      excluded.push({
        source: slide.source,
        reason: `duplikat av slide ${familyWinner} — illustrativ kopia`,
      });
      continue;
    }

    const contentTokens = slide.tokens.filter((t) => !FOOTER_TOKENS.has(t));
    const hasImages = slide.images.placed + slide.images.placeholders > 0;
    if (contentTokens.length === 0 && hasImages) {
      // Token-fri bildslide (avdelare, collage) — renderas passthrough,
      // bilderna orörda. Se designbeslut 8.
      included.push({
        source: slide.source,
        type: "static",
        placeholders: slide.tokens,
        imageShapes: slide.images,
      });
    } else if (contentTokens.length === 0 && !tocAssigned) {
      tocAssigned = true;
      included.push({ source: slide.source, type: "toc", placeholders: slide.tokens });
    } else if (contentTokens.length === 0) {
      excluded.push({
        source: slide.source,
        reason: "statisk slide utan kända placeholders",
      });
    } else {
      excluded.push({
        source: slide.source,
        reason: `okända placeholders: ${contentTokens.join(", ")}`,
      });
    }
  }

  return { included, excluded };
}

function imageShapesOf(slide: SlideShapes) {
  return slide.images.placed + slide.images.placeholders > 0 ? slide.images : undefined;
}

/**
 * Returnerar source-numret för den kanoniska klon-mallen om sliden är en
 * illustrativ kopia (familjeträff på en redan-vunnen signatur), annars undefined.
 * Den kanoniska mallen vinner alltid `requires`-matchningen först (presentations-
 * ordning: 7 före 8–10, 14 före 15), så `firstMatch` är redan satt här.
 */
function familyDuplicateOf(
  tokens: string[],
  firstMatch: Map<SlideSignature, number>,
): number | undefined {
  const tokenSet = new Set(tokens);
  for (const [sig, winner] of firstMatch) {
    if (sig.family?.(tokenSet)) return winner;
  }
  return undefined;
}
