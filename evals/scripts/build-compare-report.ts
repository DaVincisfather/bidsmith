// evals/scripts/build-compare-report.ts
// Läser verdicts.json + dumparna → skriver jämförelserapporten (committas),
// blindgranskningsunderlaget och facit (gitignorerade under evals/runs/).
import fs from "fs/promises";
import path from "path";
import { createServiceClient } from "@/lib/supabase";
import { type WinTally } from "../harness/core/compare-core";
import { pickBlindPairs, renderReportMd, type ModelCost } from "../harness/core/compare-report";
import { readDumps, collectComparePairs, type CompareDump } from "../harness/core/compare-io";

// Env-styrda av samma skäl som BIDSMITH_COMPARE_REPS: en andra granskningomgång
// (fler par, ny seed) ska inte kräva kodändring. OBS: ändrad seed efter att
// blind-review.md fyllts i gör facit oanvändbart — kör om hela genereringen.
const BLIND_PAIRS = Number(process.env.BIDSMITH_BLIND_PAIRS ?? 10);
const BLIND_SEED = Number(process.env.BIDSMITH_BLIND_SEED ?? 42);

// Kostnad ur ai_call_logs mellan barnens start-/sluttider, summerat per modell
// på skrivbundle-anropen (label '% bundle'). Hämtas här — inte i de rena
// renderingsfunktionerna. Kända begränsningar (acceptabla för en informativ
// rapportrad): logAiCall är fire-and-forget så sista radernas created_at kan
// släpa efter finishedAt (60s slack nedan), och fönstret är oattribuerat —
// parallella anrop med samma modell i fönstret räknas med.
async function fetchCosts(dumps: Map<string, CompareDump>, model: string): Promise<ModelCost> {
  const times = [...dumps.values()];
  if (times.length === 0) return { model, totalUsd: 0, perBid: 0 };
  const from = times.map((d) => d.startedAt).sort()[0];
  const lastFinished = times.map((d) => d.finishedAt).sort().at(-1)!;
  const to = new Date(new Date(lastFinished).getTime() + 60_000).toISOString();
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

  // Samma par-byggnad som judge-fasen (compare-io) — blindgranskningen måste
  // bedöma exakt de texter judge-tallyn bygger på.
  const pairs = collectComparePairs(dumpsA, dumpsB);

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
