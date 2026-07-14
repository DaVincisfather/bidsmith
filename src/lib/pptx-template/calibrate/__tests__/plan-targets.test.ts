import { describe, expect, it } from "vitest";
import { planTargets, DEFAULT_GUESS } from "../plan-targets";
import type { SlideShapes, ShapeText } from "../../introspect/read-pptx";
import type { TemplateProfile } from "../../template-profile";

function shape(tokens: string[], geometry: ShapeText["geometry"] = null): ShapeText {
  return {
    paragraphs: tokens,
    tokens,
    geometry,
    fontSizePt: 18,
    lineSpacingPct: null,
    autofit: null,
    inGroup: false,
  };
}

// 4x2 cm box ≈ enough for one short line — the exact number comes from
// genericGeometricCapacity; the test only asserts it is used, not its value.
const GEO = { x: 0, y: 0, cx: 1440000, cy: 720000 };

function profileWith(slots: { placeholder: string; status?: "generic" | "skip" }[]): TemplateProfile {
  return {
    profileVersion: 1,
    templateId: "t1",
    name: "Test",
    version: 1,
    slides: [
      {
        source: 1,
        capability: "generic-prose",
        slots: slots.map((s) => ({
          placeholder: s.placeholder,
          capability: "generic-prose" as const,
          format: "prose" as const,
          intent: "",
          status: s.status ?? ("generic" as const),
        })),
      },
    ],
  };
}

describe("planTargets", () => {
  it("emits one target per fillable generic-prose slot with a marker sans braces", () => {
    const slides: SlideShapes[] = [
      { source: 1, shapes: [shape(["{Om oss}"], GEO)], tokens: ["{Om oss}"], images: { placed: 0, placeholders: 0 } },
    ];
    const targets = planTargets(slides, profileWith([{ placeholder: "{Om oss}" }]));
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({ token: "{Om oss}", marker: "Om oss", source: 1, shareCount: 1 });
    expect(targets[0].initialGuess).toBeGreaterThan(0);
    expect(targets[0].geometryMissing).toBe(false);
  });

  it("skips skip-status slots and tokens absent from the pptx", () => {
    const slides: SlideShapes[] = [
      { source: 1, shapes: [shape(["{A}"], GEO)], tokens: ["{A}"], images: { placed: 0, placeholders: 0 } },
    ];
    const targets = planTargets(
      slides,
      profileWith([{ placeholder: "{A}", status: "skip" }, { placeholder: "{Finns ej}" }]),
    );
    expect(targets).toHaveLength(0);
  });

  it("marks shared shapes: two tokens in one shape → shareCount 2 on both", () => {
    const slides: SlideShapes[] = [
      { source: 1, shapes: [shape(["{A}", "{B}"], GEO)], tokens: ["{A}", "{B}"], images: { placed: 0, placeholders: 0 } },
    ];
    const targets = planTargets(slides, profileWith([{ placeholder: "{A}" }, { placeholder: "{B}" }]));
    expect(targets.map((t) => t.shareCount)).toEqual([2, 2]);
  });

  it("falls back to DEFAULT_GUESS with geometryMissing when the shape inherits geometry", () => {
    const slides: SlideShapes[] = [
      { source: 1, shapes: [shape(["{A}"], null)], tokens: ["{A}"], images: { placed: 0, placeholders: 0 } },
    ];
    const [t] = planTargets(slides, profileWith([{ placeholder: "{A}" }]));
    expect(t.initialGuess).toBe(DEFAULT_GUESS);
    expect(t.geometryMissing).toBe(true);
  });
});
