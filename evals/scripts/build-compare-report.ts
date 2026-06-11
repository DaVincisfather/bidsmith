// evals/scripts/build-compare-report.ts
// Läser verdicts.json + dumparna → skriver jämförelserapporten (committas),
// blindgranskningsunderlaget och facit (gitignorerade under evals/runs/).
import fs from "fs/promises";
import path from "path";
import { createServiceClient } from "@/lib/supabase";
import { renderSectionText, WRITING_SECTION_KEYS, type WinTally } from "../harness/core/compare-core";
import { pickBlindPairs, renderReportMd, type ComparePair, type ModelCost } from "../harness/core/compare-report";
import type { BidSection } from "@/lib/types";

const BLIND_PAIRS = 10;
const BLIND_SEED = 42;

interface Dump {
  model: string;
  fixtureId: string;
  rep: number;
  startedAt: string;
  finishedAt: string;
  sections: BidSection[];
}

async function readDumps(model: string): Promise<Map<string, Dump>> {
  const dir = path.resolve("evals/runs/compare", model);
  const out = new Map<string, Dump>();
  for (const f of (await fs.readdir(dir)).filter((x) => x.endsWith(".json"))) {
    out.set(f, JSON.parse(await fs.readFile(path.join(dir, f), "utf-8")));
  }
  return out;
}

// Kostnad ur ai_call_logs mellan barnens start-/sluttider, summerat per modell
// på skrivbundle-anropen (label '% bundle'). Hämtas här — inte i de rena
// renderingsfunktionerna.
async function fetchCosts(dumps: Map<string, Dump>, model: string): Promise<ModelCost> {
  const times = [...dumps.values()];
  if (times.length === 0) return { model, totalUsd: 0, perBid: 0 };
  const from = times.map((d) => d.startedAt).sort()[0];
  const to = times.map((d) => d.finishedAt).sort().at(-1)!;
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("ai_call_logs")
    .select("cost_usd")
    .eq("model", model)
    .like("label", "% bundle")
    .gte("created_at", from)
    .lte("created_at", to);
  if (error) throw error;
  const totalUsd = (data ?? []).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
  return {
    model,
    totalUsd: Number(totalUsd.toFixed(2)),
    perBid: Number((totalUsd / times.length).toFixed(3)),
  };
}

async function main() {
  const verdictsPath = path.resolve("evals/runs/compare/verdicts.json");
  const { modelA, modelB, tally } = JSON.parse(await fs.readFile(verdictsPath, "utf-8")) as {
    modelA: string;
    modelB: string;
    tally: WinTally;
  };

  const dumpsA = await readDumps(modelA);
  const dumpsB = await readDumps(modelB);

  // Alla rep-parade sektioner som finns hos båda modellerna är blindkandidater.
  const pairs: ComparePair[] = [];
  for (const [file, a] of dumpsA) {
    const b = dumpsB.get(file);
    if (!b) continue;
    for (const key of WRITING_SECTION_KEYS) {
      const secA = a.sections.find((s) => s.key === key);
      const secB = b.sections.find((s) => s.key === key);
      if (!secA || !secB) continue;
      pairs.push({
        pairFile: file,
        sectionType: key,
        textA: renderSectionText(secA),
        textB: renderSectionText(secB),
      });
    }
  }

  const blind = pickBlindPairs(pairs, Math.min(BLIND_PAIRS, pairs.length), BLIND_SEED);
  const costs = [await fetchCosts(dumpsA, modelA), await fetchCosts(dumpsB, modelB)];

  const reportPath = path.resolve("evals/results-bid-model-comparison.md");
  await fs.writeFile(reportPath, renderReportMd({ modelA, modelB, tally, costs }), "utf-8");

  const reviewLines: string[] = [
    "# Blindgranskning — fyll i Vinnare (1/2/oavgjort) per par. Titta INTE i blind-facit.json.",
    "",
    "| Par | Sektionstyp | Vinnare (1/2/oavgjort) |",
    "|---|---|---|",
    ...blind.map((p) => `| ${p.id} | ${p.sectionType} |  |`),
    "",
  ];
  for (const p of blind) {
    reviewLines.push(`## ${p.id} (${p.sectionType})`, "", "### Utkast 1", "", p.utkast1, "", "### Utkast 2", "", p.utkast2, "");
  }
  await fs.writeFile(path.resolve("evals/runs/compare/blind-review.md"), reviewLines.join("\n"), "utf-8");
  await fs.writeFile(
    path.resolve("evals/runs/compare/blind-facit.json"),
    JSON.stringify(blind.map((p) => ({ id: p.id, facit: p.facit })), null, 1),
    "utf-8",
  );

  console.log(`Skrev ${reportPath}, blind-review.md (${blind.length} par) och blind-facit.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
