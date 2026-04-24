// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RfpAnalysis, Consultant, ScoredConsultant } from "../types";

const mockCreate = vi.hoisted(() => vi.fn());
const mockStream = vi.hoisted(() =>
  vi.fn((..._args: unknown[]) => {
    const message = mockCreate();
    return { finalMessage: () => Promise.resolve(message) };
  })
);

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: function () {
      return { messages: { stream: mockStream } };
    },
    APIError: class MockAPIError extends Error {
      status?: number;
    },
  };
});

const analysis: RfpAnalysis = {
  title: "Test",
  client: "Kund",
  deadline: null,
  summary: "s",
  requirements: [
    { category: "Kompetens", description: "Projektledning", priority: "must" },
  ],
  evaluationCriteria: [],
  requiredCompetencies: [],
  estimatedScope: "3 mån",
  redFlags: [],
  domain: "IT",
  oslReference: null,
  secrecyRows: [],
};

const team: Consultant[] = [
  {
    id: "c1",
    organizationId: "org1",
    name: "Anna",
    level: "senior",
    yearsExperience: 10,
    summary: "Lead",
    rawCvText: null,
    competencies: [],
    references: [],
    createdAt: "",
    updatedAt: "",
  },
];

const scored: ScoredConsultant[] = [
  { consultantId: "c1", consultantName: "Anna", level: "senior", score: 40, reasoning: "ok" },
];

function mockResponse(payload: unknown) {
  mockCreate.mockResolvedValueOnce({
    content: [{ type: "text", text: JSON.stringify(payload) }],
  });
}

describe("evaluateGoNoGo post-processing", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("forces winProbability to 0 when any must-requirement is unmet", async () => {
    mockResponse({
      mustRequirements: [
        { requirement: "Projektledning", met: false, coveredBy: null },
      ],
      winProbability: 42,
      winProbabilityReasoning: "LLM fudged it",
      strengths: [],
      gaps: ["Saknar projektledning"],
      improvements: [],
      recommendation: "no-go",
      reasoning: "—",
    });

    const { evaluateGoNoGo } = await import("../go-no-go-evaluator");
    const result = await evaluateGoNoGo(analysis, team, scored);
    expect(result.winProbability).toBe(0);
  });

  it("leaves winProbability untouched when all must-requirements are met", async () => {
    mockResponse({
      mustRequirements: [
        { requirement: "Projektledning", met: true, coveredBy: "Anna" },
      ],
      winProbability: 72,
      winProbabilityReasoning: "Bra team",
      strengths: ["Stark senior"],
      gaps: [],
      improvements: [],
      recommendation: "go",
      reasoning: "—",
    });

    const { evaluateGoNoGo } = await import("../go-no-go-evaluator");
    const result = await evaluateGoNoGo(analysis, team, scored);
    expect(result.winProbability).toBe(72);
  });

  it("does not override when LLM already returned 0", async () => {
    mockResponse({
      mustRequirements: [
        { requirement: "Projektledning", met: false, coveredBy: null },
      ],
      winProbability: 0,
      winProbabilityReasoning: "Saknar ska-krav",
      strengths: [],
      gaps: ["Lucka"],
      improvements: [],
      recommendation: "no-go",
      reasoning: "—",
    });

    const { evaluateGoNoGo } = await import("../go-no-go-evaluator");
    const result = await evaluateGoNoGo(analysis, team, scored);
    expect(result.winProbability).toBe(0);
  });
});
