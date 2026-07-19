import { describe, expect, it } from "vitest";
import { defectsFromMeasurement } from "../empty-scan";
import type { MeasurementFile, ShapeMeasurementV2 } from "../types";

const shape = (over: Partial<ShapeMeasurementV2>): ShapeMeasurementV2 => ({
  slide: 1, name: "Text 1", topPt: 100, leftPt: 10, widthPt: 200, heightPt: 50,
  boundHeightPt: 50, boundWidthPt: 200, marginTopPt: 0, marginBottomPt: 0,
  marginLeftPt: 0, marginRightPt: 0, wordWrap: true, autoSize: 0,
  fontSizePt: 12, textPrefix: "x", textLength: 1, ...over,
});

describe("defectsFromMeasurement", () => {
  it("maps FAIL findings and gross overflows to defects carrying the note", () => {
    const measured: MeasurementFile = {
      slideCount: 1, slideWidthPt: 960, slideHeightPt: 540,
      shapes: [
        // bottom = topPt + boundHeightPt long past slideHeight ⇒ outside-slide FAIL
        shape({ name: "Utanför", topPt: 520, boundHeightPt: 100 }),
        // boundHeight >> heightPt ⇒ gross overflow per gates-predikatet
        shape({ name: "Grov", slide: 2, heightPt: 20, boundHeightPt: 200 }),
      ],
    };
    const out = defectsFromMeasurement(measured, new Map(), "tom originalmall");
    expect(out.some((d) => d.checkId === "outside-slide" && d.shape === "Utanför")).toBe(true);
    const gross = out.find((d) => d.checkId === "gross-overflow" && d.shape === "Grov");
    expect(gross?.baselineBoundHeightPt).toBe(200);
    expect(out.every((d) => d.note === "tom originalmall")).toBe(true);
  });
});
