import { describe, expect, it } from "vitest";
import { markerOf, verdictFor, type ShapeMeasurement } from "../overflow";

function m(over: Partial<ShapeMeasurement>): ShapeMeasurement {
  return {
    slide: 1, name: "TextBox 1", heightPt: 100, boundHeightPt: 50,
    marginTopPt: 4, marginBottomPt: 4, textPrefix: "«X» abc", ...over,
  };
}

describe("verdictFor", () => {
  it("no overflow when text fits inside height minus margins", () => {
    expect(verdictFor(m({ boundHeightPt: 90 }), null)).toBe(false);
  });
  it("overflow when bound height exceeds available height + tolerance", () => {
    // available = 100 - 4 - 4 = 92; 95 > 92 + 2
    expect(verdictFor(m({ boundHeightPt: 95 }), null)).toBe(true);
  });
  it("within tolerance is NOT overflow", () => {
    expect(verdictFor(m({ boundHeightPt: 93 }), null)).toBe(false);
  });
  it("autofit shrink below 99% is overflow even though the text 'fits'", () => {
    expect(verdictFor(m({ boundHeightPt: 50 }), 62.5)).toBe(true);
    expect(verdictFor(m({ boundHeightPt: 50 }), 100)).toBe(false);
  });
});

describe("markerOf", () => {
  it("extracts the guillemet marker", () => {
    expect(markerOf("«Om oss» Vi genomför upp")).toBe("Om oss");
  });
  it("returns null when no marker leads the text", () => {
    expect(markerOf("Statisk rubrik")).toBeNull();
  });
});
