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

function makeConsultant(id: string, name: string): Consultant {
  return {
    id,
    name,
    level: "senior",
    yearsExperience: 10,
    summary: "Lead",
    rawCvText: null,
    competencies: [],
    references: [],
    createdAt: "",
    updatedAt: "",
  };
}

// Team fixtures for the add-suggestion filter tests: size relative to
// MAX_TEAM_SIZE (5) decides whether a "add" suggestion has a free slot.
const teamOfThree: Consultant[] = [
  makeConsultant("c1", "Anna"),
  makeConsultant("c2", "Bo"),
  makeConsultant("c3", "Cecilia"),
];

const teamOfFive: Consultant[] = [
  makeConsultant("c1", "Anna"),
  makeConsultant("c2", "Bo"),
  makeConsultant("c3", "Cecilia"),
  makeConsultant("c4", "David"),
  makeConsultant("c5", "Erik"),
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
      poolGap: null,
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
      poolGap: null,
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
      poolGap: null,
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
      poolGap: null,
      recommendation: "no-go",
      reasoning: "—",
    });

    const { evaluateGoNoGo } = await import("../go-no-go-evaluator");
    const result = await evaluateGoNoGo(analysis, team, scored);
    expect(result.winProbability).toBe(0);
  });

  it("suppresses improvements whose upper impact bound is not positive", async () => {
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
          kind: "swap",
          swap: { remove: "Anna", add: "Bo" },
          swapIds: { removeId: "c1", addId: "c2" },
          estimatedImpactMin: 0,
          estimatedImpactMax: 0,
          reason: "Bo täcker bör-krav men Anna bidrar med juridik — bytet ger ingen nettoeffekt",
        },
        {
          kind: "swap",
          swap: { remove: "Anna", add: "Cecilia" },
          swapIds: { removeId: "c1", addId: "c3" },
          estimatedImpactMin: 4,
          estimatedImpactMax: 10,
          reason: "Cecilia har starkare referens",
        },
        {
          kind: "swap",
          swap: { remove: "Anna", add: "David" },
          swapIds: { removeId: "c1", addId: "c4" },
          estimatedImpactMin: -5,
          estimatedImpactMax: -2,
          reason: "David är junior — försämring",
        },
      ],
      poolGap: null,
      recommendation: "go",
      reasoning: "—",
    });

    const { evaluateGoNoGo } = await import("../go-no-go-evaluator");
    const result = await evaluateGoNoGo(analysis, team, scored);
    expect(result.improvements).toHaveLength(1);
    expect(result.improvements[0].estimatedImpact).toBe("+4–10 %");
    expect(result.improvements[0].estimatedImpactMin).toBe(4);
    expect(result.improvements[0].estimatedImpactMax).toBe(10);
  });

  it("normalizes an inverted span (model slip) and synthesizes the display string", async () => {
    mockResponse({
      mustRequirements: [{ index: 1, met: true, coveredBy: "Anna" }],
      winProbability: 65,
      winProbabilityReasoning: "Bra team",
      strengths: [],
      gaps: [],
      improvements: [
        {
          kind: "swap",
          swap: { remove: "Anna", add: "Cecilia" },
          swapIds: { removeId: "c1", addId: "c3" },
          estimatedImpactMin: 9,
          estimatedImpactMax: 4,
          reason: "Omkastat spann",
        },
      ],
      poolGap: null,
      recommendation: "go",
      reasoning: "—",
    });

    const { evaluateGoNoGo } = await import("../go-no-go-evaluator");
    const result = await evaluateGoNoGo(analysis, team, scored);
    expect(result.improvements).toHaveLength(1);
    expect(result.improvements[0].estimatedImpactMin).toBe(4);
    expect(result.improvements[0].estimatedImpactMax).toBe(9);
    expect(result.improvements[0].estimatedImpact).toBe("+4–9 %");
  });

  it("renders a collapsed span (min === max) as a single value", async () => {
    mockResponse({
      mustRequirements: [{ index: 1, met: true, coveredBy: "Anna" }],
      winProbability: 65,
      winProbabilityReasoning: "Bra team",
      strengths: [],
      gaps: [],
      improvements: [
        {
          kind: "swap",
          swap: { remove: "Anna", add: "Cecilia" },
          swapIds: { removeId: "c1", addId: "c3" },
          estimatedImpactMin: 7,
          estimatedImpactMax: 7,
          reason: "Punktspann",
        },
      ],
      poolGap: null,
      recommendation: "go",
      reasoning: "—",
    });

    const { evaluateGoNoGo } = await import("../go-no-go-evaluator");
    const result = await evaluateGoNoGo(analysis, team, scored);
    expect(result.improvements[0].estimatedImpact).toBe("+7 %");
  });

  it("keeps a valid add suggestion when the team has a free slot", async () => {
    mockResponse({
      mustRequirements: [{ index: 1, met: true, coveredBy: "Anna" }],
      winProbability: 72,
      winProbabilityReasoning: "Bra team med en ledig plats",
      strengths: [],
      gaps: [],
      improvements: [
        {
          kind: "add",
          swap: { remove: null, add: "Aram" },
          swapIds: { removeId: null, addId: "id-aram" },
          estimatedImpactMin: 2,
          estimatedImpactMax: 6,
          reason: "Aram täcker ska-krav Z som ingen i teamet täcker; teamet har en ledig plats",
        },
      ],
      poolGap: null,
      recommendation: "go",
      reasoning: "—",
    });

    const { evaluateGoNoGo } = await import("../go-no-go-evaluator");
    const result = await evaluateGoNoGo(analysis, teamOfThree, scored);
    expect(result.improvements).toHaveLength(1);
    expect(result.improvements[0].kind).toBe("add");
  });

  it("drops an add suggestion when the analysis's team-size hint caps the team below MAX_TEAM_SIZE", async () => {
    mockResponse({
      mustRequirements: [{ index: 1, met: true, coveredBy: "Anna" }],
      winProbability: 72,
      winProbabilityReasoning: "Bra team men underlaget tillåter inte fler",
      strengths: [],
      gaps: [],
      improvements: [
        {
          kind: "add",
          swap: { remove: null, add: "Aram" },
          swapIds: { removeId: null, addId: "id-aram" },
          estimatedImpactMin: 2,
          estimatedImpactMax: 6,
          reason: "Aram täcker ska-krav Z, men underlaget anger max 2 konsulter",
        },
      ],
      poolGap: null,
      recommendation: "go",
      reasoning: "—",
    });

    const hintedAnalysis: RfpAnalysis = {
      ...analysis,
      teamSizeHint: { min: 1, max: 2 },
    };
    const teamOfTwo: Consultant[] = [makeConsultant("c1", "Anna"), makeConsultant("c2", "Bo")];

    const { evaluateGoNoGo } = await import("../go-no-go-evaluator");
    const result = await evaluateGoNoGo(hintedAnalysis, teamOfTwo, scored);
    expect(result.improvements).toHaveLength(0);
  });

  it("drops an add suggestion when the team is at MAX_TEAM_SIZE (legacy analysis, no team-size hint)", async () => {
    mockResponse({
      mustRequirements: [{ index: 1, met: true, coveredBy: "Anna" }],
      winProbability: 72,
      winProbabilityReasoning: "Bra team men fullt",
      strengths: [],
      gaps: [],
      improvements: [
        {
          kind: "add",
          swap: { remove: null, add: "Aram" },
          swapIds: { removeId: null, addId: "id-aram" },
          estimatedImpactMin: 2,
          estimatedImpactMax: 6,
          reason: "Aram täcker ska-krav Z, men teamet har inga lediga platser",
        },
      ],
      poolGap: null,
      recommendation: "go",
      reasoning: "—",
    });

    const { evaluateGoNoGo } = await import("../go-no-go-evaluator");
    const result = await evaluateGoNoGo(analysis, teamOfFive, scored);
    expect(result.improvements).toHaveLength(0);
  });

  it("drops an add suggestion whose upper impact bound is not positive", async () => {
    mockResponse({
      mustRequirements: [{ index: 1, met: true, coveredBy: "Anna" }],
      winProbability: 72,
      winProbabilityReasoning: "Bra team",
      strengths: [],
      gaps: [],
      improvements: [
        {
          kind: "add",
          swap: { remove: null, add: "Aram" },
          swapIds: { removeId: null, addId: "id-aram" },
          estimatedImpactMin: 0,
          estimatedImpactMax: 0,
          reason: "Ingen nettoeffekt",
        },
        {
          kind: "add",
          swap: { remove: null, add: "Bea" },
          swapIds: { removeId: null, addId: "id-bea" },
          estimatedImpactMin: -3,
          estimatedImpactMax: 0,
          reason: "Övre gränsen är noll — kan inte förbättra teamet",
        },
      ],
      poolGap: null,
      recommendation: "go",
      reasoning: "—",
    });

    const { evaluateGoNoGo } = await import("../go-no-go-evaluator");
    const result = await evaluateGoNoGo(analysis, teamOfThree, scored);
    expect(result.improvements).toHaveLength(0);
  });

  it("drops a kind:add entry that still carries a remove (malformed)", async () => {
    mockResponse({
      mustRequirements: [{ index: 1, met: true, coveredBy: "Anna" }],
      winProbability: 72,
      winProbabilityReasoning: "Bra team",
      strengths: [],
      gaps: [],
      improvements: [
        {
          kind: "add",
          swap: { remove: "Anna", add: "Aram" },
          swapIds: { removeId: "c1", addId: "id-aram" },
          estimatedImpactMin: 2,
          estimatedImpactMax: 6,
          reason: "Malformed: kind add men remove satt",
        },
      ],
      poolGap: null,
      recommendation: "go",
      reasoning: "—",
    });

    const { evaluateGoNoGo } = await import("../go-no-go-evaluator");
    const result = await evaluateGoNoGo(analysis, teamOfThree, scored);
    expect(result.improvements).toHaveLength(0);
  });

  it("drops a kind:add entry whose swapIds.removeId disagrees with swap.remove (malformed)", async () => {
    mockResponse({
      mustRequirements: [{ index: 1, met: true, coveredBy: "Anna" }],
      winProbability: 72,
      winProbabilityReasoning: "Bra team",
      strengths: [],
      gaps: [],
      improvements: [
        {
          kind: "add",
          swap: { remove: null, add: "Aram" },
          swapIds: { removeId: "c1", addId: "id-aram" },
          estimatedImpactMin: 2,
          estimatedImpactMax: 6,
          reason: "Malformed: kind add, swap.remove null men swapIds.removeId satt",
        },
      ],
      poolGap: null,
      recommendation: "go",
      reasoning: "—",
    });

    const { evaluateGoNoGo } = await import("../go-no-go-evaluator");
    const result = await evaluateGoNoGo(analysis, teamOfThree, scored);
    expect(result.improvements).toHaveLength(0);
  });

  it("passes poolGap through and tolerates null", async () => {
    mockResponse({
      mustRequirements: [{ index: 1, met: true, coveredBy: "Anna" }],
      winProbability: 72,
      winProbabilityReasoning: "Bra team",
      strengths: [],
      gaps: ["Timecare-erfarenhet saknas"],
      improvements: [],
      poolGap: "Gapet kräver Timecare-erfarenhet som saknas i poolen",
      recommendation: "go-with-reservations",
      reasoning: "—",
    });

    const { evaluateGoNoGo } = await import("../go-no-go-evaluator");
    const withGap = await evaluateGoNoGo(analysis, team, scored);
    expect(withGap.poolGap).toBe("Gapet kräver Timecare-erfarenhet som saknas i poolen");

    mockResponse({
      mustRequirements: [{ index: 1, met: true, coveredBy: "Anna" }],
      winProbability: 72,
      winProbabilityReasoning: "Bra team",
      strengths: [],
      gaps: [],
      improvements: [],
      poolGap: null,
      recommendation: "go",
      reasoning: "—",
    });

    const withoutGap = await evaluateGoNoGo(analysis, team, scored);
    expect(withoutGap.poolGap).toBeNull();
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
      poolGap: null,
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
      poolGap: null,
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

  it("droppad met=false-rad (ogiltigt index) kringgår inte vinstgrinden — winProbability tvingas till 0", async () => {
    // Grinden ska räkna på PRE-hydrerings-datat: den hydrerade listan
    // innehåller bara den uppfyllda raden, men modellen flaggade ett
    // ouppfyllt ska-krav — det får inte försvinna med den droppade raden.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockResponse({
      mustRequirements: [
        { index: 1, met: true, coveredBy: "Anna" },
        { index: 99, met: false, coveredBy: null },
      ],
      winProbability: 80,
      winProbabilityReasoning: "Bra team",
      strengths: [],
      gaps: [],
      improvements: [],
      poolGap: null,
      recommendation: "go",
      reasoning: "—",
    });

    const { evaluateGoNoGo } = await import("../go-no-go-evaluator");
    const result = await evaluateGoNoGo(analysis, team, scored);
    expect(result.mustRequirements).toEqual([
      { requirement: "Projektledning", met: true, coveredBy: "Anna" },
    ]);
    expect(result.winProbability).toBe(0);
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
      poolGap: null,
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

describe("evaluateGoNoGo — bantad prompt (kostnad/latens)", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  function lastSentContent(): string {
    const call = mockStream.mock.calls.at(-1)![0] as {
      messages: Array<{ content: string }>;
    };
    return call.messages[0].content;
  }

  it("JSON-dumpen saknar requirements-nyckeln — kraven bärs av den numrerade listan", async () => {
    mockResponse({
      mustRequirements: [],
      winProbability: 50,
      winProbabilityReasoning: "",
      strengths: [],
      gaps: [],
      improvements: [],
      poolGap: null,
      recommendation: "go",
      reasoning: "—",
    });

    const { evaluateGoNoGo } = await import("../go-no-go-evaluator");
    await evaluateGoNoGo(analysis, team, scored);
    const content = lastSentContent();
    const rfpAnalysSection = content.split("## RFP-analys\n")[1].split("\n\n## Kvalifikationskrav")[0];
    expect(rfpAnalysSection).not.toContain('"requirements"');
    // Kravet ska fortfarande nå modellen, men bara via den numrerade listan.
    expect(content).toContain("Projektledning");
  });

  it("JSON-dumpen är kompakt (ingen null,2-indentering)", async () => {
    mockResponse({
      mustRequirements: [],
      winProbability: 50,
      winProbabilityReasoning: "",
      strengths: [],
      gaps: [],
      improvements: [],
      poolGap: null,
      recommendation: "go",
      reasoning: "—",
    });

    const { evaluateGoNoGo } = await import("../go-no-go-evaluator");
    await evaluateGoNoGo(analysis, team, scored);
    const content = lastSentContent();
    const rfpAnalysSection = content.split("## RFP-analys\n")[1].split("\n\n## Kvalifikationskrav")[0];
    expect(rfpAnalysSection.includes("\n")).toBe(false);
  });

  it("strippar evidence-fält rekursivt ur JSON-dumpen (källcitat är inte till för AI-prompten)", async () => {
    mockResponse({
      mustRequirements: [],
      winProbability: 50,
      winProbabilityReasoning: "",
      strengths: [],
      gaps: [],
      improvements: [],
      poolGap: null,
      recommendation: "go",
      reasoning: "—",
    });

    // Simulerar ett framtida/nested evidence-fält utanför requirements (som
    // redan tas bort helt) — stripEvidenceFields ska fånga det generiskt.
    const analysisWithEvidence = {
      ...analysis,
      secrecyRows: [
        { reference: "Bilaga 2", scope: "s", justification: "j", evidence: "SHOULD_NOT_LEAK" },
      ],
    } as unknown as RfpAnalysis;

    const { evaluateGoNoGo } = await import("../go-no-go-evaluator");
    await evaluateGoNoGo(analysisWithEvidence, team, scored);
    const content = lastSentContent();
    expect(content).not.toContain("SHOULD_NOT_LEAK");
  });
});
