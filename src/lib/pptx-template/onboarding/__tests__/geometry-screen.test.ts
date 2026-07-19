import { describe, expect, it } from "vitest";
import type { ShapeText, SlideShapes } from "../../introspect/read-pptx";
import { genericGeometricCapacity } from "../../introspect/compute-budgets";
import { screenSlides, TIGHT_BOX_MIN_CHARS } from "../geometry-screen";

// Shared tiny box: small enough that ANY static text overflows it, and its
// own capacity lands well under TIGHT_BOX_MIN_CHARS — both cases exercised
// below derive their expected numbers from genericGeometricCapacity itself
// (the real function under budget) rather than hand-rederiving the formula's
// constants, so the assertions stay honest if the calibration constants ever move.
const TINY_GEOMETRY = { x: 0, y: 0, cx: 300000, cy: 300000 };

function shape(partial: Partial<ShapeText> & { paragraphs: string[] }): ShapeText {
  return {
    paragraphs: partial.paragraphs,
    tokens: partial.tokens ?? [],
    geometry: partial.geometry ?? null,
    fontSizePt: partial.fontSizePt ?? 18,
    lineSpacingPct: partial.lineSpacingPct ?? null,
    autofit: partial.autofit ?? null,
    inGroup: partial.inGroup ?? false,
  };
}

describe("screenSlides", () => {
  it("flags static text that cannot fit its box", () => {
    const text = "x".repeat(300);
    const staticShape = shape({ paragraphs: [text], geometry: TINY_GEOMETRY });
    const capacity = genericGeometricCapacity(staticShape);
    expect(capacity).not.toBeNull();
    expect(text.length).toBeGreaterThan(capacity as number);

    const slides: SlideShapes[] = [
      { source: 1, tokens: [], images: { placed: 0, placeholders: 0 }, tables: [], shapes: [staticShape] },
    ];

    expect(screenSlides(slides)).toEqual([
      {
        slide: 1,
        shape: "0",
        kind: "static-overflow",
        detail: `statisk text ~${text.length} tecken, boxen rymmer ~${capacity}`,
      },
    ]);
  });

  it("flags candidate boxes with capacity under TIGHT_BOX_MIN_CHARS", () => {
    // Empty (token-less, text-less) box — a fillable candidate per candidateSlots'
    // definition (hasGeometry) — whose measured capacity is too small to be a
    // realistic AI-fill target.
    const emptyBox = shape({ paragraphs: [""], geometry: { x: 0, y: 0, cx: 50000, cy: 50000 } });
    const capacity = genericGeometricCapacity(emptyBox);
    expect(capacity).not.toBeNull();
    expect(capacity as number).toBeLessThan(TIGHT_BOX_MIN_CHARS);

    const slides: SlideShapes[] = [
      { source: 2, tokens: [], images: { placed: 0, placeholders: 0 }, tables: [], shapes: [emptyBox] },
    ];

    expect(screenSlides(slides)).toEqual([
      { slide: 2, shape: "0", kind: "tight-box", detail: `boxen rymmer ~${capacity} tecken` },
    ]);
  });

  it("never flags token-bearing or geometry-less shapes", () => {
    const text = "x".repeat(300);
    // Same tiny box as the static-overflow case above, but already instrumented
    // — must never be flagged even though its geometry alone would overflow.
    const tokenBearing = shape({
      paragraphs: [text],
      tokens: ["{Namn}"],
      geometry: TINY_GEOMETRY,
    });
    // Long static text, but the shape inherits its geometry from the layout
    // (readGeometry returns null) — capacity is unmeasurable, so it's skipped.
    const noGeometry = shape({ paragraphs: [text], geometry: null });

    const slides: SlideShapes[] = [
      {
        source: 1,
        tokens: ["{Namn}"],
        images: { placed: 0, placeholders: 0 }, tables: [],
        shapes: [tokenBearing, noGeometry],
      },
    ];

    expect(screenSlides(slides)).toEqual([]);
  });
});
