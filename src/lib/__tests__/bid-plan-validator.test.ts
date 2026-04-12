// @vitest-environment node
import { describe, it, expect } from "vitest";
import { validateAndRepair, REQUIRED_SECTIONS } from "../bid-plan-validator";
import { DEFAULT_BID_PLAN } from "../bid-planner";
import type { BidPlan } from "../bid-planner";
import type { BidContext } from "../bid-section-prompts";

const mockCtx: BidContext = {
  analysis: {
    title: "Test RFP",
    client: "Test Kund",
    deadline: null,
    summary: "Test",
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

describe("REQUIRED_SECTIONS", () => {
  it("lists all 7 required semantic keys", () => {
    const keys = REQUIRED_SECTIONS.map((r) => r.semanticKey);
    expect(keys).toEqual([
      "cover",
      "quality",
      "team",
      "requirement-matrix",
      "references",
      "contact",
      "confidentiality",
    ]);
  });
});

describe("validateAndRepair — passthrough", () => {
  it("returns DEFAULT_BID_PLAN unchanged (already valid)", () => {
    const result = validateAndRepair(DEFAULT_BID_PLAN, mockCtx);
    expect(result.sections.length).toBe(DEFAULT_BID_PLAN.sections.length);
    expect(result.sections[0].kind).toBe("cover");
  });

  it("does not mutate input plan", () => {
    const plan: BidPlan = JSON.parse(JSON.stringify(DEFAULT_BID_PLAN));
    const snapshot = JSON.stringify(plan);
    validateAndRepair(plan, mockCtx);
    expect(JSON.stringify(plan)).toBe(snapshot);
  });
});
