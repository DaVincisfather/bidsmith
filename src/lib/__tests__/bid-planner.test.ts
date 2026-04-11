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

import { DEFAULT_BID_PLAN } from "../bid-planner";

describe("DEFAULT_BID_PLAN", () => {
  it("is a valid BidPlan", () => {
    expect(BidPlanSchema.safeParse(DEFAULT_BID_PLAN).success).toBe(true);
  });

  it("contains all required semanticKeys", () => {
    const keys = DEFAULT_BID_PLAN.sections
      .map((s) => s.semanticKey)
      .filter((k): k is string => !!k);
    expect(keys).toContain("cover");
    expect(keys).toContain("quality");
    expect(keys).toContain("team");
    expect(keys).toContain("requirement-matrix");
    expect(keys).toContain("references");
    expect(keys).toContain("contact");
    expect(keys).toContain("confidentiality");
  });

  it("puts cover first, confidentiality last", () => {
    const first = DEFAULT_BID_PLAN.sections[0];
    const last = DEFAULT_BID_PLAN.sections[DEFAULT_BID_PLAN.sections.length - 1];
    expect(first.kind).toBe("cover");
    expect(last.semanticKey).toBe("confidentiality");
  });

  it("puts contact second-to-last", () => {
    const secondToLast =
      DEFAULT_BID_PLAN.sections[DEFAULT_BID_PLAN.sections.length - 2];
    expect(secondToLast.semanticKey).toBe("contact");
  });
});
