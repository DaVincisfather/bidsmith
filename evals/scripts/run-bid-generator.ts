import path from "path";
import fs from "fs/promises";
import { bidGeneratorConfig } from "../harness/configs/bid-generator";
import { runEval } from "../harness/core/runner";
import { formatConsoleReport, writeJsonReport } from "../harness/core/reporter";
import { loadThresholds } from "../harness/core/thresholds";
import { BidGeneratorFixtureSchema } from "../harness/core/fixtures";
import { loadFixtureFromString } from "../harness/core/fixture-loader";
import type { BidGeneratorFixture } from "../harness/core/fixtures";

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY not set. Put it in .env.local and source it.");
    process.exit(1);
  }

  const fixtureArgIdx = process.argv.indexOf("--fixture");
  const fixtureFilter = fixtureArgIdx >= 0 ? process.argv[fixtureArgIdx + 1] : null;

  const dir = bidGeneratorConfig.fixtureDir;
  const entries = await fs.readdir(dir);
  const yamlFiles = entries.filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  const fixtures: BidGeneratorFixture[] = [];
  for (const file of yamlFiles.sort()) {
    const content = await fs.readFile(path.join(dir, file), "utf-8");
    const fx = loadFixtureFromString(content, BidGeneratorFixtureSchema, file);
    if (fixtureFilter && fx.id !== fixtureFilter) continue;
    fixtures.push(fx);
  }

  if (fixtures.length === 0) {
    console.error(`No fixtures found in ${dir}${fixtureFilter ? ` matching id=${fixtureFilter}` : ""}.`);
    process.exit(1);
  }

  console.log(`Running ${fixtures.length} bid-generator fixture(s)...`);

  const run = await runEval(bidGeneratorConfig, fixtures);

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
