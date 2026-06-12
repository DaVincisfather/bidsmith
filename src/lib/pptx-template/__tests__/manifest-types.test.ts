// src/lib/pptx-template/__tests__/manifest-types.test.ts
import { describe, it, expect } from "vitest";
import { TemplateManifestSchema } from "../manifest-types";

const validManifest = {
  manifestVersion: 1,
  name: "anbudsmall-v2",
  slides: [
    { source: 1, type: "cover", placeholders: ["{Upphandlingens namn}"] },
    {
      source: 7,
      type: "phase-detail",
      cloneFrom: "phases",
      itemCaps: { activities: 4, deliverables: 3, decisions: 3 },
      placeholders: ["{Mål}", "{Aktiviteter}"],
    },
    { source: 3, type: "prose", variant: "kunden-idag", placeholders: ["{Nuläge}"] },
    { source: 9, type: "static", placeholders: [], imageShapes: { placed: 2, placeholders: 1 } },
  ],
  budgets: { "phases[*].objective": 120 },
  fieldSlides: { "phases[*].objective": 7 },
  excludedSlides: [{ source: 8, reason: "duplikat av slide 7 — illustrativ kopia" }],
};

describe("TemplateManifestSchema", () => {
  it("accepterar ett giltigt manifest", () => {
    expect(TemplateManifestSchema.safeParse(validManifest).success).toBe(true);
  });

  it("avvisar okänd slide-typ", () => {
    const bad = {
      ...validManifest,
      slides: [{ source: 1, type: "hero", placeholders: [] }],
    };
    expect(TemplateManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("avvisar variant på icke-prose", () => {
    const bad = {
      ...validManifest,
      slides: [{ source: 1, type: "cover", variant: "vision", placeholders: [] }],
    };
    expect(TemplateManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("avvisar manifestVersion ≠ 1", () => {
    expect(
      TemplateManifestSchema.safeParse({ ...validManifest, manifestVersion: 2 }).success,
    ).toBe(false);
  });
});
