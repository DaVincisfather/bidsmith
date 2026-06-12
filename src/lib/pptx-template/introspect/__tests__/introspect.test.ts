import { describe, it, expect } from "vitest";
import { readFile } from "fs/promises";
import path from "path";
import { introspectTemplate } from "../index";
import { TemplateManifestSchema } from "../../manifest-types";

const TEMPLATE = path.resolve("templates", "anbudsmall-v2.pptx");

describe("introspectTemplate", () => {
  it("producerar ett schemagiltigt manifest för anbudsmall-v2", async () => {
    const { manifest, warnings } = await introspectTemplate(
      await readFile(TEMPLATE),
      "anbudsmall-v2",
    );
    expect(TemplateManifestSchema.safeParse(manifest).success).toBe(true);
    expect(manifest.slides).toHaveLength(13);
    expect(manifest.excludedSlides.map((e) => e.source).sort((a, b) => a - b))
      .toEqual([8, 9, 10, 15]);
    expect(Object.keys(manifest.budgets)).toHaveLength(8);
    expect(warnings).toEqual([]);
  });

  it("committat manifest är schemagiltigt och bär facit-budgetarna", async () => {
    const committed = JSON.parse(
      await readFile(path.resolve("templates", "anbudsmall-v2.manifest.json"), "utf8"),
    );
    const parsed = TemplateManifestSchema.parse(committed);
    expect(parsed.budgets).toEqual({
      "phases[*].name": 40,
      "phases[*].period": 10,
      "phases[*].objective": 120,
      "phases[*].activities[*]": 120,
      "phases[*].deliverables[*]": 100,
      "phases[*].decisions[*]": 100,
      "checkpoints[*]": 80,
      "certs[*].description": 80,
    });
    expect(parsed.fieldSlides["certs[*].description"]).toBe(18);
  });
});
