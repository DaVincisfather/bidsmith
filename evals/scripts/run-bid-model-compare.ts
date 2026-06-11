// evals/scripts/run-bid-model-compare.ts
// Spawnar ett barn per modell (env-override), parar dumparna rep-vis och kör
// parvis blind judge på skrivsektionerna. Resultat: evals/runs/compare/verdicts.json
import { execFileSync } from "child_process";
import fs from "fs/promises";
import path from "path";
import { MODELS } from "@/lib/models";
import { judgePairBlind } from "../harness/core/pairwise-judge";
import { aggregateVerdicts } from "../harness/core/compare-core";
import type { SectionVerdict } from "../harness/core/compare-core";
import { readDumps, collectComparePairs } from "../harness/core/compare-io";

async function main() {
  // Föräldern definierar jämförelsen — en kvarglömd override i skalet skulle
  // få båda barnen att köra samma modell och judgen att jämföra den mot sig själv.
  if (process.env.BIDSMITH_WRITING_MODEL) {
    console.error("Sätt inte BIDSMITH_WRITING_MODEL när föräldern körs — den sätts per barnprocess.");
    process.exit(1);
  }
  const MODEL_A = MODELS.writing; // bas (Opus 4.8)
  const MODEL_B = MODELS.writingChallenger; // utmanare (Fable 5)

  for (const model of [MODEL_A, MODEL_B]) {
    console.log(`=== Genererar med ${model} ===`);
    execFileSync("npx", ["tsx", "evals/scripts/run-bid-single-model.ts"], {
      stdio: "inherit",
      shell: process.platform === "win32",
      env: { ...process.env, BIDSMITH_WRITING_MODEL: model },
    });
  }

  const dumpsA = await readDumps(MODEL_A);
  const dumpsB = await readDumps(MODEL_B);
  const pairs = collectComparePairs(dumpsA, dumpsB, (msg) => console.warn(msg));

  const verdictsPath = path.resolve("evals/runs/compare/verdicts.json");
  const verdicts: Array<SectionVerdict & { pairFile: string }> = [];
  // Inkrementell skrivning per par — en krasch mitt i (529, ENOENT) kastar
  // inte redan betalda judge-domar (samma motivering som barnets inkrementella dumpar).
  const flush = async () =>
    fs.writeFile(
      verdictsPath,
      JSON.stringify(
        { modelA: MODEL_A, modelB: MODEL_B, verdicts, tally: aggregateVerdicts(verdicts) },
        null, 1,
      ),
      "utf-8",
    );
  for (const pair of pairs) {
    const v = await judgePairBlind({
      sectionType: pair.sectionType,
      textA: pair.textA,
      textB: pair.textB,
    });
    verdicts.push({ ...v, pairFile: pair.pairFile });
    console.log(`${pair.pairFile} ${pair.sectionType}: ${v.winner}`);
    await flush();
  }
  await flush(); // tom matris ger ändå en läsbar verdicts.json (torrtestet i 13.3)
  console.log(JSON.stringify(aggregateVerdicts(verdicts), null, 1));
}

main().catch((e) => { console.error(e); process.exit(1); });
