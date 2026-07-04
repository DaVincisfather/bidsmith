// evals/scripts/zero-hallucination-loop.ts
//
// Noll-hallucinationsloopen (operatörskörd, BETALD). Kör den RIKTIGA extraktions-
// vägen över fixtures, verifierar varje extraherat citat mekaniskt mot källtexten
// (POST-vakt: se notes/2026-07-03-zero-hallucination-loop.md), och rapporterar
// overifierbara påståenden.
//
//   --target=rfp   (default) analyzeRfp över analyzer-fixtures; verifierar krav-citat
//   --target=cv              extractConsultant över cv-fixtures; verifierar
//                            kompetens- + referenscitat mot cv_text
//   --fixture=<id>           kör bara en fixture
//
// KOSTNAD: hård budgettak-grind FÖRE ett enda betalt anrop. Den KUMULATIVA kostnaden
// för ALLA 'eval:zero-halluc%'-anrop (rfp, cv, requotes) läses först; överskrider
// den taket avbryts loopen. BIDSMITH_LOOP_BUDGET_USD (default 20).
import path from "path";
import fs from "fs/promises";
import { analyzeRfp } from "@/lib/rfp-analyzer";
import { extractConsultant } from "@/lib/consultant-extractor";
import { analyzerConfig } from "../harness/configs/analyzer";
import {
  AnalyzerFixtureSchema,
  CvFixtureSchema,
  type AnalyzerFixture,
  type CvFixture,
} from "../harness/core/fixtures";
import { loadFixtureFromString } from "../harness/core/fixture-loader";
import { fetchCumulativeLoopCost } from "../harness/core/loop-budget";
import {
  LABELS,
  LOOP_COST_PATTERN,
  errorResult,
  renderReportMd,
  type FixtureResult,
  type Target,
} from "../harness/core/loop-report";
import { verifyEvidence } from "@/lib/verify-evidence";

const CV_FIXTURE_DIR = path.resolve(process.cwd(), "evals/fixtures/cv").replace(/\\/g, "/");
const DEFAULT_BUDGET_USD = 20;

async function loadAnalyzerFixtures(filter: string | null): Promise<AnalyzerFixture[]> {
  const dir = analyzerConfig.fixtureDir;
  const entries = await fs.readdir(dir);
  const yamlFiles = entries.filter(
    (f) =>
      (f.endsWith(".yaml") || f.endsWith(".yml")) &&
      !f.endsWith(".draft.yaml") &&
      !f.startsWith("_"), // _stub.yaml är en mall, inte en RFP
  );
  const out: AnalyzerFixture[] = [];
  for (const file of yamlFiles.sort()) {
    const content = await fs.readFile(path.join(dir, file), "utf-8");
    const fx = loadFixtureFromString(content, AnalyzerFixtureSchema, file);
    if (!filter || fx.id === filter) out.push(fx);
  }
  return out;
}

async function loadCvFixtures(filter: string | null): Promise<CvFixture[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(CV_FIXTURE_DIR);
  } catch {
    return []; // katalogen kan saknas tills generatorn körts (operatör, betald)
  }
  const yamlFiles = entries.filter(
    (f) => (f.endsWith(".yaml") || f.endsWith(".yml")) && !f.startsWith("_"),
  );
  const out: CvFixture[] = [];
  for (const file of yamlFiles.sort()) {
    const content = await fs.readFile(path.join(CV_FIXTURE_DIR, file), "utf-8");
    const fx = loadFixtureFromString(content, CvFixtureSchema, file);
    if (!filter || fx.id === filter) out.push(fx);
  }
  return out;
}

async function runRfp(filter: string | null): Promise<FixtureResult[]> {
  const fixtures = await loadAnalyzerFixtures(filter);
  assertNonEmpty(fixtures.length, filter);
  console.log(`Kör ${fixtures.length} RFP-fixture(s) genom analyzeRfp + evidens-verifiering...`);
  const results: FixtureResult[] = [];
  for (const fx of fixtures) {
    console.log(`  → ${fx.id}`);
    try {
      const analysis = await analyzeRfp(fx.rfp_text, null, LABELS.rfp);
      const misses = verifyEvidence(fx.id, fx.rfp_text, analysis.requirements);
      results.push({
        fixtureId: fx.id,
        itemCount: analysis.requirements.length,
        extractedForCoverage: analysis.requirements.length,
        goldenCount: fx.golden.requirements.length,
        verifiedCount: analysis.requirements.length - misses.length,
        misses,
        pairs: analysis.requirements.map((r) => ({
          item: `${r.category}: ${r.description}`,
          evidence: r.evidence,
        })),
      });
    } catch (err) {
      results.push(errorResult(fx.id, err));
    }
  }
  return results;
}

async function runCv(filter: string | null): Promise<FixtureResult[]> {
  const fixtures = await loadCvFixtures(filter);
  assertNonEmpty(fixtures.length, filter);
  console.log(`Kör ${fixtures.length} CV-fixture(s) genom extractConsultant + evidens-verifiering...`);
  const results: FixtureResult[] = [];
  for (const fx of fixtures) {
    console.log(`  → ${fx.id}`);
    try {
      const p = await extractConsultant(fx.cv_text, null, LABELS.cv);
      // Verifiera kompetenser + referenser mot cv_text (samma poster vakten grundar).
      const items = [
        ...p.competencies.map((c) => ({ description: c.competency, evidence: c.evidence })),
        ...p.references.map((r) => ({
          description: `${r.title}: ${r.description}`,
          evidence: r.evidence,
        })),
      ];
      const misses = verifyEvidence(fx.id, fx.cv_text, items);
      results.push({
        fixtureId: fx.id,
        itemCount: items.length,
        extractedForCoverage: p.competencies.length,
        goldenCount: fx.golden.competency_count,
        verifiedCount: items.length - misses.length,
        misses,
        pairs: [
          ...p.competencies.map((c) => ({ item: `kompetens: ${c.competency}`, evidence: c.evidence })),
          ...p.references.map((r) => ({ item: `referens: ${r.title}`, evidence: r.evidence })),
        ],
      });
    } catch (err) {
      results.push(errorResult(fx.id, err));
    }
  }
  return results;
}

function assertNonEmpty(n: number, filter: string | null): void {
  if (n === 0) {
    console.error(`No fixtures found${filter ? ` matching id=${filter}` : ""}.`);
    process.exit(1);
  }
}

function parseArg(name: string): string | null {
  const i = process.argv.findIndex((a) => a === name || a.startsWith(`${name}=`));
  if (i < 0) return null;
  const a = process.argv[i];
  return a.includes("=") ? a.split("=")[1] : process.argv[i + 1] ?? null;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY not set. Put it in .env.local and source it.");
    process.exit(1);
  }

  // Fail CLOSED på okänt target: "--target=CV" (fel skiftläge) eller stavfel
  // ska inte tyst falla tillbaka till den BETALDA rfp-banan (routine-fynd #56).
  const rawTarget = parseArg("--target") ?? "rfp";
  if (rawTarget !== "rfp" && rawTarget !== "cv") {
    console.error(`Okänt --target="${rawTarget}" — giltiga värden: rfp | cv.`);
    process.exit(1);
  }
  const target: Target = rawTarget;
  const fixtureFilter = parseArg("--fixture");

  // Feltolkat tak ska faila CLOSED: Number("tjugo") = NaN och `x > NaN` är alltid
  // false → grinden hade öppnat helt.
  const rawBudget = process.env.BIDSMITH_LOOP_BUDGET_USD ?? String(DEFAULT_BUDGET_USD);
  const budget = Number(rawBudget);
  if (!Number.isFinite(budget) || budget <= 0) {
    console.error(`Ogiltig BIDSMITH_LOOP_BUDGET_USD="${rawBudget}" — budgetgrinden failar CLOSED.`);
    process.exit(1);
  }

  // BUDGETGRIND FÖRST — före ett enda betalt anrop. Summerar BÅDA target + requotes.
  const costBefore = await fetchCumulativeLoopCost(LOOP_COST_PATTERN);
  if (costBefore > budget) {
    console.error("╔════════════════════════════════════════════════════╗");
    console.error("║  BUDGETTAK ÖVERSKRIDET — INGA API-ANROP GÖRS        ║");
    console.error("╚════════════════════════════════════════════════════╝");
    console.error(
      `Kumulativ loop-kostnad $${costBefore.toFixed(4)} > tak $${budget.toFixed(2)} ` +
      `(pattern '${LOOP_COST_PATTERN}'). Höj BIDSMITH_LOOP_BUDGET_USD medvetet.`,
    );
    process.exit(1);
  }
  console.log(
    `Budgetgrind OK: kumulativ $${costBefore.toFixed(4)} / tak $${budget.toFixed(2)} ` +
    `(kvar $${(budget - costBefore).toFixed(4)}). Target: ${target}.`,
  );

  const results = target === "cv" ? await runCv(fixtureFilter) : await runRfp(fixtureFilter);

  const costAfter = await fetchCumulativeLoopCost(LOOP_COST_PATTERN);
  const timestamp = new Date().toISOString();
  const md = renderReportMd(results, target, timestamp, costAfter, budget);

  const resultsDir = path.resolve("evals/results");
  await fs.mkdir(resultsDir, { recursive: true });
  const outPath = path.join(resultsDir, `${timestamp.replace(/[:.]/g, "-")}-zero-halluc-${target}.md`);
  await fs.writeFile(outPath, md, "utf-8");

  console.log("");
  for (const r of results) {
    if (r.error) {
      console.log(`  ERROR  ${r.fixtureId}: ${r.error}`);
      continue;
    }
    const cov = r.itemCount === 0 ? 1 : r.verifiedCount / r.itemCount;
    console.log(
      `  ${r.misses.length === 0 ? "PASS" : "FAIL"}  ${r.fixtureId.padEnd(28)} ` +
      `poster=${r.itemCount} extraherade=${r.extractedForCoverage}(golden ${r.goldenCount}) ` +
      `verifierade=${r.verifiedCount} coverage=${(cov * 100).toFixed(1)}% missar=${r.misses.length}`,
    );
  }
  const totalMiss = results.reduce((s, r) => s + r.misses.length, 0);
  const anyError = results.some((r) => r.error);
  console.log("");
  console.log(totalMiss === 0 && !anyError ? "✅ 0 overifierbara påståenden — grön." : `❌ ${totalMiss} overifierbara påståenden.`);
  console.log(`Kumulativ loop-kostnad ('${LOOP_COST_PATTERN}'): $${costAfter.toFixed(4)} · tak $${budget.toFixed(2)} · kvar $${Math.max(0, budget - costAfter).toFixed(4)}`);
  if (costAfter > budget) console.log("⚠️  BUDGETTAK ÖVERSKRIDET av denna körning — höj taket medvetet före nästa varv.");
  console.log(`Resultat: ${outPath}`);

  // Non-zero exit om overifierbara påståenden ELLER fixture-fel — skriptet är grind.
  process.exit(totalMiss === 0 && !anyError ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
