import { describe, it, expect } from "vitest";
import { OpportunityScoreSchema } from "@/lib/ai-schemas";

describe("OpportunityScoreSchema", () => {
  it("accepts valid score response", () => {
    const valid = {
      relevanceScore: 85,
      reasoning: "Stark match mot ekonomistyrning.",
    };
    expect(OpportunityScoreSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects score outside 0-100", () => {
    const invalid = { relevanceScore: 150, reasoning: "test" };
    expect(OpportunityScoreSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects missing reasoning", () => {
    const invalid = { relevanceScore: 50 };
    expect(OpportunityScoreSchema.safeParse(invalid).success).toBe(false);
  });
});
