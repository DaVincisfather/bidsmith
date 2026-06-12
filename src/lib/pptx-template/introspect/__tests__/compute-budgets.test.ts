import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "fs/promises";
import path from "path";
import { readPptxSlides, type SlideShapes } from "../read-pptx";
import { identifySlides } from "../identify-slides";
import { computeBudgets } from "../compute-budgets";

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
