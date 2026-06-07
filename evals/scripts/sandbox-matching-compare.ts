/**
 * Sandbox: compare Opus / Sonnet / Haiku as the consultant-matching SCORER.
 *
 * Same prompt, same pool, same RFPs — only the model changes. Measures ranking
 * agreement vs Opus (the quality ceiling), cost, latency, and the real two-stage
 * cost (Haiku-all + Sonnet-on-shortlist) vs today's Sonnet-all.
 *
 * Pool size via POOL_SIZE env (default 20):
 *   source ~/projects/bidsmith-main/.env.local
 *   POOL_SIZE=100 npx tsx evals/scripts/sandbox-matching-compare.ts
 */
import { calculateCostUsd } from "@/lib/ai-cost";
import { selectTopNPerLevel } from "@/lib/consultant-matcher";
import { makePool, RFPS, scoreAll, type ScorePass } from "./_matching-fixtures";
import type { ConsultantLevel, ScoredConsultant } from "@/lib/types";

const OPUS = "claude-opus-4-7";
const SONNET = "claude-sonnet-4-6";
const HAIKU = "claude-haiku-4-5-20251001";
const SHORTLIST_PER_LEVEL = 3;

const POOL = makePool(Number(process.env.POOL_SIZE) || 20);

function cost(p: ScorePass): number {
  return calculateCostUsd({ model: p.model, inputTokens: p.inputTokens, outputTokens: p.outputTokens, cacheReadTokens: 0, cacheCreationTokens: 0 });
}

// --- ranking-agreement metrics -------------------------------------------
function scoreMap(scored: ScoredConsultant[]): Map<string, number> {
  return new Map(scored.map((s) => [s.consultantId, s.score]));
}
function avgRanks(scores: Map<string, number>, ids: string[]): Map<string, number> {
  const sorted = [...ids].sort((a, b) => (scores.get(b) ?? 0) - (scores.get(a) ?? 0));
  const ranks = new Map<string, number>();
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && (scores.get(sorted[j + 1]) ?? 0) === (scores.get(sorted[i]) ?? 0)) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks.set(sorted[k], r);
    i = j + 1;
  }
  return ranks;
}
function spearman(a: Map<string, number>, b: Map<string, number>, ids: string[]): number {
  const ra = avgRanks(a, ids), rb = avgRanks(b, ids);
  const xs = ids.map((id) => ra.get(id)!), ys = ids.map((id) => rb.get(id)!);
  const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
  const mx = mean(xs), my = mean(ys);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  return dx === 0 || dy === 0 ? 1 : num / Math.sqrt(dx * dy);
}
const LEVELS: ConsultantLevel[] = ["expert", "senior", "intermediate", "junior"];
function topKPerLevel(scored: ScoredConsultant[], k: number): Map<ConsultantLevel, string[]> {
  const out = new Map<ConsultantLevel, string[]>();
  for (const lvl of LEVELS) {
    out.set(lvl, scored.filter((s) => s.level === lvl).sort((a, b) => b.score - a.score).slice(0, k).map((s) => s.consultantId));
  }
  return out;
}
function topKOverlap(ref: ScoredConsultant[], other: ScoredConsultant[], k: number) {
  const a = topKPerLevel(ref, k), b = topKPerLevel(other, k);
  let overlap = 0, total = 0, topMatch = 0, levels = 0;
  for (const lvl of LEVELS) {
    const av = a.get(lvl)!, bv = new Set(b.get(lvl)!);
    if (av.length === 0) continue;
    levels++; total += av.length;
    overlap += av.filter((id) => bv.has(id)).length;
    if (av[0] && b.get(lvl)![0] === av[0]) topMatch++;
  }
  return { overlap, total, topMatch, levels };
}

const usd = (n: number) => "$" + n.toFixed(4);

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY not set. Run: source ~/projects/bidsmith-main/.env.local");
    process.exit(1);
  }
  console.log(`Pool size: ${POOL.length}`);
  const ids = POOL.map((c) => c.id);
  const agg = {
    sonnetVsOpus: [] as number[], haikuVsOpus: [] as number[], haikuVsSonnet: [] as number[],
    sonnetTop3: 0, haikuTop3: 0, top3Total: 0,
    sonnet1: 0, haiku1: 0, oneTotal: 0,
    todayCost: 0, twoStageCost: 0, opusCost: 0, haikuAllCost: 0,
    todayMs: 0, twoStageMs: 0, opusMs: 0, haikuAllMs: 0,
    truncated: [] as string[],
  };

  for (let r = 0; r < RFPS.length; r++) {
    const analysis = RFPS[r];
    console.log(`\n${"=".repeat(72)}\nRFP ${r + 1}: ${analysis.title}\n${"=".repeat(72)}`);

    const opus = await scoreAll(OPUS, analysis, POOL);
    const sonnet = await scoreAll(SONNET, analysis, POOL);
    const haiku = await scoreAll(HAIKU, analysis, POOL);
    const shortlistIds = selectTopNPerLevel(haiku.scored, SHORTLIST_PER_LEVEL);
    const shortlist = POOL.filter((c) => shortlistIds.has(c.id));
    const sonnetShortlist = await scoreAll(SONNET, analysis, shortlist);

    for (const [label, p] of [["Opus-all", opus], ["Sonnet-all", sonnet], ["Haiku-all", haiku]] as const) {
      if (p.scored.length < POOL.length) agg.truncated.push(`RFP${r + 1} ${label}: ${p.scored.length}/${POOL.length}`);
    }

    console.log("\n  PASS                 returned  latency   in/out tok        cost");
    const row = (label: string, p: ScorePass) =>
      console.log(`  ${label.padEnd(20)} ${String(p.scored.length + "/" + (label.includes("shortlist") ? shortlist.length : POOL.length)).padEnd(9)} ${(p.latencyMs + "ms").padEnd(9)} ${String(p.inputTokens + "/" + p.outputTokens).padEnd(17)} ${usd(cost(p))}`);
    row("Opus-all", opus);
    row("Sonnet-all (today)", sonnet);
    row("Haiku-all (stage1)", haiku);
    row(`Sonnet-shortlist`, sonnetShortlist);

    const twoStageCost = cost(haiku) + cost(sonnetShortlist);
    const twoStageMs = haiku.latencyMs + sonnetShortlist.latencyMs;
    console.log(`\n  Two-stage (Haiku-all + Sonnet-shortlist):  ${usd(twoStageCost)}  /  ${twoStageMs}ms`);
    console.log(`  Today    (Sonnet-all):                     ${usd(cost(sonnet))}  /  ${sonnet.latencyMs}ms`);
    console.log(`  Haiku-all only:                            ${usd(cost(haiku))}  /  ${haiku.latencyMs}ms`);

    const om = scoreMap(opus.scored), sm = scoreMap(sonnet.scored), hm = scoreMap(haiku.scored);
    const spSO = spearman(om, sm, ids), spHO = spearman(om, hm, ids), spHS = spearman(sm, hm, ids);
    const ovSO = topKOverlap(opus.scored, sonnet.scored, 3), ovHO = topKOverlap(opus.scored, haiku.scored, 3);
    console.log("\n  RANKING vs Opus:");
    console.log(`    Sonnet:  Spearman ${spSO.toFixed(3)}   top3/level ${ovSO.overlap}/${ovSO.total}   #1 ${ovSO.topMatch}/${ovSO.levels}`);
    console.log(`    Haiku:   Spearman ${spHO.toFixed(3)}   top3/level ${ovHO.overlap}/${ovHO.total}   #1 ${ovHO.topMatch}/${ovHO.levels}`);

    agg.sonnetVsOpus.push(spSO); agg.haikuVsOpus.push(spHO); agg.haikuVsSonnet.push(spHS);
    agg.sonnetTop3 += ovSO.overlap; agg.haikuTop3 += ovHO.overlap; agg.top3Total += ovSO.total;
    agg.sonnet1 += ovSO.topMatch; agg.haiku1 += ovHO.topMatch; agg.oneTotal += ovSO.levels;
    agg.todayCost += cost(sonnet); agg.twoStageCost += twoStageCost; agg.opusCost += cost(opus); agg.haikuAllCost += cost(haiku);
    agg.todayMs += sonnet.latencyMs; agg.twoStageMs += twoStageMs; agg.opusMs += opus.latencyMs; agg.haikuAllMs += haiku.latencyMs;
  }

  const avg = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
  console.log(`\n${"=".repeat(72)}\nSUMMARY (avg over ${RFPS.length} RFPs, pool=${POOL.length})\n${"=".repeat(72)}`);
  console.log(`  Spearman vs Opus:   Sonnet ${avg(agg.sonnetVsOpus).toFixed(3)}   Haiku ${avg(agg.haikuVsOpus).toFixed(3)}`);
  console.log(`  Top-3/level vs Opus: Sonnet ${agg.sonnetTop3}/${agg.top3Total}   Haiku ${agg.haikuTop3}/${agg.top3Total}`);
  console.log(`  Exact #1 vs Opus:   Sonnet ${agg.sonnet1}/${agg.oneTotal}   Haiku ${agg.haiku1}/${agg.oneTotal}`);
  console.log(`  Cost (sum):  today ${usd(agg.todayCost)}   haiku-all ${usd(agg.haikuAllCost)}   two-stage ${usd(agg.twoStageCost)}   opus ${usd(agg.opusCost)}`);
  console.log(`  Latency(sum): today ${agg.todayMs}ms   haiku-all ${agg.haikuAllMs}ms   two-stage ${agg.twoStageMs}ms   opus ${agg.opusMs}ms`);
  console.log(`  Haiku-all vs today:  cost ${((1 - agg.haikuAllCost / agg.todayCost) * 100).toFixed(0)}% lower, latency ${((1 - agg.haikuAllMs / agg.todayMs) * 100).toFixed(0)}% lower`);
  if (agg.truncated.length) console.log(`  ⚠ TRUNCATION: ${agg.truncated.join(", ")}`);
  else console.log(`  ✓ No truncation — all passes returned the full pool.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
