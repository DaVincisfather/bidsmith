// scripts/overflow-bootstrap.ts
// CLI: npm run overflow:bootstrap [-- --proposals-only]
// One-off bootstrap for the overflow-eval harness (Task 5, design doc
// notes/2026-07-15-overflow-loop-design.md). Writes the two frozen inputs
// every varv of the harness consumes:
//   evals/overflow/fixtures.json               — 5 analyses + teams + proposals + templateId
//   evals/overflow/known-template-defects.json  — Radrum v4's own static defects
// Run ONCE, hand-reviewed, then committed. The loop never regenerates these —
// "Listan uppdateras ENDAST av människa" (design doc).
// --proposals-only: re-freeze ONLY the teamProposal snapshots into the existing
// fixtures.json (no re-resolution of analyses/teams, no defect-list rebuild, no
// COM) — the migration path for fixtures written before teamProposal existed.
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient, fetchLatestTeamProposal } from "../src/lib/supabase";
import { loadFixturesFileForRefreeze, saveFixturesFile } from "../src/lib/overflow-eval/fixtures";
import { buildEmptyScanDefects } from "../src/lib/pptx-template/measure/empty-scan";
import type { FixturesFile, OverflowFixture } from "../src/lib/overflow-eval/types";
import type { RfpAnalysis, ScoredConsultant } from "../src/lib/types";

const TEMPLATE_ID = "25f9d500-911f-4afb-8fc0-a30f8220c477"; // Radrum v4
const FIXTURES_OUT = path.resolve("evals", "overflow", "fixtures.json");
const DEFECTS_OUT = path.resolve("evals", "overflow", "known-template-defects.json");

interface FixtureTarget {
  id: string;
  label: string;
  /** Case-insensitive substring matched against analysis.title. Chosen to be a
   *  distinctive, un-truncated fragment (the brief's titles carry "..." for two
   *  of the five — this matches the stable prefix, not the ellipsis). */
  titleMatch: string;
  /** Soft check only — logged as a warning, never blocks. */
  expectedClient: string;
}

// Verified in dev DB 2026-07-15 (task brief) — resolved by title match at
// runtime rather than hardcoded analysis ids, so a fresh DB clone still
// resolves correctly. "senaste varianten" (NIC has duplicates) is handled
// uniformly: every target takes the newest created_at among its matches.
const TARGETS: FixtureTarget[] = [
  { id: "styrmodell", label: "Styrmodell — RetailTech", titleMatch: "styrmodell", expectedClient: "RetailTech" },
  { id: "bemanning", label: "Bemanning — Göteborgs stad", titleMatch: "bemanning", expectedClient: "Göteborg" },
  { id: "dataplattform", label: "Dataplattform — Region Sörmland", titleMatch: "dataplattform", expectedClient: "Sörmland" },
  {
    id: "strategi-nic", label: "Strategiutveckling — NIC",
    titleMatch: "strategiutveckling och tillväxtplan", expectedClient: "NIC",
  },
  {
    id: "organisationsoversyn", label: "Organisationsöversyn — Mellansvenska",
    titleMatch: "organisationsöversyn av regional förvaltning", expectedClient: "Mellansvenska",
  },
];

interface AnalysisRow {
  id: string;
  analysis: RfpAnalysis;
  created_at: string;
}

/** Shared snapshot logging for both freeze paths (full bootstrap + refreeze).
 *  The missing-ids warning guards refreezes specifically: teamConsultantIds is
 *  frozen while the proposal snapshot is re-fetched LATEST, so a newer matching
 *  run can lack rows for old team members — that passes silently and becomes
 *  "score: N/A" in the writing prompt (formatContext), shifting eval input
 *  without being visible. */
function logProposalSnapshot(
  fixtureId: string,
  analysisId: string,
  teamConsultantIds: string[],
  proposal: ScoredConsultant[],
): void {
  console.log(`  Fixtur ${fixtureId}: proposal-snapshot ${proposal.length} konsulter`);
  if (proposal.length === 0) {
    console.warn(`  VARNING: ingen matchning för ${analysisId} — teamProposal fryses TOM (skrivprompten får inga scores).`);
    return;
  }
  const missing = teamConsultantIds.filter(
    (id) => !proposal.some((c) => c.consultantId === id),
  );
  if (missing.length > 0) {
    console.warn(`  VARNING: team-id utan proposal-rad (score blir N/A i prompten): ${missing.join(", ")}`);
  }
}

/** Latest bids.team_consultant_ids for the analysis if a bid exists; else the
 *  top-3-by-score consultantId from the already-fetched proposal snapshot. */
async function resolveTeam(
  supabase: SupabaseClient,
  analysisId: string,
  proposal: ScoredConsultant[],
): Promise<string[]> {
  const { data: bidRow, error: bidErr } = await supabase
    .from("bids")
    .select("team_consultant_ids, created_at")
    .eq("analysis_id", analysisId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (bidErr) throw new Error(`kunde inte läsa bids för ${analysisId}: ${bidErr.message}`);
  const bidTeam = (bidRow?.team_consultant_ids ?? []) as string[];
  if (bidTeam.length > 0) return bidTeam;

  if (proposal.length === 0) {
    throw new Error(`analys ${analysisId} har varken anbud eller matchning — kan inte bygga ett team`);
  }
  return [...proposal].sort((a, b) => b.score - a.score).slice(0, 3).map((c) => c.consultantId);
}

async function buildFixtures(supabase: SupabaseClient): Promise<FixturesFile> {
  const { data, error } = await supabase
    .from("analyses")
    .select("id, analysis, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`kunde inte lista analyses: ${error.message}`);
  const rows = (data ?? []) as AnalysisRow[];
  console.log(`\n${rows.length} analyser i DB.`);

  const fixtures: OverflowFixture[] = [];
  for (const target of TARGETS) {
    const needle = target.titleMatch.toLowerCase();
    const matches = rows.filter((r) => (r.analysis?.title ?? "").toLowerCase().includes(needle));
    if (matches.length === 0) {
      throw new Error(`ingen analys matchar titelfragmentet "${target.titleMatch}" (fixtur ${target.id})`);
    }
    // rows is already created_at desc → matches[0] is the newest variant.
    const chosen = matches[0];
    console.log(
      `\nFixtur ${target.id} (${target.label}): ${matches.length} träff(ar) på "${target.titleMatch}"` +
        (matches.length > 1 ? " — senaste varianten vald" : ""),
    );
    for (const match of matches) {
      const marker = match.id === chosen.id ? "→" : " ";
      console.log(`  ${marker} ${match.id}  ${match.created_at}  "${match.analysis.title}" (${match.analysis.client})`);
    }
    if (!chosen.analysis.client?.toLowerCase().includes(target.expectedClient.toLowerCase())) {
      console.warn(
        `  VARNING: vald analys klient "${chosen.analysis.client}" innehåller inte förväntat "${target.expectedClient}" — granska manuellt.`,
      );
    }

    const teamProposal = await fetchLatestTeamProposal(supabase, chosen.id);
    const teamConsultantIds = await resolveTeam(supabase, chosen.id, teamProposal);
    console.log(`  Team: ${teamConsultantIds.join(", ") || "(tomt)"}`);
    logProposalSnapshot(target.id, chosen.id, teamConsultantIds, teamProposal);
    fixtures.push({ id: target.id, label: target.label, analysisId: chosen.id, teamConsultantIds, teamProposal });
  }

  return { templateId: TEMPLATE_ID, fixtures };
}

/** Re-freezes ONLY teamProposal into the existing fixtures.json — everything
 *  else (analysis resolution, teams, defect list) stays exactly as committed.
 *  Deliberately does NOT re-run buildFixtures: that would re-resolve titles
 *  against the live DB and could silently swap a fixture to a newer analysis
 *  variant, unfreezing what this file exists to freeze. */
async function freezeProposalsOnly(supabase: SupabaseClient): Promise<void> {
  const fixturesFile = await loadFixturesFileForRefreeze(FIXTURES_OUT);
  for (const fixture of fixturesFile.fixtures) {
    fixture.teamProposal = await fetchLatestTeamProposal(supabase, fixture.analysisId);
    logProposalSnapshot(fixture.id, fixture.analysisId, fixture.teamConsultantIds, fixture.teamProposal);
  }
  await saveFixturesFile(FIXTURES_OUT, fixturesFile);
  console.log(`\nSkrev ${FIXTURES_OUT} (${fixturesFile.fixtures.length} fixturer, endast teamProposal ändrad).`);
}

async function main() {
  const supabase = createServiceClient();

  if (process.argv.includes("--proposals-only")) {
    console.log("=== Fryser teamProposal i befintlig evals/overflow/fixtures.json ===");
    await freezeProposalsOnly(supabase);
    return;
  }

  console.log("=== Bygger evals/overflow/fixtures.json ===");
  const fixturesFile = await buildFixtures(supabase);
  await mkdir(path.dirname(FIXTURES_OUT), { recursive: true });
  await saveFixturesFile(FIXTURES_OUT, fixturesFile);
  console.log(`\nSkrev ${FIXTURES_OUT} (${fixturesFile.fixtures.length} fixturer).`);

  console.log("\n=== Bygger evals/overflow/known-template-defects.json ===");
  const defects = await buildEmptyScanDefects(supabase, TEMPLATE_ID);
  await mkdir(path.dirname(DEFECTS_OUT), { recursive: true });
  await writeFile(DEFECTS_OUT, JSON.stringify(defects, null, 2) + "\n", "utf8");
  console.log(`\nSkrev ${DEFECTS_OUT} (${defects.length} kända defekter).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
