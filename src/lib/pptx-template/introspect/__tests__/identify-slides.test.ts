// src/lib/pptx-template/introspect/__tests__/identify-slides.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "fs/promises";
import path from "path";
import { readPptxSlides, type SlideShapes } from "../read-pptx";
import { identifySlides } from "../identify-slides";

const TEMPLATE = path.resolve("templates", "anbudsmall-v2.pptx");

describe("identifySlides (anbudsmall-v2.pptx)", () => {
  let slides: SlideShapes[];
  beforeAll(async () => {
    slides = await readPptxSlides(await readFile(TEMPLATE));
  });

  it("reproducerar registryts slide-konfiguration", () => {
    const { included } = identifySlides(slides);
    expect(
      included.map(({ source, type, variant, cloneFrom, itemCaps }) => ({
        source, type, variant, cloneFrom, itemCaps,
      })),
    ).toEqual([
      { source: 1,  type: "cover", variant: undefined, cloneFrom: undefined, itemCaps: undefined },
      { source: 2,  type: "toc", variant: undefined, cloneFrom: undefined, itemCaps: undefined },
      { source: 3,  type: "prose", variant: "kunden-idag", cloneFrom: undefined, itemCaps: undefined },
      { source: 4,  type: "prose", variant: "uppdraget", cloneFrom: undefined, itemCaps: undefined },
      { source: 5,  type: "prose", variant: "vision", cloneFrom: undefined, itemCaps: undefined },
      { source: 6,  type: "phases-overview", variant: undefined, cloneFrom: undefined, itemCaps: { phases: 4 } },
      { source: 7,  type: "phase-detail", variant: undefined, cloneFrom: "phases",
        itemCaps: { activities: 4, deliverables: 3, decisions: 3 } },
      { source: 11, type: "quality-assurance", variant: undefined, cloneFrom: undefined, itemCaps: undefined },
      { source: 12, type: "team-pricing", variant: undefined, cloneFrom: undefined, itemCaps: undefined },
      { source: 13, type: "requirement-matrix", variant: undefined, cloneFrom: undefined, itemCaps: undefined },
      { source: 14, type: "reference", variant: undefined, cloneFrom: "references", itemCaps: undefined },
      { source: 16, type: "confidentiality", variant: undefined, cloneFrom: undefined, itemCaps: undefined },
      { source: 17, type: "certifications", variant: undefined, cloneFrom: undefined, itemCaps: undefined },
    ]);
  });

  it("exkluderar illustrativa kopior med dublettorsak", () => {
    const { excluded } = identifySlides(slides);
    expect(excluded.map((e) => e.source).sort((a, b) => a - b)).toEqual([8, 9, 10, 15]);
    expect(excluded.find((e) => e.source === 8)!.reason).toMatch(/duplikat av slide 7/);
  });

  it("token-fri slide MED bilder blir static, inte exkluderad", () => {
    const synthetic: SlideShapes[] = [
      { source: 1, shapes: [], tokens: ["{Upphandlingens namn}", "{Kundnamn}", "{Anbudsdatum}"],
        images: { placed: 0, placeholders: 0 } },
      { source: 2, shapes: [], tokens: [],
        images: { placed: 0, placeholders: 0 } },           // → toc (första token-fria utan bild)
      { source: 3, shapes: [], tokens: ["{Bolagsnamn}"],
        images: { placed: 2, placeholders: 1 } },           // → static (bildavdelare)
      { source: 4, shapes: [], tokens: [],
        images: { placed: 0, placeholders: 0 } },           // → exkluderad
    ];
    const { included, excluded } = identifySlides(synthetic);
    expect(included.find((s) => s.source === 3)).toEqual({
      source: 3, type: "static", placeholders: ["{Bolagsnamn}"],
      imageShapes: { placed: 2, placeholders: 1 },
    });
    expect(included.find((s) => s.source === 2)!.type).toBe("toc");
    expect(excluded.map((e) => e.source)).toEqual([4]);
  });
});
