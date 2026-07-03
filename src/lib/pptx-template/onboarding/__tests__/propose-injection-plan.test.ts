import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ShapeText, SlideShapes } from "../../introspect/read-pptx";
import type { SlotClassification } from "../../introspect/classify-slot";

vi.mock("../../introspect/read-pptx", () => ({
  readPptxSlides: vi.fn(),
}));
vi.mock("../../introspect/classify-slot", () => ({
  classifyForeignSlot: vi.fn(),
}));

import { readPptxSlides } from "../../introspect/read-pptx";
import { classifyForeignSlot } from "../../introspect/classify-slot";
import { candidateSlots, proposeInjectionPlan } from "../propose-injection-plan";

// Hand-built ShapeText — candidateSlots is pure, no pptx needed.
function shape(partial: Partial<ShapeText> & { paragraphs: string[] }): ShapeText {
  return {
    paragraphs: partial.paragraphs,
    tokens: partial.tokens ?? [],
    geometry: partial.geometry ?? null,
    fontSizePt: partial.fontSizePt ?? null,
    lineSpacingPct: partial.lineSpacingPct ?? null,
    autofit: partial.autofit ?? null,
  };
}

const GEO = { x: 0, y: 0, cx: 100, cy: 100 };

function classification(overrides: Partial<SlotClassification> = {}): SlotClassification {
  return {
    capability: "generic-prose",
    intent: "beskriv sektionen",
    confidence: "low",
    name: "Namn",
    ...overrides,
  };
}

const OPTS = { templateId: "tpl-1", name: "Kundmall" };

beforeEach(() => {
  vi.mocked(readPptxSlides).mockReset();
  vi.mocked(classifyForeignSlot).mockReset();
  vi.mocked(classifyForeignSlot).mockResolvedValue(classification());
});

describe("candidateSlots (pure)", () => {
  it("includes token-less shapes with text", () => {
    const slides: SlideShapes[] = [
      { source: 1, tokens: [], images: { placed: 0, placeholders: 0 }, shapes: [shape({ paragraphs: ["Rubrik", "Brödtext"] })] },
    ];
    const result = candidateSlots(slides);
    expect(result).toEqual([{ source: 1, shapeIndex: 0, shapeText: "Rubrik\nBrödtext" }]);
  });

  it("includes an empty box that has geometry (fillable box)", () => {
    const slides: SlideShapes[] = [
      { source: 1, tokens: [], images: { placed: 0, placeholders: 0 }, shapes: [shape({ paragraphs: [""], geometry: GEO })] },
    ];
    const result = candidateSlots(slides);
    expect(result).toEqual([{ source: 1, shapeIndex: 0, shapeText: "" }]);
  });

  it("excludes token-bearing shapes but keeps shapeIndex stable for later shapes", () => {
    const slides: SlideShapes[] = [
      {
        source: 1,
        tokens: ["{Redan}"],
        images: { placed: 0, placeholders: 0 },
        shapes: [
          shape({ paragraphs: ["{Redan}"], tokens: ["{Redan}"] }), // index 0 — excluded
          shape({ paragraphs: ["Fyll mig"] }), // index 1 — candidate
        ],
      },
    ];
    const result = candidateSlots(slides);
    // shapeIndex must be the position among ALL txBody shapes, not the candidate list.
    expect(result).toEqual([{ source: 1, shapeIndex: 1, shapeText: "Fyll mig" }]);
  });

  it("excludes noise shapes with neither text nor geometry", () => {
    const slides: SlideShapes[] = [
      { source: 1, tokens: [], images: { placed: 0, placeholders: 0 }, shapes: [shape({ paragraphs: ["  ", ""] })] },
    ];
    expect(candidateSlots(slides)).toEqual([]);
  });
});

describe("proposeInjectionPlan", () => {
  function oneSlide(shapes: ShapeText[]): SlideShapes[] {
    return [{ source: 1, tokens: [], images: { placed: 0, placeholders: 0 }, shapes }];
  }

  it("passes the OTHER shapes' text as slideText, excluding the candidate's own", async () => {
    vi.mocked(readPptxSlides).mockResolvedValue(
      oneSlide([shape({ paragraphs: ["OWN TEXT"] }), shape({ paragraphs: ["OTHER TEXT"] })]),
    );

    await proposeInjectionPlan(Buffer.from(""), OPTS);

    const ownCall = vi
      .mocked(classifyForeignSlot)
      .mock.calls.find((c) => c[0].shapeText === "OWN TEXT");
    expect(ownCall).toBeDefined();
    expect(ownCall?.[0].slideText).toBe("OTHER TEXT");
    expect(ownCall?.[0].slideText).not.toContain("OWN TEXT");
  });

  it("makes tokens unique on name collision (Namn twice → {Namn} + {Namn 2})", async () => {
    vi.mocked(readPptxSlides).mockResolvedValue(
      oneSlide([shape({ paragraphs: ["a"] }), shape({ paragraphs: ["b"] })]),
    );
    vi.mocked(classifyForeignSlot).mockResolvedValue(classification({ name: "Namn" }));

    const { slots } = await proposeInjectionPlan(Buffer.from(""), OPTS);
    expect(slots.map((s) => s.token)).toEqual(["{Namn}", "{Namn 2}"]);
  });

  it("avoids colliding with tokens ALREADY present in the template", async () => {
    // Partially instrumented template (re-onboarding): shape 0 already carries
    // {Namn}; a generated token colliding with it would make the renderer fill
    // two shapes with the same content. The plan must skip to {Namn 2}.
    vi.mocked(readPptxSlides).mockResolvedValue([
      {
        source: 1,
        tokens: ["{Namn}"],
        images: { placed: 0, placeholders: 0 },
        shapes: [
          shape({ paragraphs: ["{Namn}"], tokens: ["{Namn}"] }), // not a candidate
          shape({ paragraphs: ["fyll mig"] }),
        ],
      },
    ]);
    vi.mocked(classifyForeignSlot).mockResolvedValue(classification({ name: "Namn" }));

    const { slots } = await proposeInjectionPlan(Buffer.from(""), OPTS);
    expect(slots.map((s) => s.token)).toEqual(["{Namn 2}"]);
  });

  it("builds a parseTemplateProfile-valid, all-generic draft profile", async () => {
    vi.mocked(readPptxSlides).mockResolvedValue(oneSlide([shape({ paragraphs: ["a"] })]));

    const { profile } = await proposeInjectionPlan(Buffer.from(""), OPTS);
    expect(profile.profileVersion).toBe(1);
    expect(profile.templateId).toBe("tpl-1");
    expect(profile.name).toBe("Kundmall");
    for (const slide of profile.slides) {
      expect(slide.capability).toBe("generic-prose");
      for (const slot of slide.slots) {
        expect(slot.capability).toBe("generic-prose");
        expect(slot.status).toBe("generic");
        expect(slot.budgetChars).toBeUndefined();
      }
    }
  });

  it("omits slides that have no proposed slots from the draft profile", async () => {
    vi.mocked(readPptxSlides).mockResolvedValue([
      { source: 1, tokens: [], images: { placed: 0, placeholders: 0 }, shapes: [shape({ paragraphs: ["fyll"] })] },
      // slide 2: only a token-bearing shape → no candidate → omitted
      { source: 2, tokens: ["{X}"], images: { placed: 0, placeholders: 0 }, shapes: [shape({ paragraphs: ["{X}"], tokens: ["{X}"] })] },
    ]);

    const { profile } = await proposeInjectionPlan(Buffer.from(""), OPTS);
    expect(profile.slides.map((s) => s.source)).toEqual([1]);
  });

  it("preserves the classified capability on ProposedSlot even when the profile says generic-prose", async () => {
    vi.mocked(readPptxSlides).mockResolvedValue(oneSlide([shape({ paragraphs: ["referenser"] })]));
    vi.mocked(classifyForeignSlot).mockResolvedValue(
      classification({ capability: "references", intent: "referensuppdrag", confidence: "high", name: "Referenser" }),
    );

    const { slots, profile } = await proposeInjectionPlan(Buffer.from(""), OPTS);
    expect(slots[0].capability).toBe("references");
    expect(slots[0].intent).toBe("referensuppdrag");
    expect(slots[0].confidence).toBe("high");
    // The draft profile still maps it to generic-prose — specialised mapping is a later slice.
    expect(profile.slides[0].slots[0].capability).toBe("generic-prose");
    expect(profile.slides[0].slots[0].intent).toBe("referensuppdrag");
  });

  it("threads userId into classifyForeignSlot", async () => {
    vi.mocked(readPptxSlides).mockResolvedValue(oneSlide([shape({ paragraphs: ["a"] })]));

    await proposeInjectionPlan(Buffer.from(""), { ...OPTS, userId: "user-42" });
    expect(vi.mocked(classifyForeignSlot).mock.calls[0][1]).toEqual({ userId: "user-42" });
  });

  it("passes userId null when the caller omits it", async () => {
    vi.mocked(readPptxSlides).mockResolvedValue(oneSlide([shape({ paragraphs: ["a"] })]));

    await proposeInjectionPlan(Buffer.from(""), OPTS);
    expect(vi.mocked(classifyForeignSlot).mock.calls[0][1]).toEqual({ userId: null });
  });

  it("throws when there are no candidate slots — nothing to onboard", async () => {
    vi.mocked(readPptxSlides).mockResolvedValue(
      oneSlide([shape({ paragraphs: [""] })]), // no text, no geometry → not a candidate
    );

    await expect(proposeInjectionPlan(Buffer.from(""), OPTS)).rejects.toThrow(
      "no candidate slots",
    );
    expect(classifyForeignSlot).not.toHaveBeenCalled();
  });
});
