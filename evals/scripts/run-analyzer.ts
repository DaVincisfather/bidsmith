import path from "path";
import fs from "fs/promises";
import { analyzerConfig } from "../harness/configs/analyzer";
import { runEval } from "../harness/core/runner";
import { formatConsoleReport, writeJsonReport } from "../harness/core/reporter";
import { loadThresholds } from "../harness/core/thresholds";
import { AnalyzerFixtureSchema } from "../harness/core/fixtures";
import { loadFixtureFromString } from "../harness/core/fixture-loader";
import type { AnalyzerFixture } from "../harness/core/fixtures";

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY not set. Put it in .env.local and source it.");
    process.exit(1);
  }

  // Parse --fixture flag
  const fixtureArgIdx = process.argv.indexOf("--fixture");
  const fixtureFilter = fixtureArgIdx >= 0 ? process.argv[fixtureArgIdx + 1] : null;

  // Load fixtures
  const dir = analyzerConfig.fixtureDir;
  const entries = await fs.readdir(dir);
  // .draft.yaml är ogranskade golden-utkast (draft-analyzer-golden.ts) — får
  // aldrig laddas som skarpa fixtures: facit vore modellens egen output.
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

  if (fixtures.length === 0) {
    console.error(`No fixtures found in ${dir}${fixtureFilter ? ` matching id=${fixtureFilter}` : ""}.`);
    process.exit(1);
  }

  console.log(`Running ${fixtures.length} analyzer fixture(s)...`);

  const run = await runEval(analyzerConfig, fixtures);

  const thresholds = await loadThresholds(path.resolve("evals/thresholds.yaml"));
  console.log(formatConsoleReport(run, thresholds));

  const runsDir = path.resolve("evals/runs");
  const outPath = await writeJsonReport(run, runsDir);
  console.log(`Result: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
