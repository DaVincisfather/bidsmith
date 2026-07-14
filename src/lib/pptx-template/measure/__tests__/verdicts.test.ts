import { describe, expect, it } from "vitest";
import {
  calibrationVerdict, checkAutofitShrink, checkHorizontalClip, checkOutsideSlide,
  checkSingleLineBreak, checkVerticalOverflow, deadspaceFindings, markerOf,
} from "../verdicts";
import { SEVERITIES } from "../types";
import type { ShapeMeasurementV2 } from "../types";

const SLIDE_W = 1440, SLIDE_H = 810;
function m(over: Partial<ShapeMeasurementV2>): ShapeMeasurementV2 {
  return {
    slide: 1, name: "TextBox 1", topPt: 100, leftPt: 100, widthPt: 400, heightPt: 100,
    boundHeightPt: 50, boundWidthPt: 200, marginTopPt: 4, marginBottomPt: 4,
    marginLeftPt: 4, marginRightPt: 4, wordWrap: true, autoSize: 0,
    fontSizePt: 18, textPrefix: "text", textLength: 100, ...over,
  };
}

describe("checkVerticalOverflow (com)", () => {
  it("flags text taller than the box minus margins + tolerance", () => {
    // available = 100 - 4 - 4 = 92; 95 > 94
    expect(checkVerticalOverflow(m({ boundHeightPt: 95 }))?.checkId).toBe("vertical-overflow");
    expect(checkVerticalOverflow(m({ boundHeightPt: 93 }))).toBeNull(); // inside tolerance
  });
});

describe("checkOutsideSlide (com)", () => {
  it("flags when the TEXT crosses the slide bottom edge", () => {
    // textBottom = 700 + 4 (marginTopPt default) + 120 = 824 > 810 + 2 tolerance
    expect(checkOutsideSlide(m({ topPt: 700, boundHeightPt: 120 }), SLIDE_W, SLIDE_H)?.checkId).toBe("outside-slide");
  });
  it("does NOT flag a box that bleeds past the right edge when the text itself stays inside (the empty-template regression case)", () => {
    // box: leftPt 1100 + widthPt 400 = 1500, well past slideWidthPt 1440 — but the text is small:
    // textRight = 1100 + 4 (marginLeftPt) + 200 (boundWidthPt) = 1304 < 1442
    expect(checkOutsideSlide(m({ leftPt: 1100, widthPt: 400, boundWidthPt: 200, wordWrap: false }), SLIDE_W, SLIDE_H)).toBeNull();
  });
  it("flags no-wrap TEXT that itself runs past the right edge", () => {
    // textRight = 1200 + 4 (marginLeftPt) + 300 = 1504 > 1442
    expect(checkOutsideSlide(m({ leftPt: 1200, boundWidthPt: 300, wordWrap: false }), SLIDE_W, SLIDE_H)?.checkId).toBe("outside-slide");
  });
  it("does not apply the right-edge check to wrapped text, even with a huge bound width", () => {
    // wrapped/centered text overestimates leftPt + boundWidthPt — not checked in v1
    expect(checkOutsideSlide(m({ leftPt: 1200, boundWidthPt: 3000, wordWrap: true }), SLIDE_W, SLIDE_H)).toBeNull();
  });
  it("clean shape well inside the slide → null", () => {
    expect(checkOutsideSlide(m({}), SLIDE_W, SLIDE_H)).toBeNull();
  });
});

describe("checkHorizontalClip (com)", () => {
  it("flags no-wrap text wider than its own box", () => {
    // available width = 400 - 4 - 4 = 392; bound 400 > 394
    expect(checkHorizontalClip(m({ wordWrap: false, boundWidthPt: 400 }))?.checkId).toBe("horizontal-clip");
    expect(checkHorizontalClip(m({ wordWrap: true, boundWidthPt: 4000 }))).toBeNull();   // wrapping boxes never clip horizontally
    expect(checkHorizontalClip(m({ wordWrap: false, boundWidthPt: -1 }))).toBeNull();     // width unknown (PS fallback)
  });
  it("does NOT flag no-wrap text that fits its box but runs past the slide edge — that's checkOutsideSlide's job (no double reporting)", () => {
    // within box: available = 600 - 4 - 4 = 592 > bound 300. Past slide edge:
    // textRight = 1200 + 4 (marginLeftPt) + 300 = 1504 > 1442.
    const shape = m({ wordWrap: false, widthPt: 600, boundWidthPt: 300, leftPt: 1200 });
    expect(checkHorizontalClip(shape)).toBeNull();
    expect(checkOutsideSlide(shape, SLIDE_W, SLIDE_H)?.checkId).toBe("outside-slide");
  });
});

describe("checkSingleLineBreak (com)", () => {
  // line height = 18 × 1.2 = 21.6; threshold = 1.6 × 21.6 = 34.56
  it("flags a grown auto-size box whose text wrapped to multiple lines", () => {
    expect(checkSingleLineBreak(m({ autoSize: 1, boundHeightPt: 45 }))?.checkId).toBe("single-line-break");
  });
  it("does not flag single-line text, non-autosize boxes, or unknown font size", () => {
    expect(checkSingleLineBreak(m({ autoSize: 1, boundHeightPt: 22 }))).toBeNull();
    expect(checkSingleLineBreak(m({ autoSize: 0, boundHeightPt: 45 }))).toBeNull();
    expect(checkSingleLineBreak(m({ autoSize: 1, boundHeightPt: 45, fontSizePt: null }))).toBeNull();
  });
});

describe("checkAutofitShrink (com)", () => {
  it("flags shrink below 80 %, ignores mild shrink and non-autofit", () => {
    expect(checkAutofitShrink(m({}), 62.5)?.checkId).toBe("autofit-shrink");
    expect(checkAutofitShrink(m({}), 90)).toBeNull();
    expect(checkAutofitShrink(m({}), null)).toBeNull();
  });
});

describe("deadspaceFindings (com)", () => {
  const bigEmpty = (slide: number, name: string) => m({ slide, name, heightPt: 200, boundHeightPt: 40 }); // fill 40/192 ≈ 0.21
  const bigFull = (slide: number, name: string) => m({ slide, name, heightPt: 200, boundHeightPt: 150 });
  const small = (slide: number, name: string) => m({ slide, name, heightPt: 40, boundHeightPt: 5 }); // below 60pt — ignored
  it("WARNs a slide where most large boxes are underfilled", () => {
    const findings = deadspaceFindings([bigEmpty(1, "a"), bigEmpty(1, "b"), bigFull(1, "c"), small(1, "d")]);
    const slideWarn = findings.find((f) => f.severity === "WARN");
    expect(slideWarn?.checkId).toBe("deadspace");
    expect(slideWarn?.slide).toBe(1);
  });
  it("stays quiet when large boxes are mostly filled or too few", () => {
    expect(deadspaceFindings([bigFull(1, "a"), bigEmpty(1, "b"), bigFull(1, "c")]).filter((f) => f.severity === "WARN")).toHaveLength(0);
    expect(deadspaceFindings([bigEmpty(1, "a")]).filter((f) => f.severity === "WARN")).toHaveLength(0); // < 2 large boxes
  });
});

describe("calibrationVerdict", () => {
  it("ORs the four signals and names them", () => {
    const v = calibrationVerdict(m({ boundHeightPt: 95, topPt: 760, heightPt: 100 }), null, SLIDE_W, SLIDE_H);
    expect(v.overBudget).toBe(true);
    expect(v.signals).toContain("vertical-overflow");
    expect(v.signals).toContain("outside-slide");
  });
  it("keeps the calibration font-scale signal at 99 % (stricter than the scanner's 80)", () => {
    const v = calibrationVerdict(m({}), 97, SLIDE_W, SLIDE_H);
    expect(v.overBudget).toBe(true);
    expect(v.signals).toContain("autofit-shrink");
  });
  it("clean shape → not over budget, no signals", () => {
    const v = calibrationVerdict(m({}), 100, SLIDE_W, SLIDE_H);
    expect(v).toEqual({ overBudget: false, signals: [] });
  });
});

describe("markerOf", () => {
  it("extracts the leading guillemet marker; null otherwise (unchanged from calibrate)", () => {
    expect(markerOf("«Om oss» Vi genomför")).toBe("Om oss");
    expect(markerOf("Statisk rubrik")).toBeNull();
  });
});

describe("SEVERITIES (ground-truth-tuned contract — see notes/2026-07-14-deck-scan-facit.md)", () => {
  it("pins the tuned mapping: within-box overflow is WARN, FAIL is text-outside-slide + raw-token", () => {
    expect(SEVERITIES["vertical-overflow"]).toBe("WARN");
    expect(SEVERITIES["outside-slide"]).toBe("FAIL");
    expect(SEVERITIES["raw-token"]).toBe("FAIL");
    expect(SEVERITIES["horizontal-clip"]).toBe("WARN");
    expect(SEVERITIES["single-line-break"]).toBe("WARN");
    expect(SEVERITIES["autofit-shrink"]).toBe("WARN");
    expect(SEVERITIES["deadspace"]).toBe("INFO");
  });
});
