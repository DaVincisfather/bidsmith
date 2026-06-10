import { describe, it, expect } from "vitest";
import { z } from "zod";
import { toStructuredOutputSchema } from "@/lib/structured-output-schema";
import { UnderstandingBundleSchema } from "@/lib/bid-generator/bundles/understanding";

describe("toStructuredOutputSchema", () => {
  it("strippar constraints som structured outputs inte stoder", () => {
    const schema = z.object({
      items: z.array(z.string().min(2)).min(1).max(4),
      score: z.number().min(0).max(100),
    });
    const json = JSON.stringify(toStructuredOutputSchema(schema));
    for (const kw of ["minItems", "maxItems", "minimum", "maximum", "minLength", "maxLength"]) {
      expect(json).not.toContain(`"${kw}"`);
    }
  });

  it("tvingar additionalProperties: false pa alla objektnivaer", () => {
    const schema = z.object({ outer: z.object({ inner: z.string() }) });
    const result = toStructuredOutputSchema(schema) as {
      additionalProperties: boolean;
      properties: { outer: { additionalProperties: boolean } };
    };
    expect(result.additionalProperties).toBe(false);
    expect(result.properties.outer.additionalProperties).toBe(false);
  });

  it("bevarar struktur, enum och required", () => {
    const schema = z.object({
      level: z.enum(["junior", "senior"]),
      name: z.string(),
    });
    const result = toStructuredOutputSchema(schema) as {
      required: string[];
      properties: { level: { enum: string[] } };
    };
    expect(result.required).toEqual(expect.arrayContaining(["level", "name"]));
    expect(result.properties.level.enum).toEqual(["junior", "senior"]);
  });

  it("filtrerar inte fältnamn som råkar heta constraint-nyckelord", () => {
    // Nycklar under "properties" är fältnamn, inte JSON Schema-nyckelord —
    // ett fält döpt "pattern"/"minimum" får inte tyst strykas ur API-schemat.
    const schema = z.object({ pattern: z.string(), minimum: z.number() });
    const result = toStructuredOutputSchema(schema) as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(Object.keys(result.properties)).toEqual(
      expect.arrayContaining(["pattern", "minimum"]),
    );
    expect(result.required).toEqual(expect.arrayContaining(["pattern", "minimum"]));
  });

  it("klarar ett verkligt produktionsschema (smoke)", () => {
    // Kastar toStructuredOutputSchema på något verkligt schema ska det synas
    // i test, inte i drift.
    expect(() => toStructuredOutputSchema(UnderstandingBundleSchema)).not.toThrow();
  });
});
