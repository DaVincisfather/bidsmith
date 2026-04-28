import { describe, it, expect } from "vitest";
import { buildEvalBidContext, analyzerGoldenToRfpAnalysis } from "../bid-generator-context";
import type { AnalyzerFixture, SyntheticConsultant } from "../../core/fixtures";

const ANALYZER_FIXTURE: AnalyzerFixture = {
  id: "_stub",
  rfp_text: "...",
  golden: {
    title: "T",
    client: "C",
    deadline: "2026-06-15",
    summary: "S",
    domain: "IT",
    requirements: [
      { category: "k1", description: "must req", priority: "must" },
      { category: "k2", description: "should req", priority: "should" },
    ],
    evaluationCriteria: [{ name: "Kvalitet", weight: 60, description: "X" }],
    requiredCompetencies: ["x"],
    estimatedScope: "scope",
    redFlags: [],
    oslReference: null,
    secrecyRows: [],
  },
};

const CONSULTANTS: SyntheticConsultant[] = [
  {
    id: "c1",
    match_profile: { intent: "x", cv_format: "x", must_haves_demonstrated: [] },
    cv_text: "cv1",
    parsed_profile: {
      name: "Anna",
      level: "senior",
      yearsExperience: 10,
      summary: "S",
      competencies: [{ name: "x", category: "domain" }],
      projects: [{ client: "X", role: "R", years: "2020-2022", description: "d", sector: "private" }],
    },
  },
];

describe("buildEvalBidContext", () => {
  it("builds context from analyzer fixture + consultants", () => {
    const ctx = buildEvalBidContext(ANALYZER_FIXTURE, CONSULTANTS);
    expect(ctx.analysis.title).toBe("T");
    expect(ctx.teamConsultants).toHaveLength(1);
    expect(ctx.teamConsultants[0].name).toBe("Anna");
    expect(ctx.scoredConsultants).toHaveLength(1);
    expect(ctx.scoredConsultants[0].consultantId).toBe("c1");
    expect(ctx.goNoGoResult.recommendation).toBe("go");
    expect(ctx.goNoGoResult.mustRequirements).toHaveLength(1);
  });

  it("passes through annotated competency category and project sector", () => {
    const ctx = buildEvalBidContext(ANALYZER_FIXTURE, CONSULTANTS);
    expect(ctx.teamConsultants[0].competencies).toEqual([
      { competency: "x", category: "domain" },
    ]);
    expect(ctx.teamConsultants[0].references[0].sector).toBe("private");
  });
});

describe("analyzerGoldenToRfpAnalysis", () => {
  it("maps all required fields and leaves optional ones undefined", () => {
    const analysis = analyzerGoldenToRfpAnalysis(ANALYZER_FIXTURE.golden);
    expect(analysis.title).toBe("T");
    expect(analysis.client).toBe("C");
    expect(analysis.deadline).toBe("2026-06-15");
    expect(analysis.summary).toBe("S");
    expect(analysis.domain).toBe("IT");
    expect(analysis.requirements).toEqual(ANALYZER_FIXTURE.golden.requirements);
    expect(analysis.evaluationCriteria).toEqual(ANALYZER_FIXTURE.golden.evaluationCriteria);
    expect(analysis.requiredCompetencies).toEqual(["x"]);
    expect(analysis.estimatedScope).toBe("scope");
    expect(analysis.redFlags).toEqual([]);
    expect(analysis.oslReference).toBeNull();
    expect(analysis.secrecyRows).toEqual([]);
    // Analyzer fixture doesn't carry these — they should be undefined.
    expect(analysis.background).toBeUndefined();
    expect(analysis.diaryNumber).toBeUndefined();
  });

  it("preserves null deadline", () => {
    const analysis = analyzerGoldenToRfpAnalysis({
      ...ANALYZER_FIXTURE.golden,
      deadline: null,
    });
    expect(analysis.deadline).toBeNull();
  });
});
