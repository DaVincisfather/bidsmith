import path from "path";
import fs from "fs/promises";
import { analyzeRfp } from "@/lib/rfp-analyzer";
import type { RfpAnalysis } from "@/lib/types";
import { AnalyzerFixtureSchema, type AnalyzerFixture } from "../core/fixtures";
import { loadFixtureFromString } from "../core/fixture-loader";
import { exactJudge, haikuEquivJudge } from "../core/judges";
import { setMetrics, meanMetric } from "../core/metrics";
import type { EvalConfig, FieldJudgment } from "../core/types";

type Output = RfpAnalysis;

export interface AnalyzerFieldCounts {
  goldenCounts: Record<string, number>;
  outputCounts: Record<string, number>;
  // Distinkta output-poster som matchade ≥1 golden. Skiljer sig från antalet
  // matchade golden när en buntad output täcker flera golden-poster (1-till-många).
  outputMatchedCounts?: Record<string, number>;
}

/**
 * Computes per-fixture metrics from the flat judgment list.
 * `goldenMatches` = number of golden items with match=true (from set-matching below).
 * Set-matching for arrays happens in judgeAnalyzer: we emit one judgment per golden item
 * with match=true if the output contains a semantic equivalent.
 */
export function computeAnalyzerMetrics(
  judgments: FieldJudgment[],
  counts: AnalyzerFieldCounts
): Record<string, number> {
  const metrics: Record<string, number> = {};

  // Scalar fields: 0/1 direct. evaluationCriteria.weights är informativ
  // (otröskad) tills baslinje finns — fabricerade vikter ska synas, inte gissas.
  for (const scalar of ["title", "client", "deadline", "domain", "summary", "estimatedScope", "evaluationCriteria.weights"]) {
    const j = judgments.find((x) => x.field === scalar);
    if (j) metrics[scalar] = j.match ? 1 : 0;
  }

  // Array fields: compute recall/precision/F1
  for (const arr of ["requirements", "evaluationCriteria", "requiredCompetencies", "redFlags"]) {
    const arrJudgments = judgments.filter((x) => x.field.startsWith(`${arr}[`));
    if (arrJudgments.length === 0 && counts.goldenCounts[arr] === undefined) continue;

    const goldenMatches = arrJudgments.filter((x) => x.match).length;
    const goldenTotal = counts.goldenCounts[arr] ?? arrJudgments.length;
    const outputTotal = counts.outputCounts[arr] ?? goldenMatches;
    // precision = output items that matched ≥1 golden. With 1-to-many pairing
    // (bundled outputs) this is fewer than goldenMatches.
    const outputMatches = counts.outputMatchedCounts?.[arr] ?? goldenMatches;

    const { recall, precision, f1 } = setMetrics({
      goldenMatches, outputMatches, goldenTotal, outputTotal,
    });
    metrics[`${arr}.recall`] = recall;
    metrics[`${arr}.precision`] = precision;
    metrics[`${arr}.f1`] = f1;
  }

  return metrics;
}

export function computeAnalyzerAggregate(
  fixtureMetrics: Array<Record<string, number>>
): Record<string, number> {
  if (fixtureMetrics.length === 0) return {};
  const keys = new Set<string>();
  for (const m of fixtureMetrics) for (const k of Object.keys(m)) keys.add(k);
  const agg: Record<string, number> = {};
  for (const k of keys) agg[`${k}.mean`] = meanMetric(fixtureMetrics, k);
  return agg;
}

export async function judgeAnalyzer(
  fixture: AnalyzerFixture,
  actual: Output
): Promise<FieldJudgment[]> {
  const judgments: FieldJudgment[] = [];

  // Scalars: deadline är strukturerad (ISO-datum) och döms exakt; övriga är
  // fritext där case-känslig exact match fäller legitima varianter
  // (fas 1-felsökningen: "Region Örebro Län" vs "län").
  judgments.push(await haikuEquivJudge({ field: "title", golden: fixture.golden.title, actual: actual.title }));
  judgments.push(await haikuEquivJudge({ field: "client", golden: fixture.golden.client, actual: actual.client }));
  judgments.push(await exactJudge({ field: "deadline", golden: fixture.golden.deadline, actual: actual.deadline }));
  judgments.push(await haikuEquivJudge({ field: "domain", golden: fixture.golden.domain, actual: actual.domain }));
  judgments.push(await haikuEquivJudge({ field: "summary", golden: fixture.golden.summary, actual: actual.summary }));
  judgments.push(await haikuEquivJudge({ field: "estimatedScope", golden: fixture.golden.estimatedScope, actual: actual.estimatedScope }));

  // Vikterna hålls utanför equiv-strängen (viktoenighet ska inte fälla
  // innehållsmatchen) men döms deterministiskt som multiset — fabricerade
  // vikter var schemafixens hela motiv och får inte passera osedda.
  const weightKey = (xs: Array<number | null>) =>
    JSON.stringify([...xs].sort((a, b) => (a ?? -1) - (b ?? -1)));
  const goldenWeights = fixture.golden.evaluationCriteria.map((e) => e.weight);
  const actualWeights = actual.evaluationCriteria.map((e) => e.weight);
  judgments.push({
    field: "evaluationCriteria.weights",
    judge: "exact",
    match: weightKey(goldenWeights) === weightKey(actualWeights),
    golden: goldenWeights,
    actual: actualWeights,
  });

  // Array fields: per golden item, find first semantic match in actual.
  await judgeArrayField(judgments, "requirements",
    fixture.golden.requirements.map((r) => `${r.priority}: ${r.description}`),
    actual.requirements.map((r) => `${r.priority}: ${r.description}`));
  await judgeArrayField(judgments, "evaluationCriteria",
    fixture.golden.evaluationCriteria.map((e) => `${e.name}: ${e.description}`),
    actual.evaluationCriteria.map((e) => `${e.name}: ${e.description}`));
  await judgeArrayField(judgments, "requiredCompetencies",
    fixture.golden.requiredCompetencies, actual.requiredCompetencies);
  await judgeArrayField(judgments, "redFlags",
    fixture.golden.redFlags, actual.redFlags);

  return judgments;
}

export async function judgeArrayField(
  out: FieldJudgment[],
  field: string,
  goldenItems: unknown[],
  actualItems: unknown[]
): Promise<void> {
  // 1-till-många: en output får matcha flera golden. Modellen buntar legitimt
  // ihop krav som golden delar upp (examen+workshops+språk i en post) — 1-till-1
  // straffade ren segmentering med både recall- och precisionstapp.
  const matchedActual = new Set<number>();
  for (let i = 0; i < goldenItems.length; i++) {
    let bestMatch: FieldJudgment | null = null;
    let bestMatchIdx = -1;
    // Errade par-domar (429/529/kreditslut) får inte bli tysta no-match —
    // kreditsluts-incidenten gav falska nollor som såg ut som modellfel.
    let lastError: string | undefined;
    // Omatchade outputs prövas FÖRE redan matchade: annars stjäl en bred tidig
    // post matchningen från en specifik senare (falskt precisionstapp), och
    // buntfallet (en output täcker flera golden) bevaras via fallbacket.
    const scanOrder = [
      ...actualItems.map((_, j) => j).filter((j) => !matchedActual.has(j)),
      ...actualItems.map((_, j) => j).filter((j) => matchedActual.has(j)),
    ];
    for (const j of scanOrder) {
      const judgment = await haikuEquivJudge({
        field: `${field}[${i}]`,
        golden: goldenItems[i],
        actual: actualItems[j],
      });
      if (judgment.error) lastError = judgment.error;
      if (judgment.match) {
        bestMatch = judgment;
        bestMatchIdx = j;
        break;
      }
    }
    if (bestMatch) {
      matchedActual.add(bestMatchIdx);
      out.push(bestMatch);
    } else {
      out.push({
        field: `${field}[${i}]`,
        judge: "haiku-equiv",
        match: false,
        golden: goldenItems[i],
        actual: null,
        ...(lastError ? { error: lastError } : {}),
      });
    }
  }
  // Record unmatched output items so precision reflects spurious outputs.
  for (let j = 0; j < actualItems.length; j++) {
    if (matchedActual.has(j)) continue;
    out.push({
      field: `${field}[extra_${j}]`,
      judge: "haiku-equiv",
      match: false,
      golden: null,
      actual: actualItems[j],
    });
  }
}

export const analyzerConfig: EvalConfig<AnalyzerFixture, Output> = {
  module: "analyzer",
  fixtureDir: path.resolve(process.cwd(), "evals/fixtures/analyzer").replace(/\\/g, "/"),
  loadFixture: async (filePath: string) => {
    const content = await fs.readFile(filePath, "utf-8");
    return loadFixtureFromString(content, AnalyzerFixtureSchema, path.basename(filePath));
  },
  runModule: async (fixture) => ({ output: await analyzeRfp(fixture.rfp_text), context: undefined }),
  judgeOutput: (fixture, actual) => judgeAnalyzer(fixture, actual),
  computeFixtureMetrics: (judgments) => {
    // Reconstruct counts from judgments produced by judgeArrayField:
    //   golden items  → fields `${arr}[N]`     — N is a number
    //   extra outputs → fields `${arr}[extra_N]`
    // Matchade outputs räknas distinkt på värde — med 1-till-många-parning kan
    // flera golden peka på samma buntade output.
    const counts: AnalyzerFieldCounts = { goldenCounts: {}, outputCounts: {}, outputMatchedCounts: {} };
    for (const arr of ["requirements", "evaluationCriteria", "requiredCompetencies", "redFlags"]) {
      const goldenJudgments = judgments.filter((x) => /^[^\[]+\[\d+\]$/.test(x.field) && x.field.startsWith(`${arr}[`));
      const extraJudgments = judgments.filter((x) => x.field.startsWith(`${arr}[extra_`));
      counts.goldenCounts[arr] = goldenJudgments.length;
      const matchedOutputs = new Set(
        goldenJudgments.filter((x) => x.match).map((x) => JSON.stringify(x.actual)),
      ).size;
      counts.outputMatchedCounts![arr] = matchedOutputs;
      counts.outputCounts[arr] = matchedOutputs + extraJudgments.length;
    }
    return computeAnalyzerMetrics(judgments, counts);
  },
  computeAggregate: computeAnalyzerAggregate,
};
