// @vitest-environment node
import { describe, it, expect } from "vitest";
import { matchConsultants, reEvaluateTeam } from "@/lib/consultant-matcher";
import { RfpAnalysis, Consultant, MatchResult, SwapComparison, TeamProposal } from "@/lib/types";

// Minimal mock data — enough to test the prompt + parse logic
const mockAnalysis: RfpAnalysis = {
  title: "Organisationsöversyn",
  client: "Göteborgs stad",
  deadline: "2026-05-01",
  summary: "Översyn av organisationsstruktur inom stadsförvaltningen",
  requirements: [
    { category: "Kompetens", description: "Erfarenhet av organisationsöversyner", priority: "must" },
    { category: "Kompetens", description: "Erfarenhet av offentlig sektor", priority: "must" },
    { category: "Kompetens", description: "Förändringsledning", priority: "should" },
  ],
  evaluationCriteria: [
    { name: "Kompetens", weight: 50, description: "Relevant erfarenhet" },
    { name: "Genomförande", weight: 30, description: "Metodik och plan" },
    { name: "Pris", weight: 20, description: "Timpris" },
  ],
  requiredCompetencies: ["Organisationsöversyner", "Offentlig sektor", "Förändringsledning"],
  estimatedScope: "2 konsulter, 3 månader",
  redFlags: [],
};

const mockConsultants: Consultant[] = [
  {
    id: "c1",
    organizationId: "org1",
    name: "Anna Lindström",
    level: "senior",
    yearsExperience: 12,
    summary: "Senior konsult med fokus på organisationsöversyner i offentlig sektor",
    rawCvText: null,
    competencies: [
      { competency: "Organisationsöversyner", category: "domain" },
      { competency: "Ekonomistyrning", category: "domain" },
      { competency: "Förändringsledning", category: "methodology" },
    ],
    references: [
      { title: "Organisationsöversyn Region Mellansverige", description: "Ledde genomlysning", year: 2024, sector: "public" },
    ],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  },
  {
    id: "c2",
    organizationId: "org1",
    name: "Erik Johansson",
    level: "intermediate",
    yearsExperience: 5,
    summary: "Konsult med erfarenhet av ekonomistyrning och dataanalys",
    rawCvText: null,
    competencies: [
      { competency: "Dataanalys", category: "technical" },
      { competency: "Ekonomistyrning", category: "domain" },
    ],
    references: [
      { title: "Ekonomianalys Borås kommun", description: "Stödde ekonomistyrning", year: 2025, sector: "public" },
    ],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  },
];

describe("matchConsultants", () => {
  it("returns a team proposal with ranked consultants and evaluation", async () => {
    const result: MatchResult = await matchConsultants(mockAnalysis, mockConsultants);

    // Team proposal structure
    expect(result.teamProposal).toHaveProperty("senior");
    expect(result.teamProposal).toHaveProperty("intermediate");
    expect(result.teamProposal).toHaveProperty("junior");

    // At least one senior match (Anna)
    expect(result.teamProposal.senior.length).toBeGreaterThan(0);
    const seniorMatch = result.teamProposal.senior[0];
    expect(seniorMatch.consultantId).toBe("c1");
    expect(seniorMatch.score).toBeGreaterThanOrEqual(0);
    expect(seniorMatch.score).toBeLessThanOrEqual(100);
    expect(seniorMatch.reasoning).toBeTruthy();

    // Evaluation
    expect(result.teamEvaluation.overallFit).toBeTruthy();
    expect(result.teamEvaluation.requirementCoverage).toHaveProperty("must");
    expect(result.teamEvaluation.requirementCoverage.must).toHaveProperty("met");
    expect(result.teamEvaluation.requirementCoverage.must).toHaveProperty("total");
  }, 30000);
});

describe("reEvaluateTeam", () => {
  it("returns a comparison when swapping a consultant", async () => {
    const previousProposal: TeamProposal = {
      senior: [{ consultantId: "c1", consultantName: "Anna Lindström", level: "senior", score: 85, reasoning: "Strong fit" }],
      intermediate: [{ consultantId: "c2", consultantName: "Erik Johansson", level: "intermediate", score: 70, reasoning: "Good support" }],
      junior: [],
    };

    const result: SwapComparison = await reEvaluateTeam(
      mockAnalysis,
      mockConsultants,
      previousProposal
    );

    expect(result.teamProposal).toHaveProperty("senior");
    expect(result.teamEvaluation).toHaveProperty("overallFit");
    expect(result.comparison).toBeTruthy();
  }, 30000);
});
