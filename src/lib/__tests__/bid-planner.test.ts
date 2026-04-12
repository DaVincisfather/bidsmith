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

import { vi, beforeEach } from "vitest";
import type { BidContext } from "../bid-section-prompts";

const mockCreate = vi.hoisted(() => vi.fn());
vi.mock("@anthropic-ai/sdk", () => ({
  default: function () {
    return { messages: { create: mockCreate } };
  },
}));

const minimalCtx: BidContext = {
  analysis: {
    title: "Test RFP",
    client: "Test Kund",
    deadline: null,
    summary: "Digital transformation",
    requirements: [
      { category: "Kompetens", description: "Projektledning", priority: "must" },
    ],
    evaluationCriteria: [],
    requiredCompetencies: [],
    estimatedScope: "3 months",
    redFlags: [],
    domain: "IT",
  },
  teamConsultants: [
    {
      id: "c1",
      organizationId: "org1",
      name: "Anna",
      level: "senior",
      yearsExperience: 10,
      summary: "Lead",
      rawCvText: null,
      competencies: [{ competency: "PM", category: "methodology" }],
      references: [],
      createdAt: "",
      updatedAt: "",
    },
  ],
  scoredConsultants: [
    { consultantId: "c1", consultantName: "Anna", level: "senior", score: 90, reasoning: "Fit" },
  ],
  goNoGoResult: {
    mustRequirements: [],
    winProbability: 70,
    winProbabilityReasoning: "",
    strengths: [],
    gaps: [],
    improvements: [],
    recommendation: "go",
    reasoning: "",
  },
};

const validPlanJson = JSON.stringify({
  language: "sv",
  sections: [
    { kind: "cover", semanticKey: "cover" },
    { kind: "prose", title: "Förståelse", promptHint: "x", semanticKey: "understanding" },
    { kind: "team", title: "Team", semanticKey: "team" },
    { kind: "placeholder", title: "Kontakt", instruction: "x", semanticKey: "contact" },
    { kind: "placeholder", title: "Sekretess", instruction: "x", semanticKey: "confidentiality" },
  ],
});

describe("planBid", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("returns a parsed BidPlan on happy path", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: validPlanJson }],
    });
    const { planBid } = await import("../bid-planner");
    const plan = await planBid(minimalCtx);
    expect(plan.language).toBe("sv");
    expect(plan.sections[0].kind).toBe("cover");
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("retries once with sharpened prompt on invalid JSON", async () => {
    mockCreate
      .mockResolvedValueOnce({
        content: [{ type: "text", text: "not json at all" }],
      })
      .mockResolvedValueOnce({
        content: [{ type: "text", text: validPlanJson }],
      });
    const { planBid } = await import("../bid-planner");
    const plan = await planBid(minimalCtx);
    expect(plan.sections.length).toBeGreaterThan(0);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    // Sharpened retry: second call's system prompt mentions "invalid"
    const secondCall = mockCreate.mock.calls[1][0];
    expect(String(secondCall.system).toLowerCase()).toContain("invalid");
  });

  it("throws after retry also fails", async () => {
    mockCreate
      .mockResolvedValueOnce({ content: [{ type: "text", text: "nope" }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "still nope" }] });
    const { planBid } = await import("../bid-planner");
    await expect(planBid(minimalCtx)).rejects.toThrow();
  });
});

describe("planBidOrFallback", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("returns planner output on success", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: validPlanJson }],
    });
    const { planBidOrFallback } = await import("../bid-planner");
    const plan = await planBidOrFallback(minimalCtx);
    expect(plan.sections[0].kind).toBe("cover");
  });

  it("falls back to DEFAULT_BID_PLAN on persistent failure", async () => {
    mockCreate
      .mockResolvedValueOnce({ content: [{ type: "text", text: "bad" }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "bad" }] });
    const { planBidOrFallback, DEFAULT_BID_PLAN } = await import("../bid-planner");
    const plan = await planBidOrFallback(minimalCtx);
    expect(plan).toEqual(DEFAULT_BID_PLAN);
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
