// evals/scripts/run-bid-model-compare.ts
// Spawnar ett barn per modell (env-override), parar dumparna rep-vis och kör
// parvis blind judge på skrivsektionerna. Resultat: evals/runs/compare/verdicts.json
import { execFileSync } from "child_process";
import fs from "fs/promises";
import path from "path";
import { MODELS } from "@/lib/models";
import { judgePairBlind } from "../harness/core/pairwise-judge";
import { renderSectionText, aggregateVerdicts, WRITING_SECTION_KEYS } from "../harness/core/compare-core";
import type { SectionVerdict } from "../harness/core/compare-core";
import type { BidSection } from "@/lib/types";

const MODEL_A = MODELS.writing;            // bas (Opus 4.8)
const MODEL_B = MODELS.writingChallenger;  // utmanare (Fable 5)

async function main() {
  for (const model of [MODEL_A, MODEL_B]) {
    console.log(`=== Genererar med ${model} ===`);
    execFileSync("npx", ["tsx", "evals/scripts/run-bid-single-model.ts"], {
      stdio: "inherit",
      shell: process.platform === "win32",
      env: { ...process.env, BIDSMITH_WRITING_MODEL: model },
    });
  }

  const dirA = path.resolve("evals/runs/compare", MODEL_A);
  const dumpsA = (await fs.readdir(dirA)).filter((f) => f.endsWith(".json"));
  const verdictsPath = path.resolve("evals/runs/compare/verdicts.json");
  const verdicts: Array<SectionVerdict & { pairFile: string }> = [];
  // Inkrementell skrivning per dumpfil — en krasch mitt i (529, ENOENT) kastar
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
  for (const file of dumpsA) {
    const a = JSON.parse(await fs.readFile(path.join(dirA, file), "utf-8"));
    const bPath = path.resolve("evals/runs/compare", MODEL_B, file);
    let b;
    try {
      b = JSON.parse(await fs.readFile(bPath, "utf-8"));
    } catch {
      // Saknad FIL (inte bara saknad sektion): B:s barn dog mitt i — hoppa,
      // krascha inte bort judge-fasen. Kör om det barnet och sedan föräldern.
      console.warn(`Hoppar ${file} — dump saknas hos ${MODEL_B} (kör om det barnet)`);
      continue;
    }
    for (const key of WRITING_SECTION_KEYS) {
      const secA = (a.sections as BidSection[]).find((s) => s.key === key);
      const secB = (b.sections as BidSection[]).find((s) => s.key === key);
      if (!secA || !secB) {
        console.warn(`Hoppar ${file}/${key} — sektion saknas (kontrollera 529-hål)`);
        continue;
      }
      const v = await judgePairBlind({
        sectionType: key,
        textA: renderSectionText(secA),
        textB: renderSectionText(secB),
      });
      verdicts.push({ ...v, pairFile: file });
      console.log(`${file} ${key}: ${v.winner}`);
    }
    await flush();
  }
  await flush(); // tom matris ger ändå en läsbar verdicts.json (torrtestet i 13.3)
  console.log(JSON.stringify(aggregateVerdicts(verdicts), null, 1));
}

main().catch((e) => { console.error(e); process.exit(1); });
