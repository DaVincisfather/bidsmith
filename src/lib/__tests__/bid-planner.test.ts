// @vitest-environment node
import { describe, it, expect } from "vitest";
import { BidPlanSchema } from "../ai-schemas";
import type { BidPlan } from "../bid-planner";

describe("BidPlanSchema", () => {
  it("parses a minimal valid plan", () => {
    const raw = {
      language: "sv",
      sections: [
        { kind: "cover", semanticKey: "cover" },
        { kind: "placeholder", title: "Kontakt", instruction: "Fyll i", semanticKey: "contact" },
        { kind: "placeholder", title: "Sekretess", instruction: "Boilerplate", semanticKey: "confidentiality" },
      ],
    };
    const result = BidPlanSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      const plan: BidPlan = result.data;
      expect(plan.sections[0].kind).toBe("cover");
    }
  });

  it("rejects unknown kind", () => {
    const raw = {
      language: "sv",
      sections: [{ kind: "unknown-kind", title: "X" }],
    };
    expect(BidPlanSchema.safeParse(raw).success).toBe(false);
  });

  it("rejects missing language", () => {
    const raw = { sections: [{ kind: "cover" }] };
    expect(BidPlanSchema.safeParse(raw).success).toBe(false);
  });

  it("accepts three-column with exactly three column hints", () => {
    const raw = {
      language: "sv",
      sections: [
        {
          kind: "three-column",
          title: "Perspektiv",
          columnHints: ["Nuläge", "Vad vi ser", "Vårt uppdrag"],
        },
      ],
    };
    expect(BidPlanSchema.safeParse(raw).success).toBe(true);
  });

  it("rejects three-column with wrong column count", () => {
    const raw = {
      language: "sv",
      sections: [
        { kind: "three-column", title: "Perspektiv", columnHints: ["A", "B"] },
      ],
    };
    expect(BidPlanSchema.safeParse(raw).success).toBe(false);
  });

  it("accepts optional top-level fields", () => {
    const raw = {
      language: "en",
      sections: [{ kind: "cover" }],
      unmappedRequirements: ["sustainability annex"],
      rationale: "simple structure",
    };
    expect(BidPlanSchema.safeParse(raw).success).toBe(true);
  });
});
