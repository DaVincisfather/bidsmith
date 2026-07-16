import { describe, it, expect } from "vitest";
import { applyGates } from "../gates";
import type { BidMeasurement, KnownDefect } from "../types";
import type { Finding, ShapeMeasurementV2 } from "@/lib/pptx-template/measure/types";

function shape(over: Partial<ShapeMeasurementV2>): ShapeMeasurementV2 {
  return {
    slide: 1,
    name: "Text 1",
    topPt: 0,
    leftPt: 0,
    widthPt: 100,
    heightPt: 100,
    boundHeightPt: 100,
    boundWidthPt: 100,
    marginTopPt: 0,
    marginBottomPt: 0,
    marginLeftPt: 0,
    marginRightPt: 0,
    wordWrap: true,
    autoSize: 0,
    fontSizePt: 12,
    textPrefix: "x",
    textLength: 100,
    ...over,
  };
}

function fail(slide: number, shapeName: string): Finding {
  return { checkId: "outside-slide", severity: "FAIL", slide, shape: shapeName, detail: "d" };
}

function bid(over: Partial<BidMeasurement>): BidMeasurement {
  return {
    fixtureId: "f1",
    label: "test",
    bidId: "b1",
    findings: [],
    measurement: { slideCount: 1, slideWidthPt: 1440, slideHeightPt: 810, shapes: [] },
    duplicates: [],
    fill: [],
    totalChars: 10000,
    ...over,
  };
}

describe("applyGates", () => {
  it("passerar ett rent anbud", () => {
    const r = applyGates(bid({}), []);
    expect(r.pass).toBe(true);
    expect(r.breaches).toEqual([]);
  });

  it("FAIL-fynd fäller — utom känd-defekt-träffar (exkluderas + rapporteras)", () => {
    const defects: KnownDefect[] = [{ slide: 9, checkId: "outside-slide", shape: "Text 5", note: "statisk" }];
    const r = applyGates(bid({ findings: [fail(9, "Text 5"), fail(4, "Text 21")] }), defects);
    expect(r.pass).toBe(false);
    expect(r.breaches.map((b) => b.gate)).toEqual(["fail-findings"]);
    expect(r.excludedDefects).toHaveLength(1);
  });

  it("grov overflow: kvot > 1,25 fäller, 1,17 gör inte det", () => {
    const grov = shape({ heightPt: 26, boundHeightPt: 216 });
    const kicker = shape({ heightPt: 47, boundHeightPt: 54.81 });
    const r1 = applyGates(bid({ measurement: { slideCount: 1, slideWidthPt: 1440, slideHeightPt: 810, shapes: [grov] } }), []);
    const r2 = applyGates(bid({ measurement: { slideCount: 1, slideWidthPt: 1440, slideHeightPt: 810, shapes: [kicker] } }), []);
    expect(r1.breaches.map((b) => b.gate)).toContain("gross-overflow");
    expect(r2.pass).toBe(true);
  });

  it("absolut överskott > 30pt fäller även under kvoten", () => {
    const s = shape({ heightPt: 392, boundHeightPt: 447.92 }); // 1,14× men +55,9pt
    const r = applyGates(bid({ measurement: { slideCount: 1, slideWidthPt: 1440, slideHeightPt: 810, shapes: [s] } }), []);
    expect(r.breaches.map((b) => b.gate)).toContain("gross-overflow");
  });

  it("känd gross-overflow-defekt (slide+shape+checkId) exkluderas — samma värden på annat shape-namn fäller ändå", () => {
    const knownShape = shape({ heightPt: 26, boundHeightPt: 216, name: "Text 1" });
    const otherShape = shape({ heightPt: 26, boundHeightPt: 216, name: "Text 2" });
    // No baselineBoundHeightPt on the defect — legacy/FAIL-class entries keep the
    // unconditional exclusion behavior the gate had before the magnitude cap.
    const defects: KnownDefect[] = [{ slide: 1, checkId: "gross-overflow", shape: "Text 1", note: "tom originalmall" }];

    const r1 = applyGates(
      bid({ measurement: { slideCount: 1, slideWidthPt: 1440, slideHeightPt: 810, shapes: [knownShape] } }),
      defects,
    );
    expect(r1.pass).toBe(true);
    expect(r1.breaches).toEqual([]);
    expect(r1.excludedGross).toHaveLength(1);
    expect(r1.excludedGross[0].name).toBe("Text 1");

    const r2 = applyGates(
      bid({ measurement: { slideCount: 1, slideWidthPt: 1440, slideHeightPt: 810, shapes: [otherShape] } }),
      defects,
    );
    expect(r2.breaches.map((b) => b.gate)).toContain("gross-overflow");
    expect(r2.excludedGross).toEqual([]);
  });

  it("magnitude-kapad exkludering: shape vid baseline exkluderas, långt över baseline+tolerans fäller", () => {
    // Defect's recorded baseline (empty-substrate measurement) is 216pt.
    const defects: KnownDefect[] = [
      { slide: 1, checkId: "gross-overflow", shape: "Text 1", note: "tom originalmall", baselineBoundHeightPt: 216 },
    ];

    const atBaseline = shape({ heightPt: 26, boundHeightPt: 216, name: "Text 1" });
    const rAtBaseline = applyGates(
      bid({ measurement: { slideCount: 1, slideWidthPt: 1440, slideHeightPt: 810, shapes: [atBaseline] } }),
      defects,
    );
    expect(rAtBaseline.pass).toBe(true);
    expect(rAtBaseline.excludedGross).toHaveLength(1);

    // Inside tolerance (+5pt): still excluded.
    const atTolerance = shape({ heightPt: 26, boundHeightPt: 221, name: "Text 1" });
    const rAtTolerance = applyGates(
      bid({ measurement: { slideCount: 1, slideWidthPt: 1440, slideHeightPt: 810, shapes: [atTolerance] } }),
      defects,
    );
    expect(rAtTolerance.pass).toBe(true);
    expect(rAtTolerance.excludedGross).toHaveLength(1);

    // 50pt past baseline — generated content overflowing far beyond the template's
    // own static defect must breach, not ride the exclusion.
    const farOverBaseline = shape({ heightPt: 26, boundHeightPt: 266, name: "Text 1" });
    const rFarOver = applyGates(
      bid({ measurement: { slideCount: 1, slideWidthPt: 1440, slideHeightPt: 810, shapes: [farOverBaseline] } }),
      defects,
    );
    expect(rFarOver.breaches.map((b) => b.gate)).toContain("gross-overflow");
    expect(rFarOver.excludedGross).toEqual([]);
  });

  it("dubblettpar, undermålig fyllnad och volym utanför korridoren fäller", () => {
    const r = applyGates(
      bid({
        duplicates: [{ a: "x", b: "y", slide: 3, similarity: 0.42 }],
        fill: [{ placeholder: "{Metod}", budgetChars: 540, textChars: 100, ratio: 0.19 }],
        totalChars: 4000,
      }),
      [],
    );
    expect(r.breaches.map((b) => b.gate).sort()).toEqual(["duplicates", "min-fill", "volume-corridor"]);
  });
});
