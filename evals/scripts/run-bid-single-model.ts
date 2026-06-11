// evals/scripts/run-bid-single-model.ts
// Kör alla bid-generator-fixtures × N reps med skrivmodellen från env
// (BIDSMITH_WRITING_MODEL sätts av föräldern). En dump per körning.
// Dumpar skrivs inkrementellt — en 529-krasch mitt i kan köras om utan att
// färdiga körningar går förlorade (befintliga dumpar skrivs över per fil).
import fs from "fs/promises";
import path from "path";
import { MODELS } from "@/lib/models";
import { bidGeneratorConfig } from "../harness/configs/bid-generator";

const REPS = Number(process.env.BIDSMITH_COMPARE_REPS ?? 3);

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY saknas"); process.exit(1);
  }
  const model = MODELS.writing; // = env-overriden när föräldern satt den
  const outDir = path.resolve("evals/runs/compare", model);
  await fs.mkdir(outDir, { recursive: true });

  const dir = bidGeneratorConfig.fixtureDir;
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".yaml") && !f.startsWith("_stub"));

  for (const file of files) {
    const fixture = await bidGeneratorConfig.loadFixture(path.join(dir, file));
    for (let rep = 1; rep <= REPS; rep++) {
      const startedAt = new Date().toISOString();
      // runModule = harnessens befintliga väg (laddar kontext + generateAllSections)
      // — jämförelsen kör EXAKT samma kod som eval:bid-generator.
      const { output, context } = await bidGeneratorConfig.runModule(fixture);
      const dump = {
        model, fixtureId: fixture.id, rep, startedAt,
        finishedAt: new Date().toISOString(),
        overflowCount: context.overflowCount ?? 0,
        sections: output,
      };
      const outPath = path.join(outDir, `${fixture.id}-rep${rep}.json`);
      await fs.writeFile(outPath, JSON.stringify(dump, null, 1), "utf-8");
      console.log(`${model} ${fixture.id} rep${rep} klar`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
