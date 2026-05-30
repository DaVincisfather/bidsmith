import type {
  Consultant,
  GoNoGoResult,
  RfpAnalysis,
  ScoredConsultant,
} from "@/lib/types";
import type { BidContext } from "@/lib/bid-generator";
import type { AnalyzerFixture, SyntheticConsultant } from "../core/fixtures";

const NOW = "2026-04-28T00:00:00.000Z";

// Explicit mapper from analyzer-fixture golden (Zod-inferred) to RfpAnalysis.
// The two shapes overlap but aren't equal — using `as RfpAnalysis` would hide
// structural drift if RfpAnalysis adds a required field. TypeScript will fail
// here instead. background/diaryNumber stay undefined: the analyzer fixture
// doesn't carry them, and they're optional on RfpAnalysis.
export function analyzerGoldenToRfpAnalysis(golden: AnalyzerFixture["golden"]): RfpAnalysis {
  return {
    title: golden.title,
    client: golden.client,
    deadline: golden.deadline,
    summary: golden.summary,
    requirements: golden.requirements,
    evaluationCriteria: golden.evaluationCriteria,
    requiredCompetencies: golden.requiredCompetencies,
    estimatedScope: golden.estimatedScope,
    redFlags: golden.redFlags,
    domain: golden.domain,
    oslReference: golden.oslReference,
    secrecyRows: golden.secrecyRows,
  };
}

function toConsultant(c: SyntheticConsultant): Consultant {
  return {
    id: c.id,
    name: c.parsed_profile.name,
    level: c.parsed_profile.level,
    yearsExperience: c.parsed_profile.yearsExperience,
    summary: c.parsed_profile.summary,
    rawCvText: c.cv_text,
    competencies: c.parsed_profile.competencies.map((cmp) => ({
      competency: cmp.name,
      category: cmp.category,
    })),
    references: c.parsed_profile.projects.map((p) => ({
      title: p.role,
      description: `${p.client}: ${p.description}`,
      year: parseInt(p.years.split("-")[0], 10),
      sector: p.sector,
    })),
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function stubScores(consultants: Consultant[]): ScoredConsultant[] {
  // Rank by input order — deterministic, avoids matcher LLM calls.
  return consultants.map((c, idx) => ({
    consultantId: c.id,
    consultantName: c.name,
    level: c.level,
    score: 100 - idx * 5,
    reasoning: `Eval-harness stub: ranked at position ${idx + 1}`,
  }));
}

function stubGoNoGo(analysis: RfpAnalysis, scored: ScoredConsultant[]): GoNoGoResult {
  const mustReqs = analysis.requirements.filter((r) => r.priority === "must");
  const firstId = scored[0]?.consultantId ?? null;
  return {
    mustRequirements: mustReqs.map((r) => ({
      requirement: r.description,
      met: true,
      coveredBy: firstId,
    })),
    winProbability: 70,
    winProbabilityReasoning: "Eval-harness stub.",
    strengths: ["Eval-harness stub strength."],
    gaps: [],
    improvements: [],
    recommendation: "go",
    reasoning: "Eval-harness stub: always go for evaluator runs.",
  };
}

export function buildEvalBidContext(
  analyzerFixture: AnalyzerFixture,
  consultants: SyntheticConsultant[],
): BidContext {
  const analysis = analyzerGoldenToRfpAnalysis(analyzerFixture.golden);
  const teamConsultants = consultants.map(toConsultant);
  const scoredConsultants = stubScores(teamConsultants);
  const goNoGoResult = stubGoNoGo(analysis, scoredConsultants);
  return { analysis, teamConsultants, scoredConsultants, goNoGoResult };
}
