import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "fs/promises";
import path from "path";
import { readPptxSlides, type SlideShapes } from "../read-pptx";
import { identifySlides } from "../identify-slides";
import { computeBudgets } from "../compute-budgets";
import type { ManifestSlide } from "../../manifest-types";
import { buildMiniPptx, slideWithShape } from "./mini-pptx";

const TEMPLATE = path.resolve("templates", "anbudsmall-v2.pptx");

// Handsatta budgetar ur migration 001 (template_configs) — kalibreringsfacit
// för designmallen anbudsmall-v2.
const FACIT_BUDGETS: Record<string, number> = {
  "phases[*].name": 40,
  "phases[*].period": 10,
  "phases[*].objective": 120,
  "phases[*].activities[*]": 120,
  "phases[*].deliverables[*]": 100,
  "phases[*].decisions[*]": 100,
  "checkpoints[*]": 80,
  "certs[*].description": 80,
};

describe("computeBudgets — kalibrering mot anbudsmall-v2 (±10 %)", () => {
  let slides: SlideShapes[];
  beforeAll(async () => {
    slides = await readPptxSlides(await readFile(TEMPLATE));
  });

  it("reproducerar alla 8 handsatta budgetar inom ±10 %", () => {
    const { budgets } = computeBudgets(slides, identifySlides(slides).included);
    const report: string[] = [];
    for (const [field, expected] of Object.entries(FACIT_BUDGETS)) {
      const actual = budgets[field];
      const ratio = actual / expected;
      report.push(`${field}: facit ${expected}, beräknad ${actual} (${(ratio * 100).toFixed(0)} %)`);
      expect(actual, report.join("\n")).toBeGreaterThanOrEqual(expected * 0.9);
      expect(actual, report.join("\n")).toBeLessThanOrEqual(expected * 1.1);
    }
  });

  it("beräknar fieldSlides ur slide-ordningen", () => {
    const { fieldSlides } = computeBudgets(slides, identifySlides(slides).included);
    // Deck-position med nominella kloner (phases=itemCap, references=2):
    // cover 1, toc 2, prose 3–5, overview 6, detail 7–10, qa 11 ...
    expect(fieldSlides["phases[*].name"]).toBe(6);
    expect(fieldSlides["phases[*].objective"]).toBe(7);
    expect(fieldSlides["checkpoints[*]"]).toBe(11);
  });
});

// Den riktiga mallen kör nästan bara cap-vägen (normAutofit → taket rakt av).
// De geometriska grenarna i hybridmodellen — klamring, divideByCap och
// multi-occurrence-min — behöver syntetisk täckning. Dessa slides byggs med
// mini-pptx-hjälparen och läses via readPptxSlides, sedan matas hand-byggda
// ManifestSlide[] in i computeBudgets. Vi väljer befintliga budget-tokens
// ({Mål}: editorialCap 120 utan divideByCap; {Aktiviteter}: editorialCap 120,
// divideByCap "activities") så BUDGET_TOKENS-tabellen inte rörs.
//
// Geometriformelns konstanter (compute-budgets.ts):
//   EMU_PER_PT = 12700, CHAR_WIDTH_FACTOR = 0.5, FILL_FACTOR = 0.9,
//   default lineSpacingPct = 120, ROUND_TO = 5.
// För fontSizePt = 18 (sz="1800"):
//   charWidthEmu  = 18 * 12700 * 0.5 = 114300
//   lineHeightEmu = 18 * 12700 * 1.2 = 274320
describe("computeBudgets — syntetiska geometriska grenar", () => {
  // En icke-norm box (ingen autofit-tagg) som bär ett token. Explicit sz="1800"
  // ger fontSizePt 18; utan <a:lnSpc> faller radavståndet till default 120 %.
  function nonNormBox(token: string, cx: number, cy: number): string {
    return slideWithShape(`
      <p:spPr><a:xfrm>
        <a:off x="0" y="0"/>
        <a:ext cx="${cx}" cy="${cy}"/>
      </a:xfrm></p:spPr>
      <p:txBody>
        <a:bodyPr/>
        <a:p><a:r><a:rPr sz="1800"/><a:t>${token}</a:t></a:r></a:p>
      </p:txBody>`);
  }

  it("(a) klamrar budgeten till geometrisk kapacitet under editorialCap", async () => {
    // cx=6629400 → charsPerLine = floor(6629400 / 114300) = 58
    // cy=300000  → geometricLines = floor(300000 / 274320) = 1
    // capacity = 1 * 58 * 0.9 = 52.2 → round(52.2/5)*5 = 50 → min(120, 50) = 50
    const buf = await buildMiniPptx(nonNormBox("{Mål}", 6629400, 300000));
    const slides = await readPptxSlides(buf);
    const manifest: ManifestSlide[] = [
      { source: 1, type: "phase-detail", placeholders: ["{Mål}"] },
    ];
    const { budgets } = computeBudgets(slides, manifest);
    expect(budgets["phases[*].objective"]).toBe(50);
  });

  it("(b) delar geometrisk kapacitet på itemCaps via divideByCap", async () => {
    // cx=9144000 → charsPerLine = floor(9144000 / 114300) = 80
    // cy=900000  → geometricLines = floor(900000 / 274320) = 3
    // boxCapacity = 3 * 80 * 0.9 = 216; divisor = itemCaps.activities = 4
    // capacity = 216 / 4 = 54 → round(54/5)*5 = 55 → min(120, 55) = 55
    const buf = await buildMiniPptx(nonNormBox("{Aktiviteter}", 9144000, 900000));
    const slides = await readPptxSlides(buf);
    const manifest: ManifestSlide[] = [
      {
        source: 1,
        type: "phase-detail",
        itemCaps: { activities: 4 },
        placeholders: ["{Aktiviteter}"],
      },
    ];
    const { budgets } = computeBudgets(slides, manifest);
    expect(budgets["phases[*].activities[*]"]).toBe(55);
  });

  // normAutofit-boxar: enradiga fält (namn/period, korta etiketter) krymper
  // horisontellt och ryms → taket gäller rakt av. FLERRADIG prosa i normAutofit
  // har ett krympningsgolv och spiller → geometrin binder precis som på ej-norm-
  // vägen. En norm-box byggs som nonNormBox men med explicit <a:normAutofit/>.
  function normBox(token: string, cx: number, cy: number): string {
    return slideWithShape(`
      <p:spPr><a:xfrm>
        <a:off x="0" y="0"/>
        <a:ext cx="${cx}" cy="${cy}"/>
      </a:xfrm></p:spPr>
      <p:txBody>
        <a:bodyPr><a:normAutofit/></a:bodyPr>
        <a:p><a:r><a:rPr sz="1800"/><a:t>${token}</a:t></a:r></a:p>
      </p:txBody>`);
  }

  it("(d) klamrar FLERRADIG normAutofit-box till geometrin under editorialCap", async () => {
    // cx=4572000 → charsPerLine = floor(4572000 / 114300) = 40
    // cy=600000  → geometricLines = floor(600000 / 274320) = 2  (flerradig!)
    // capacity = 2 * 40 * 0.9 = 72 → round(72/5)*5 = 70 → min(120, 70) = 70
    const buf = await buildMiniPptx(normBox("{Mål}", 4572000, 600000));
    const slides = await readPptxSlides(buf);
    const manifest: ManifestSlide[] = [
      { source: 1, type: "phase-detail", placeholders: ["{Mål}"] },
    ];
    const { budgets } = computeBudgets(slides, manifest);
    expect(budgets["phases[*].objective"]).toBe(70);
  });

  it("(e) ENRADIG normAutofit-box behåller editorialCap (krymper säkert)", async () => {
    // cy=300000 → geometricLines = floor(300000 / 274320) = 1 (enradig)
    // Enradig norm-box → taket gäller rakt av, geometrin binder inte.
    const buf = await buildMiniPptx(normBox("{Mål}", 2286000, 300000));
    const slides = await readPptxSlides(buf);
    const manifest: ManifestSlide[] = [
      { source: 1, type: "phase-detail", placeholders: ["{Mål}"] },
    ];
    const { budgets } = computeBudgets(slides, manifest);
    expect(budgets["phases[*].objective"]).toBe(120);
  });

  it("(f) maxLines:1 håller normAutofit-box enradig även när boxen är hög", async () => {
    // cy=900000 → geometricLines = 3, men maxLines:1 (namn/period) → 1 rad →
    // taket gäller. Skyddar namn/period mot flerradig geometrisk klamring.
    const buf = await buildMiniPptx(normBox("{Fas 1 — namn}", 4572000, 900000));
    const slides = await readPptxSlides(buf);
    const manifest: ManifestSlide[] = [
      { source: 1, type: "phases-overview", placeholders: ["{Fas 1 — namn}"] },
    ];
    const { budgets } = computeBudgets(slides, manifest);
    expect(budgets["phases[*].name"]).toBe(40);
  });

  it("(c) tar min över förekomster; fieldSlides = första förekomstens deck-position", async () => {
    // Slide 1: stor icke-norm box → geometric 215, klippt av editorialCap till 120.
    //   cx=9144000 (80 ch), cy=900000 (3 rader): 3*80*0.9 = 216 → 215 → min(120,215)=120
    // Slide 2: liten icke-norm box → geometric 50 (samma som (a)).
    // min(120, 50) = 50; första förekomsten (slide 1, deck-position 1) sätter fieldSlides.
    const buf = await buildMiniPptx([
      nonNormBox("{Mål}", 9144000, 900000),
      nonNormBox("{Mål}", 6629400, 300000),
    ]);
    const slides = await readPptxSlides(buf);
    const manifest: ManifestSlide[] = [
      { source: 1, type: "phase-detail", placeholders: ["{Mål}"] },
      { source: 2, type: "phase-detail", placeholders: ["{Mål}"] },
    ];
    const { budgets, fieldSlides } = computeBudgets(slides, manifest);
    expect(budgets["phases[*].objective"]).toBe(50);
    expect(fieldSlides["phases[*].objective"]).toBe(1);
  });

  it("(g) editorialOnly-token ignorerar geometrin — taket gäller även liten flerradig box", async () => {
    // Kravmatris/team är PPTX-tabeller (autohöjd-rader) → mallboxens höjd säger
    // inget om verklig kapacitet. Sådana fält är editorialOnly: taket gäller alltid.
    // {CV/ref 1} (rows[*].referens, tak 70): en liten FLERRADIG norm-box som annars
    // skulle klamras lågt geometriskt ska ändå ge taket 70.
    const buf = await buildMiniPptx(normBox("{CV/ref 1}", 2286000, 600000));
    const slides = await readPptxSlides(buf);
    const manifest: ManifestSlide[] = [
      { source: 1, type: "requirement-matrix", placeholders: ["{CV/ref 1}"] },
    ];
    const { budgets } = computeBudgets(slides, manifest);
    expect(budgets["rows[*].referens"]).toBe(70);
  });
});
