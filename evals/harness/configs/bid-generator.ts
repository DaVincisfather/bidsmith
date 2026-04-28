import path from "path";
import fs from "fs/promises";
import { generateAllSections } from "@/lib/bid-generator";
import type { BidSection } from "@/lib/types";
import {
  AnalyzerFixtureSchema,
  BidGeneratorFixtureSchema,
  type AnalyzerFixture,
  type BidGeneratorFixture,
  type SyntheticConsultant,
} from "../core/fixtures";
import { loadFixtureFromString } from "../core/fixture-loader";
import { loadConsultantPool, getConsultantsByIds } from "../core/consultant-pool";
import { judgeBidStructure, STRUCTURE_FIELDS } from "../core/bid-structure";
import { bidCoverageJudge, bidHallucinationJudge } from "../core/judges";
import { mapWithConcurrency } from "../core/concurrency";
import { meanMetric } from "../core/metrics";
import type { EvalConfig, FieldJudgment } from "../core/types";
import { buildEvalBidContext } from "./bid-generator-context";

type Output = BidSection[];

function flattenBidText(sections: BidSection[]): string {
  return sections
    .map((s) => `## ${s.title}\n${JSON.stringify(s.content, null, 2)}`)
    .join("\n\n");
}

// Synthetic ID: positional in the analyzer fixture's requirements array.
// Reordering analyzer requirements invalidates bid-generator fixture references.
function requirementId(idx: number): string {
  return `req_${idx}`;
}

interface BidEvalContext {
  fixture: BidGeneratorFixture;
  analyzerFixture: AnalyzerFixture;
  consultants: SyntheticConsultant[];
}

const POOL_PATH = path.resolve(process.cwd(), "evals/fixtures/consultants/synthetic-pool.yaml");
const ANALYZER_FIXTURE_DIR = path.resolve(process.cwd(), "evals/fixtures/analyzer");

async function loadContext(fixture: BidGeneratorFixture): Promise<BidEvalContext> {
  const analyzerPath = path.join(ANALYZER_FIXTURE_DIR, `${fixture.analyzer_fixture}.yaml`);
  const analyzerContent = await fs.readFile(analyzerPath, "utf-8");
  const analyzerFixture = loadFixtureFromString(
    analyzerContent, AnalyzerFixtureSchema, path.basename(analyzerPath),
  );
  const pool = await loadConsultantPool(POOL_PATH);
  const consultants = getConsultantsByIds(pool, fixture.consultant_ids);
  return { fixture, analyzerFixture, consultants };
}

export function computeBidGeneratorMetrics(judgments: FieldJudgment[]): Record<string, number> {
  const metrics: Record<string, number> = {};

  // Structure: 0/1 per judgment + composite pass
  const structureFields = STRUCTURE_FIELDS;
  let structurePass = true;
  for (const f of structureFields) {
    const j = judgments.find((x) => x.field === f);
    if (j) {
      metrics[f] = j.match ? 1 : 0;
      if (!j.match) structurePass = false;
    } else {
      structurePass = false;
    }
  }
  metrics["structure.pass"] = structurePass ? 1 : 0;

  // Coverage
  const coverageJudgments = judgments.filter((j) => j.field.startsWith("coverage."));
  if (coverageJudgments.length > 0) {
    metrics["coverage.recall"] = coverageJudgments.filter((j) => j.match).length / coverageJudgments.length;
  }

  // Hallucination
  const hallucination = judgments.find((j) => j.field === "hallucination");
  if (hallucination) {
    metrics["hallucination.pass"] = hallucination.match ? 1 : 0;
    const claims = Array.isArray(hallucination.actual) ? hallucination.actual : [];
    metrics["hallucination.count"] = claims.filter((c: { supported: boolean }) => !c.supported).length;
  }

  return metrics;
}

export function computeBidGeneratorAggregate(
  fixtureMetrics: Array<Record<string, number>>,
): Record<string, number> {
  if (fixtureMetrics.length === 0) return {};
  const keys = new Set<string>();
  for (const m of fixtureMetrics) for (const k of Object.keys(m)) keys.add(k);
  const agg: Record<string, number> = {};
  for (const k of keys) agg[`${k}.mean`] = meanMetric(fixtureMetrics, k);
  return agg;
}

function buildSourceMaterial(context: BidEvalContext): string {
  // Pass BOTH raw and structured forms — the bid-generator works from
  // structured (parsed_profile, analysis), so the judge needs both to avoid
  // flagging structured-only fields as fabrications. Compact JSON keeps
  // the structured dumps lean as fixtures scale.
  const rfpRaw = `## RFP (rå text)\n${context.analyzerFixture.rfp_text}`;
  const rfpStructured = `## RFP (analyzed structure — what the bid-generator received)\n${JSON.stringify(context.analyzerFixture.golden)}`;
  const cvs = context.consultants
    .map((c) =>
      `## CV (rå text): ${c.parsed_profile.name} (${c.id})\n${c.cv_text}\n\n` +
      `## CV (parsed profile — what the bid-generator received): ${c.parsed_profile.name} (${c.id})\n${JSON.stringify(c.parsed_profile)}`,
    )
    .join("\n\n");
  return `${rfpRaw}\n\n${rfpStructured}\n\n${cvs}`;
}

async function judgeBid(
  fixture: BidGeneratorFixture,
  actual: Output,
  context: BidEvalContext,
): Promise<FieldJudgment[]> {
  const judgments: FieldJudgment[] = [];

  // Structure
  judgments.push(...judgeBidStructure(actual, fixture.golden.mandatory_sections));

  // Coverage — per requirement, fanned out with bounded concurrency.
  // Sequential Sonnet calls take 2-5s each; a 25-req RFP wastes 50-125s
  // wall-clock. Concurrency=5 keeps us well under Sonnet's 50 req/min limit.
  const bidText = flattenBidText(actual);
  const reqs = context.analyzerFixture.golden.requirements;
  const coverageJudgments = await mapWithConcurrency(reqs, 5, (r, i) =>
    bidCoverageJudge({
      requirement: { id: requirementId(i), ...r },
      bidText,
    }),
  );
  judgments.push(...coverageJudgments);

  // Hallucination
  const sourceMaterial = buildSourceMaterial(context);
  judgments.push(await bidHallucinationJudge({
    bidText,
    sourceMaterial,
    allowlist: fixture.golden.hallucination_allowlist,
  }));

  return judgments;
}

export const bidGeneratorConfig: EvalConfig<BidGeneratorFixture, Output, BidEvalContext> = {
  module: "bid-generator",
  fixtureDir: path.resolve(process.cwd(), "evals/fixtures/bid-generator").replace(/\\/g, "/"),
  loadFixture: async (filePath: string) => {
    const content = await fs.readFile(filePath, "utf-8");
    return loadFixtureFromString(content, BidGeneratorFixtureSchema, path.basename(filePath));
  },
  runModule: async (fixture) => {
    const context = await loadContext(fixture);
    const ctx = buildEvalBidContext(context.analyzerFixture, context.consultants);
    const output = await generateAllSections(ctx);
    return { output, context };
  },
  judgeOutput: (fixture, actual, context) => judgeBid(fixture, actual, context),
  // EvalConfig requires (judgments, fixture) — fixture unused for structure-only dimension.
  computeFixtureMetrics: (judgments, _fixture) => computeBidGeneratorMetrics(judgments),
  computeAggregate: computeBidGeneratorAggregate,
};
