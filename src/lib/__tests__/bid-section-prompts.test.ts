// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  FORMAT_PROMPTS,
  semanticGuidance,
  BidContext,
} from "../bid-section-prompts";

const mockCtx: BidContext = {
  analysis: {
    title: "Test RFP",
    client: "Test Kund",
    deadline: null,
    summary: "Test",
    requirements: [],
    evaluationCriteria: [],
    requiredCompetencies: [],
    estimatedScope: "3m",
    redFlags: [],
    domain: "IT",
  },
  teamConsultants: [],
  scoredConsultants: [],
  goNoGoResult: {
    mustRequirements: [],
    winProbability: 0,
    winProbabilityReasoning: "",
    strengths: [],
    gaps: [],
    improvements: [],
    recommendation: "go",
    reasoning: "",
  },
};

describe("semanticGuidance", () => {
  it("returns empty string for undefined key", () => {
    expect(semanticGuidance(undefined, "sv")).toBe("");
  });

  it("returns Swedish guidance for known key", () => {
    const text = semanticGuidance("quality", "sv");
    expect(text.length).toBeGreaterThan(0);
    expect(text.toLowerCase()).toContain("kvalitet");
  });

  it("returns English guidance for known key", () => {
    const text = semanticGuidance("quality", "en");
    expect(text.length).toBeGreaterThan(0);
    expect(text.toLowerCase()).toContain("quality");
  });

  it("returns empty string for unknown key", () => {
    expect(semanticGuidance("unknown-key", "sv")).toBe("");
  });
});

describe("FORMAT_PROMPTS", () => {
  it("has entries for all AI-generating formats", () => {
    expect(FORMAT_PROMPTS.prose).toBeDefined();
    expect(FORMAT_PROMPTS.bullets).toBeDefined();
    expect(FORMAT_PROMPTS["three-column"]).toBeDefined();
    expect(FORMAT_PROMPTS.phases).toBeDefined();
    expect(FORMAT_PROMPTS.team).toBeDefined();
    expect(FORMAT_PROMPTS.references).toBeDefined();
  });

  it("prose.system incorporates promptHint and language", () => {
    const system = FORMAT_PROMPTS.prose.system({
      language: "sv",
      promptHint: "Fokusera på digital mognad",
      semanticKey: "understanding",
    });
    expect(system).toContain("Fokusera på digital mognad");
    expect(system.toLowerCase()).toContain("sv");
  });

  it("three-column.system includes columnHints", () => {
    const system = FORMAT_PROMPTS["three-column"].system({
      language: "sv",
      columnHints: ["Nuläge", "Vad vi ser", "Vårt uppdrag"],
      semanticKey: undefined,
    });
    expect(system).toContain("Nuläge");
    expect(system).toContain("Vad vi ser");
    expect(system).toContain("Vårt uppdrag");
  });

  it("userContent formats BidContext", () => {
    const user = FORMAT_PROMPTS.prose.userContent(mockCtx);
    expect(user).toContain("Test RFP");
  });
});
