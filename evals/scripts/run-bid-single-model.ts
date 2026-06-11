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
  // Samma filtrering som run-bid-generator (.yaml + .yml, sorterad) — en fixture
  // får inte tyst falla ur A/B-körningen för att den har fel ändelse.
  const files = (await fs.readdir(dir))
    .filter((f) => (f.endsWith(".yaml") || f.endsWith(".yml")) && !f.startsWith("_stub"))
    .sort();

  for (const file of files) {
    const fixture = await bidGeneratorConfig.loadFixture(path.join(dir, file));
    for (let rep = 1; rep <= REPS; rep++) {
      const outPath = path.join(outDir, `${fixture.id}-rep${rep}.json`);
      // Omkörningsbarhet på riktigt: befintliga (betalda) dumpar hoppas över så
      // ett 529-hål bara kostar de saknade körningarna. Korrupt dump? Radera
      // filen och kör om — readDumps pekar ut den vid parning.
      try {
        await fs.access(outPath);
        console.log(`${model} ${fixture.id} rep${rep} finns redan — hoppar`);
        continue;
      } catch { /* saknas — generera */ }
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
      await fs.writeFile(outPath, JSON.stringify(dump, null, 1), "utf-8");
      console.log(`${model} ${fixture.id} rep${rep} klar`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
