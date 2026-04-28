import path from "path";
import fs from "fs/promises";
import { matchConsultants } from "@/lib/consultant-matcher";
import type { Consultant, RfpAnalysis, ScoredMatchResult } from "@/lib/types";
import { MatcherFixtureSchema, AnalyzerFixtureSchema, type MatcherFixture, type AnalyzerFixture, type SyntheticConsultant } from "../core/fixtures";
import { loadFixtureFromString } from "../core/fixture-loader";
import { loadConsultantPool, getConsultantsByIds } from "../core/consultant-pool";
import { sonnetMhcJudge, haikuRubricJudge } from "../core/judges";
import { hitAtK, aggregateMhc, meanMetric } from "../core/metrics";
import type { EvalConfig, FieldJudgment } from "../core/types";

type Output = ScoredMatchResult;

interface MatcherEvalContext {
  fixture: MatcherFixture;
  analyzerFixture: AnalyzerFixture;
  consultants: SyntheticConsultant[];
}

const POOL_PATH = path.resolve(process.cwd(), "evals/fixtures/consultants/synthetic-pool.yaml");
const ANALYZER_FIXTURE_DIR = path.resolve(process.cwd(), "evals/fixtures/analyzer");

async function loadContext(fixture: MatcherFixture): Promise<MatcherEvalContext> {
  const analyzerPath = path.join(ANALYZER_FIXTURE_DIR, `${fixture.analyzer_fixture}.yaml`);
  const analyzerContent = await fs.readFile(analyzerPath, "utf-8");
  const analyzerFixture = loadFixtureFromString(
    analyzerContent, AnalyzerFixtureSchema, path.basename(analyzerPath)
  );
  const pool = await loadConsultantPool(POOL_PATH);
  const consultants = getConsultantsByIds(pool, fixture.consultant_ids);
  return { fixture, analyzerFixture, consultants };
}

export function computeMatcherMetrics(
  judgments: FieldJudgment[],
  threshold: number
): Record<string, number> {
  const metrics: Record<string, number> = {};

  // MHC aggregation from mhc.<id>.* judgments
  const mhcEntries = judgments
    .filter((j) => j.judge === "sonnet-mhc" && j.field.startsWith("mhc."))
    .map((j) => {
      const parts = j.field.split(".");  // mhc, <consultantId>, <category>
      return {
        consultantId: parts[1],
        requirement: parts[2],
        demonstrated: j.match,
      };
    });

  if (mhcEntries.length > 0) {
    const mhc = aggregateMhc(mhcEntries, threshold);
    for (const [id, cov] of Object.entries(mhc.perConsultant)) {
      metrics[`mhc.${id}`] = cov;
    }
    metrics["mhc.mean"] = mhc.mean;
    metrics["mhc.pass"] = mhc.passThreshold ? 1 : 0;
  }

  // hit@K — single judgment
  const hit = judgments.find((j) => j.field === "hit_at_k");
  if (hit) metrics["hit_at_k"] = hit.match ? 1 : 0;

  // Reasoning quality — ratio of "good" judgments
  const reasoningJudgments = judgments.filter((j) => j.field.startsWith("reasoning."));
  if (reasoningJudgments.length > 0) {
    const good = reasoningJudgments.filter((j) => j.match).length;
    metrics["reasoning.good_ratio"] = good / reasoningJudgments.length;
  }

  return metrics;
}

export function computeMatcherAggregate(
  fixtureMetrics: Array<Record<string, number>>
): Record<string, number> {
  if (fixtureMetrics.length === 0) return {};
  const keys = new Set<string>();
  for (const m of fixtureMetrics) for (const k of Object.keys(m)) keys.add(k);
  const agg: Record<string, number> = {};
  for (const k of keys) agg[`${k}.mean`] = meanMetric(fixtureMetrics, k);
  return agg;
}

async function judgeMatcher(
  fixture: MatcherFixture,
  actual: Output,
  context: MatcherEvalContext
): Promise<FieldJudgment[]> {
  const judgments: FieldJudgment[] = [];

  // Ranking → hit@K
  const rankedIds = actual.scoredConsultants
    .slice()
    .sort((a, b) => b.score - a.score)
    .map((c) => c.consultantId);

  const { k, must_contain } = fixture.golden.expected_top_k;
  const hitResult = hitAtK({ ranked: rankedIds, k, mustContain: must_contain });
  judgments.push({
    field: "hit_at_k",
    judge: "exact",
    match: hitResult === 1,
    golden: must_contain,
    actual: rankedIds.slice(0, k),
  });

  // MHC per (top-K consultant × must requirement)
  if (fixture.golden.must_have_coverage.enabled) {
    const topK = rankedIds.slice(0, k);
    const mustReqs = context.analyzerFixture.golden.requirements.filter((r) => r.priority === "must");
    for (const consultantId of topK) {
      const consultant = context.consultants.find((c) => c.id === consultantId);
      if (!consultant) continue;
      for (const req of mustReqs) {
        judgments.push(await sonnetMhcJudge({
          requirement: req,
          consultantId,
          cvText: consultant.cv_text,
        }));
      }
    }
  }

  // Reasoning quality per top-K consultant — only when fixture defines a rubric
  const rubric = fixture.golden.reasoning_rubric;
  if (rubric) {
    for (const consultantId of rankedIds.slice(0, k)) {
      const consultant = actual.scoredConsultants.find((c) => c.consultantId === consultantId);
      if (!consultant) continue;
      judgments.push(await haikuRubricJudge({
        field: `reasoning.${consultantId}`,
        rubric,
        actual: consultant.reasoning,
      }));
    }
  }

  return judgments;
}

export const matcherConfig: EvalConfig<MatcherFixture, Output, MatcherEvalContext> = {
  module: "matcher",
  mode: "isolated",
  fixtureDir: path.resolve(process.cwd(), "evals/fixtures/matcher").replace(/\\/g, "/"),
  loadFixture: async (filePath: string) => {
    const content = await fs.readFile(filePath, "utf-8");
    return loadFixtureFromString(content, MatcherFixtureSchema, path.basename(filePath));
  },
  runModule: async (fixture) => {
    const context = await loadContext(fixture);

    const analysis: RfpAnalysis = context.analyzerFixture.golden;
    const NOW = new Date().toISOString();
    const consultantsForMatcher: Consultant[] = context.consultants.map((c) => ({
      id: c.id,
      organizationId: "eval-harness",
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
    }));

    const output = await matchConsultants(analysis, consultantsForMatcher);
    return { output, context };
  },
  judgeOutput: (fixture, actual, context) => judgeMatcher(fixture, actual, context),
  computeFixtureMetrics: (judgments, fixture) =>
    computeMatcherMetrics(judgments, fixture.golden.must_have_coverage.required_threshold),
  computeAggregate: computeMatcherAggregate,
};
