// evals/scripts/zero-hallucination-loop.ts
//
// Noll-hallucinationsloopen (operatörskörd, BETALD). Kör den RIKTIGA
// extraktionsvägen (analyzeRfp) över analyzer-fixtures, verifierar varje krav-
// citat mekaniskt mot fixturens rfp_text, och rapporterar overifierbara påståenden.
//
// Protokoll: kör → klassa varje miss som prompt-/schema-/fixture-problem → justera
// → kör om → 0 missar över ALLA fixtures → lås som API-nyckel-gatad regressionsgrind.
// Se notes/2026-07-03-zero-hallucination-loop.md.
//
// KOSTNAD: hård budgettak-grind. BIDSMITH_LOOP_BUDGET_USD (default 20). Den
// KUMULATIVA kostnaden för alla 'eval:zero-halluc'-anrop läses FÖRE körningen;
// överskrider den taket avbryts loopen innan ett enda betalt anrop görs.
import path from "path";
import fs from "fs/promises";
import { analyzeRfp } from "@/lib/rfp-analyzer";
import { createServiceClient } from "@/lib/supabase";
import { analyzerConfig } from "../harness/configs/analyzer";
import { AnalyzerFixtureSchema, type AnalyzerFixture } from "../harness/core/fixtures";
import { loadFixtureFromString } from "../harness/core/fixture-loader";
import { verifyEvidence, type EvidenceMiss } from "../harness/core/verify-evidence";

// Distinkt etikett så loopens kostnad kan summeras isolerat i ai_call_logs.
const LOOP_LABEL = "eval:zero-halluc";
const DEFAULT_BUDGET_USD = 20;

// Kumulativ (all-time) summa av cost_usd för loopens anrop. Per-anrop-kostnad
// finns inte att koppla per körning här (logAiCall är fire-and-forget utan
// run-id) — därför rapporterar vi den kumulativa totalen prominent istället.
async function fetchCumulativeLoopCost(): Promise<number> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("ai_call_logs")
    .select("cost_usd")
    .eq("label", LOOP_LABEL);
  if (error) throw error;
  return (data ?? []).reduce((sum, row) => sum + Number(row.cost_usd ?? 0), 0);
}

interface FixtureResult {
  fixtureId: string;
  requirementCount: number;
  verifiedCount: number;
  misses: EvidenceMiss[];
  error?: string;
}

async function loadFixtures(fixtureFilter: string | null): Promise<AnalyzerFixture[]> {
  const dir = analyzerConfig.fixtureDir;
  const entries = await fs.readdir(dir);
  const yamlFiles = entries.filter(
    (f) => (f.endsWith(".yaml") || f.endsWith(".yml")) && !f.endsWith(".draft.yaml"),
  );
  const fixtures: AnalyzerFixture[] = [];
  for (const file of yamlFiles.sort()) {
    const content = await fs.readFile(path.join(dir, file), "utf-8");
    const fx = loadFixtureFromString(content, AnalyzerFixtureSchema, file);
    if (fixtureFilter && fx.id !== fixtureFilter) continue;
    fixtures.push(fx);
  }
  return fixtures;
}

function renderReportMd(
  results: FixtureResult[],
  timestamp: string,
  cumulativeCost: number,
  budget: number,
): string {
  const lines: string[] = [];
  lines.push(`# Noll-hallucinationsloop — ${timestamp}`);
  lines.push("");
  lines.push(`Etikett: \`${LOOP_LABEL}\``);
  lines.push("");

  const totalReqs = results.reduce((s, r) => s + r.requirementCount, 0);
  const totalMiss = results.reduce((s, r) => s + r.misses.length, 0);
  const allGreen = totalMiss === 0 && results.every((r) => !r.error);
  lines.push(`**Status: ${allGreen ? "✅ GRÖN (0 overifierbara påståenden)" : `❌ ${totalMiss} miss(ar) över ${results.length} fixture(s)`}**`);
  lines.push("");

  lines.push("## Per fixture");
  lines.push("");
  lines.push("| Fixture | Krav | Verifierade | Coverage | Missar |");
  lines.push("|---|---|---|---|---|");
  for (const r of results) {
    if (r.error) {
      lines.push(`| ${r.fixtureId} | — | — | — | ERROR: ${r.error} |`);
      continue;
    }
    const coverage = r.requirementCount === 0 ? 1 : r.verifiedCount / r.requirementCount;
    lines.push(
      `| ${r.fixtureId} | ${r.requirementCount} | ${r.verifiedCount} | ${(coverage * 100).toFixed(1)}% | ${r.misses.length} |`,
    );
  }
  lines.push("");
  lines.push(`Totalt: ${totalReqs} krav, ${totalMiss} missar.`);
  lines.push("");

  const withMisses = results.filter((r) => r.misses.length > 0);
  if (withMisses.length > 0) {
    lines.push("## Missar (för diagnos: prompt vs schema vs fixture)");
    lines.push("");
    for (const r of withMisses) {
      lines.push(`### ${r.fixtureId}`);
      lines.push("");
      for (const m of r.misses) {
        lines.push(`- **[${m.reason}]** krav: ${m.requirementText}`);
        lines.push(`  - citat: ${m.evidence === undefined ? "_(utelämnat)_" : `\`${m.evidence}\``}`);
      }
      lines.push("");
    }
  }

  lines.push("## Kostnad");
  lines.push("");
  lines.push(`- Kumulativ loop-kostnad (all-time, \`${LOOP_LABEL}\`): **$${cumulativeCost.toFixed(4)}**`);
  lines.push(`- Budgettak (BIDSMITH_LOOP_BUDGET_USD): $${budget.toFixed(2)}`);
  lines.push(`- Kvar av budget: $${Math.max(0, budget - cumulativeCost).toFixed(4)}`);
  lines.push("");
  return lines.join("\n");
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY not set. Put it in .env.local and source it.");
    process.exit(1);
  }

  const budget = Number(process.env.BIDSMITH_LOOP_BUDGET_USD ?? DEFAULT_BUDGET_USD);

  // BUDGETGRIND FÖRST — före ett enda betalt anrop. Överskriden budget → avbryt.
  const costBefore = await fetchCumulativeLoopCost();
  if (costBefore > budget) {
    console.error("");
    console.error("╔════════════════════════════════════════════════════════════╗");
    console.error("║  BUDGETTAK ÖVERSKRIDET — INGA API-ANROP GÖRS                ║");
    console.error("╚════════════════════════════════════════════════════════════╝");
    console.error(
      `Kumulativ loop-kostnad $${costBefore.toFixed(4)} > tak $${budget.toFixed(2)} ` +
      `(label '${LOOP_LABEL}'). Höj BIDSMITH_LOOP_BUDGET_USD medvetet för att fortsätta.`,
    );
    process.exit(1);
  }
  console.log(
    `Budgetgrind OK: kumulativ $${costBefore.toFixed(4)} / tak $${budget.toFixed(2)} ` +
    `(kvar $${(budget - costBefore).toFixed(4)}).`,
  );

  const fixtureArgIdx = process.argv.findIndex((a) => a === "--fixture" || a.startsWith("--fixture="));
  let fixtureFilter: string | null = null;
  if (fixtureArgIdx >= 0) {
    const arg = process.argv[fixtureArgIdx];
    fixtureFilter = arg.includes("=") ? arg.split("=")[1] : process.argv[fixtureArgIdx + 1] ?? null;
  }

  const fixtures = await loadFixtures(fixtureFilter);
  if (fixtures.length === 0) {
    console.error(`No fixtures found${fixtureFilter ? ` matching id=${fixtureFilter}` : ""}.`);
    process.exit(1);
  }

  console.log(`Kör ${fixtures.length} fixture(s) genom extraktion + evidens-verifiering...`);

  const results: FixtureResult[] = [];
  for (const fx of fixtures) {
    console.log(`  → ${fx.id}`);
    try {
      const analysis = await analyzeRfp(fx.rfp_text, null, LOOP_LABEL);
      const misses = verifyEvidence(fx.id, fx.rfp_text, analysis.requirements);
      results.push({
        fixtureId: fx.id,
        requirementCount: analysis.requirements.length,
        verifiedCount: analysis.requirements.length - misses.length,
        misses,
      });
    } catch (err) {
      results.push({
        fixtureId: fx.id,
        requirementCount: 0,
        verifiedCount: 0,
        misses: [],
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const costAfter = await fetchCumulativeLoopCost();
  const timestamp = new Date().toISOString();
  const md = renderReportMd(results, timestamp, costAfter, budget);

  const resultsDir = path.resolve("evals/results");
  await fs.mkdir(resultsDir, { recursive: true });
  const outPath = path.join(resultsDir, `${timestamp.replace(/[:.]/g, "-")}-zero-hallucination-loop.md`);
  await fs.writeFile(outPath, md, "utf-8");

  // Konsol-sammanfattning
  console.log("");
  for (const r of results) {
    if (r.error) {
      console.log(`  ERROR  ${r.fixtureId}: ${r.error}`);
      continue;
    }
    const cov = r.requirementCount === 0 ? 1 : r.verifiedCount / r.requirementCount;
    console.log(
      `  ${r.misses.length === 0 ? "PASS" : "FAIL"}  ${r.fixtureId.padEnd(28)} ` +
      `krav=${r.requirementCount} verifierade=${r.verifiedCount} coverage=${(cov * 100).toFixed(1)}% missar=${r.misses.length}`,
    );
  }
  const totalMiss = results.reduce((s, r) => s + r.misses.length, 0);
  console.log("");
  console.log(totalMiss === 0 ? "✅ 0 overifierbara påståenden — grön." : `❌ ${totalMiss} overifierbara påståenden.`);
  console.log("");
  console.log("═══ KOSTNAD ═══════════════════════════════════════════════");
  console.log(`Kumulativ loop-kostnad (all-time, '${LOOP_LABEL}'): $${costAfter.toFixed(4)}`);
  console.log(`Budgettak: $${budget.toFixed(2)}  ·  Kvar: $${Math.max(0, budget - costAfter).toFixed(4)}`);
  if (costAfter > budget) {
    console.log("⚠️  BUDGETTAK ÖVERSKRIDET av denna körning — höj taket medvetet före nästa varv.");
  }
  console.log("");
  console.log(`Resultat: ${outPath}`);

  // Non-zero exit om overifierbara påståenden finns → CI/grind kan gata på det.
  process.exit(totalMiss === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
