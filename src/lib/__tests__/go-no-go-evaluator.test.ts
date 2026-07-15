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
        { index: 1, met: false, coveredBy: null },
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

  it("utesluter leverabler (kind=deliverable) ur go/no-go-underlaget", async () => {
    mockResponse({
      mustRequirements: [],
      winProbability: 60,
      winProbabilityReasoning: "",
      strengths: [],
      gaps: [],
      improvements: [],
      recommendation: "go",
      reasoning: "—",
    });
    const withDeliverable: RfpAnalysis = {
      ...analysis,
      requirements: [
        { category: "Kompetens", description: "KVAL_UNIK", priority: "must", kind: "qualification" },
        { category: "Leverans", description: "LEVERANS_UNIK", priority: "must", kind: "deliverable" },
      ],
    };
    const { evaluateGoNoGo } = await import("../go-no-go-evaluator");
    await evaluateGoNoGo(withDeliverable, team, scored);
    // Underlaget till modellen ska bära kvalifikationskravet men inte leverabeln.
    // (mockStream nollställs inte per test → använd senaste anropet.)
    const sent = JSON.stringify(mockStream.mock.calls.at(-1)![0]);
    expect(sent).toContain("KVAL_UNIK");
    expect(sent).not.toContain("LEVERANS_UNIK");
  });

  it("leaves winProbability untouched when all must-requirements are met", async () => {
    mockResponse({
      mustRequirements: [
        { index: 1, met: true, coveredBy: "Anna" },
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
        { index: 1, met: false, coveredBy: null },
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

  it("suppresses improvements with non-positive estimatedImpact", async () => {
    mockResponse({
      mustRequirements: [
        { index: 1, met: true, coveredBy: "Anna" },
      ],
      winProbability: 65,
      winProbabilityReasoning: "Bra team",
      strengths: [],
      gaps: [],
      improvements: [
        {
          swap: { remove: "Anna", add: "Bo" },
          swapIds: { removeId: "c1", addId: "c2" },
          estimatedImpact: "+0%",
          reason: "Bo täcker bör-krav men Anna bidrar med juridik — bytet ger ingen nettoeffekt",
        },
        {
          swap: { remove: "Anna", add: "Cecilia" },
          swapIds: { removeId: "c1", addId: "c3" },
          estimatedImpact: "+10%",
          reason: "Cecilia har starkare referens",
        },
        {
          swap: { remove: "Anna", add: "David" },
          swapIds: { removeId: "c1", addId: "c4" },
          estimatedImpact: "-5%",
          reason: "David är junior — försämring",
        },
      ],
      recommendation: "go",
      reasoning: "—",
    });

    const { evaluateGoNoGo } = await import("../go-no-go-evaluator");
    const result = await evaluateGoNoGo(analysis, team, scored);
    expect(result.improvements).toHaveLength(1);
    expect(result.improvements[0].estimatedImpact).toBe("+10%");
  });
});

describe("evaluateGoNoGo — index-hydrering av mustRequirements", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("hydrerar ett giltigt index till kravtexten ur den numrerade listan", async () => {
    mockResponse({
      mustRequirements: [{ index: 1, met: true, coveredBy: "Anna" }],
      winProbability: 80,
      winProbabilityReasoning: "Bra team",
      strengths: [],
      gaps: [],
      improvements: [],
      recommendation: "go",
      reasoning: "—",
    });

    const { evaluateGoNoGo } = await import("../go-no-go-evaluator");
    const result = await evaluateGoNoGo(analysis, team, scored);
    expect(result.mustRequirements).toEqual([
      { requirement: "Projektledning", met: true, coveredBy: "Anna" },
    ]);
  });

  it("droppar rader med ogiltigt index och varnar, behåller giltiga rader", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockResponse({
      mustRequirements: [
        { index: 1, met: true, coveredBy: "Anna" },
        // Fixturen har bara ett krav (index 1) — index 99 finns inte.
        { index: 99, met: false, coveredBy: null },
      ],
      winProbability: 80,
      winProbabilityReasoning: "Bra team",
      strengths: [],
      gaps: [],
      improvements: [],
      recommendation: "go",
      reasoning: "—",
    });

    const { evaluateGoNoGo } = await import("../go-no-go-evaluator");
    const result = await evaluateGoNoGo(analysis, team, scored);
    expect(result.mustRequirements).toEqual([
      { requirement: "Projektledning", met: true, coveredBy: "Anna" },
    ]);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("ogiltigt kravindex"));
    warnSpy.mockRestore();
  });

  it("met=false-vägen hydreras korrekt (ingen coveredBy)", async () => {
    mockResponse({
      mustRequirements: [{ index: 1, met: false, coveredBy: null }],
      winProbability: 30,
      winProbabilityReasoning: "Saknar ska-krav",
      strengths: [],
      gaps: ["Saknar projektledning"],
      improvements: [],
      recommendation: "no-go",
      reasoning: "—",
    });

    const { evaluateGoNoGo } = await import("../go-no-go-evaluator");
    const result = await evaluateGoNoGo(analysis, team, scored);
    expect(result.mustRequirements).toEqual([
      { requirement: "Projektledning", met: false, coveredBy: null },
    ]);
    // winProbability-0-regeln (oförändrad från tidigare fix) gäller fortfarande
    // ovanpå den hydrerade listan.
    expect(result.winProbability).toBe(0);
  });
});
