// scripts/overflow-eval.ts
// CLI: npm run overflow:eval -- --varv <N> [--only <fixtureId>] [--keep-bids]
// One full measurement round for the overflow-eval harness (Task 6, design doc
// notes/2026-07-15-overflow-loop-design.md). Sequentially, per frozen fixture
// (evals/overflow/fixtures.json): generates a bid directly via the bid-generator
// lib (no dev server, no after()), renders it against the onboarded template
// profile, COM-measures the exported .pptx (same flow as scripts/scan-deck.ts),
// applies the fitness v1 gates (src/lib/overflow-eval), and writes
// evals/overflow/runs/varv-NN/{rapport.json,rapport.md,<fixtureId>.pptx,
// <fixtureId>.scan.json}. Eval bid rows are deleted from Supabase after
// measurement (unless --keep-bids) — the on-disk artifacts are the archive.
import { execFile } from "child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient, fetchConsultantsByIds, EMPTY_GO_NO_GO } from "../src/lib/supabase";
import { runBidGeneration } from "../src/lib/bid-generator/run-bid-generation";
import type { BidContext } from "../src/lib/bid-generator";
import { loadTemplate } from "../src/lib/pptx-template/template-store";
import { loadActiveProfile } from "../src/lib/org-profile";
import { loadTemplateProfile } from "../src/lib/pptx-template/profile-store";
import { isAllGenericProfile } from "../src/lib/pptx-template/template-profile";
import { renderFromProfile } from "../src/lib/pptx-template/render-from-profile";
import { buildMasterContext } from "../src/app/api/bids/[id]/export/build-master-context";
import { buildSlotMeta } from "../src/lib/bid-editor/slot-meta";
import { readPptxSlides } from "../src/lib/pptx-template/introspect/read-pptx";
import { prefixKey, readFontScalesByPrefix } from "../src/lib/pptx-template/calibrate/font-scales";
import {
  checkAutofitShrink, checkHorizontalClip, checkOutsideSlide,
  checkSingleLineBreak, checkVerticalOverflow, deadspaceFindings,
} from "../src/lib/pptx-template/measure/verdicts";
import { buildReport } from "../src/lib/pptx-template/measure/report";
import { SEVERITIES } from "../src/lib/pptx-template/measure/types";
import type { Finding, MeasurementFile } from "../src/lib/pptx-template/measure/types";
import { collectDuplicates, collectFill, totalProseChars } from "../src/lib/overflow-eval/text-metrics";
import { applyGates } from "../src/lib/overflow-eval/gates";
import { buildRunReport, renderMarkdown } from "../src/lib/overflow-eval/report";
import type { RunReport } from "../src/lib/overflow-eval/report";
import type {
  BidMeasurement, FixturesFile, GateResult, KnownDefect, OverflowFixture,
} from "../src/lib/overflow-eval/types";
import type { BidSection, RfpAnalysis } from "../src/lib/types";

const execFileAsync = promisify(execFile);
const PREFIX_LEN = 40;

const FIXTURES_PATH = path.resolve("evals", "overflow", "fixtures.json");
const DEFECTS_PATH = path.resolve("evals", "overflow", "known-template-defects.json");
const RUNS_ROOT = path.resolve("evals", "overflow", "runs");

interface Args {
  varv: number;
  only: string | null;
  keepBids: boolean;
}

function parseArgs(argv: string[]): Args {
  const varvIdx = argv.indexOf("--varv");
  if (varvIdx < 0 || !argv[varvIdx + 1]) {
    throw new Error("Användning: npm run overflow:eval -- --varv <N> [--only <fixtureId>] [--keep-bids]");
  }
  const varv = Number(argv[varvIdx + 1]);
  if (!Number.isInteger(varv) || varv < 0) {
    throw new Error(`--varv kräver ett heltal >= 0, fick "${argv[varvIdx + 1]}"`);
  }
  const onlyIdx = argv.indexOf("--only");
  const only = onlyIdx >= 0 ? (argv[onlyIdx + 1] ?? null) : null;
  if (onlyIdx >= 0 && !only) throw new Error("--only kräver ett fixture-id");
  const keepBids = argv.includes("--keep-bids");
  return { varv, only, keepBids };
}

function runDirFor(varv: number): string {
  return path.join(RUNS_ROOT, `varv-${String(varv).padStart(2, "0")}`);
}

async function gitCommit(): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--short", "HEAD"]);
    return stdout.trim();
  } catch {
    return "(okänd commit)";
  }
}

interface AbortCost {
  costUsd: number;
}

/** Reads a round's abort-cost.json, returning 0 if absent/unreadable. Shared
 *  by accumulatedCostBefore (reading past rounds' ledgers) and the abort
 *  handler in main() (accumulating a repeated abort onto the same round). */
async function readAbortCost(dir: string): Promise<number> {
  try {
    const abort = JSON.parse(await readFile(path.join(dir, "abort-cost.json"), "utf8")) as AbortCost;
    return abort.costUsd;
  } catch {
    return 0;
  }
}

/** Books a spend into the round's abort-cost.json, additively across calls.
 *  Despite the file name (kept from the abort path that introduced it), this is
 *  the round's general off-report spend ledger: every spend that never reaches a
 *  rapport.json — aborted attempts AND successful --only partials — lands here,
 *  so accumulatedCostBefore counts it toward the $50 cap. Returns the new total. */
async function addToCostLedger(dir: string, costUsd: number): Promise<number> {
  const total = (await readAbortCost(dir)) + costUsd;
  await writeFile(
    path.join(dir, "abort-cost.json"),
    JSON.stringify({ costUsd: total }, null, 2) + "\n",
    "utf8",
  );
  return total;
}

/** Sums costUsdRun over every varv-NN directory strictly before `varv`, plus
 *  finds the immediately preceding varv's report (for delta). rapport.json is
 *  the harness's own cost ledger — cheaper and more precise than re-scanning
 *  ai_call_logs across the whole table's history. A varv that threw mid-round
 *  (partial generation, transport error) never reaches rapport.json but DID
 *  spend real money before it aborted — abort-cost.json (written in the catch
 *  block below, before insertedBidIds are deleted and ai_call_logs.bid_id is
 *  nulled by the FK) is that varv's cost ledger instead. An aborted attempt
 *  and its successful re-run of the SAME varv are both real, separate spends,
 *  so a round with a rapport.json is never skipped past — its abort-cost.json
 *  (if any, from an earlier aborted attempt before the re-run succeeded) is
 *  added on top, not treated as mutually exclusive. rapport.partial.json
 *  (a --only run) is deliberately NOT read here — it must not seed `previous`
 *  (poisoned delta baseline). Its spend still counts: the --only success path
 *  books its costUsdRun into the same abort-cost.json ledger (addToCostLedger),
 *  which IS read here — a partial's bids and a later full re-run's bids are
 *  separate real spends, so counting both is correct bookkeeping. */
async function accumulatedCostBefore(varv: number): Promise<{ sum: number; previous: RunReport | null }> {
  let names: string[];
  try {
    names = (await readdir(RUNS_ROOT, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return { sum: 0, previous: null }; // runs/ doesn't exist yet — first ever varv
  }
  const nums = names
    .map((name) => /^varv-(\d+)$/.exec(name))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]))
    .filter((n) => n < varv)
    .sort((a, b) => a - b);

  let sum = 0;
  let previous: RunReport | null = null;
  for (const n of nums) {
    try {
      const report = JSON.parse(await readFile(path.join(runDirFor(n), "rapport.json"), "utf8")) as RunReport;
      sum += report.costUsdRun;
      previous = report; // last iteration (highest n < varv) wins → immediately preceding varv
    } catch {
      // no rapport.json — either the varv never completed (aborted) or it was a
      // --only partial run (rapport.partial.json).
    }
    // Not an else-branch of the try above: a round can have BOTH a rapport.json
    // (the successful re-run) and an abort-cost.json (an earlier aborted
    // attempt of the same varv) — both spent real money.
    sum += await readAbortCost(runDirFor(n));
  }

  // The CURRENT round's own directory may already hold an abort-cost.json from
  // a previous aborted attempt of this same varv (retried after a transport
  // error) — that spend is real and must be counted even though the loop above
  // only ever considers n < varv.
  sum += await readAbortCost(runDirFor(varv));

  return { sum, previous };
}

async function sumBidCosts(supabase: SupabaseClient, bidIds: string[]): Promise<number> {
  if (bidIds.length === 0) return 0;
  const { data, error } = await supabase.from("ai_call_logs").select("cost_usd").in("bid_id", bidIds);
  if (error) throw new Error(`kunde inte summera ai_call_logs för varvets bud: ${error.message}`);
  return (data ?? []).reduce((sum: number, r: { cost_usd: unknown }) => sum + (Number(r.cost_usd) || 0), 0);
}

/** measure-overflow.ps1 + verdicts-checkarna + raw-token — samma flöde som
 *  scripts/scan-deck.ts, körd programmatiskt mot en redan skriven .pptx. */
async function measureBid(
  pptxPath: string,
  buffer: Buffer,
): Promise<{ measured: MeasurementFile; findings: Finding[] }> {
  const workDir = await mkdtemp(path.join(os.tmpdir(), "overflow-eval-"));
  try {
    const measureJson = path.join(workDir, "measure.json");
    const recalcPath = path.join(workDir, "recalc.pptx");
    await execFileAsync("pwsh", [
      "-NoProfile", "-File", path.resolve("scripts", "measure-overflow.ps1"),
      "-Pptx", pptxPath, "-OutJson", measureJson, "-RecalcOut", recalcPath,
    ], { timeout: 300_000 });

    const measured = JSON.parse(await readFile(measureJson, "utf8")) as MeasurementFile;
    const scales = await readFontScalesByPrefix(await readFile(recalcPath), PREFIX_LEN);

    const findings: Finding[] = [];
    for (const m of measured.shapes) {
      const scale = scales.get(prefixKey(m.textPrefix, PREFIX_LEN)) ?? null;
      for (const f of [
        checkVerticalOverflow(m),
        checkOutsideSlide(m, measured.slideWidthPt, measured.slideHeightPt),
        checkHorizontalClip(m),
        checkSingleLineBreak(m),
        checkAutofitShrink(m, scale),
      ]) {
        if (f) findings.push(f);
      }
    }
    findings.push(...deadspaceFindings(measured.shapes));

    // raw-token (xml): any {token} left in the exported deck is an unfilled slot
    // — a real FAIL the design doc counts toward the 0-FAIL goal, same as scan-deck.ts.
    const slides = await readPptxSlides(buffer);
    for (const slide of slides) {
      for (const token of slide.tokens) {
        findings.push({
          checkId: "raw-token", severity: SEVERITIES["raw-token"], slide: slide.source,
          shape: "(xml)", detail: `ofylld platshållare kvar: ${token}`,
        });
      }
    }

    return { measured, findings };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function main() {
  const { varv, only, keepBids } = parseArgs(process.argv.slice(2));

  const fixturesFile = JSON.parse(await readFile(FIXTURES_PATH, "utf8")) as FixturesFile;
  const knownDefects = JSON.parse(await readFile(DEFECTS_PATH, "utf8")) as KnownDefect[];

  let targets: OverflowFixture[] = fixturesFile.fixtures;
  if (only) {
    targets = targets.filter((f) => f.id === only);
    if (targets.length === 0) {
      throw new Error(`--only "${only}" matchar ingen fixtur i ${FIXTURES_PATH}`);
    }
  }

  const supabase = createServiceClient();

  // Fail fast if the free-tier project is paused (NXDOMAIN/timeout) rather than
  // failing deep inside the first fixture's generation.
  const { error: pingError } = await supabase.from("templates").select("id").limit(1);
  if (pingError) {
    throw new Error(
      `Supabase-anropet misslyckades (${pingError.message}) — projektet kan vara pausat ` +
      `(free tier, ~7 dagars inaktivitet). Kontrollera dashboarden och vänta ~5 min på boot innan omkörning.`,
    );
  }

  const template = await loadTemplate(fixturesFile.templateId);
  const storedProfile = await loadTemplateProfile(fixturesFile.templateId);
  if (!storedProfile) {
    throw new Error(
      `mall ${fixturesFile.templateId} saknar en sparad mallprofil (template_profiles) — ` +
      `onboarda/kalibrera mallen innan overflow:eval körs.`,
    );
  }
  // Fail loud: renderFromProfile below assumes the foreign-template profile path
  // (isAllGenericProfile true — see run-bid-generation.ts's own routing check).
  // A non-generic profile silently renders wrong; catching it here beats a
  // confusing measurement-time failure deep in the fixture loop.
  if (!isAllGenericProfile(storedProfile)) {
    throw new Error(
      `mall ${fixturesFile.templateId}s profil är inte all-generic-prose (isAllGenericProfile=false) — ` +
      `overflow:eval förutsätter foreign-mall-vägen (profile-driven generation + renderFromProfile).`,
    );
  }
  const slotMeta = buildSlotMeta(storedProfile);
  const orgProfile = await loadActiveProfile();

  const runDir = runDirFor(varv);
  await mkdir(runDir, { recursive: true });

  const insertedBidIds: string[] = [];
  let exitCode = 1;

  try {
    const results: { bid: BidMeasurement; gate: GateResult }[] = [];

    for (const fixture of targets) {
      console.log(`\n=== ${fixture.id} (${fixture.label}) ===`);

      const { data: analysisRow, error: analysisError } = await supabase
        .from("analyses")
        .select("analysis")
        .eq("id", fixture.analysisId)
        .single();
      if (analysisError || !analysisRow) {
        throw new Error(`analys ${fixture.analysisId} (fixtur ${fixture.id}) saknas: ${analysisError?.message ?? "ingen rad"}`);
      }
      const analysis = analysisRow.analysis as RfpAnalysis;

      const teamConsultants = await fetchConsultantsByIds(supabase, fixture.teamConsultantIds);

      // Frozen at bootstrap — NEVER looked up live: score/reasoning go verbatim
      // into the writing prompt (formatContext), so a new matching run between
      // rounds would silently change the eval's input and poison the delta.
      const scoredConsultants = fixture.teamProposal;
      if (!Array.isArray(scoredConsultants)) {
        throw new Error(
          `fixtur ${fixture.id} saknar teamProposal (äldre fixtures.json) — ` +
          `kör npm run overflow:bootstrap -- --proposals-only och committa om filen.`,
        );
      }

      const { data: bidRow, error: bidInsertError } = await supabase
        .from("bids")
        .insert({
          analysis_id: fixture.analysisId,
          team_consultant_ids: fixture.teamConsultantIds,
          template_id: template.id,
          status: "generating",
        })
        .select("id")
        .single();
      if (bidInsertError || !bidRow) {
        throw new Error(`kunde inte skapa bid-rad för fixtur ${fixture.id}: ${bidInsertError?.message ?? "ingen rad"}`);
      }
      const bidId = bidRow.id as string;
      insertedBidIds.push(bidId);
      console.log(`bid ${bidId} skapad — genererar...`);

      const ctx: BidContext = {
        analysis,
        teamConsultants,
        scoredConsultants,
        goNoGoResult: EMPTY_GO_NO_GO,
        userId: null,
        bidId,
        profile: orgProfile,
      };
      await runBidGeneration(supabase, bidId, ctx, { id: template.id, manifest: template.manifest });

      const { data: finishedBid, error: readBackError } = await supabase
        .from("bids")
        .select("status, sections, generation_error, failed_bundles")
        .eq("id", bidId)
        .single();
      if (readBackError || !finishedBid) {
        throw new Error(`kunde inte läsa tillbaka bid ${bidId}: ${readBackError?.message ?? "ingen rad"}`);
      }
      if (finishedBid.status !== "draft") {
        throw new Error(
          `bid ${bidId} (fixtur ${fixture.id}) blev inte 'draft' (status='${finishedBid.status}') — ` +
          `${finishedBid.generation_error ?? "inget felmeddelande"}. Varvet avbryts (INTE räknat som "ingen förbättring").`,
        );
      }
      // A partial generation (some slots/bundles failed but enough succeeded to
      // reach 'draft') must not be measured as if it were a clean bid — the
      // missing content would masquerade as content-driven gate failures.
      // Protocol rule 4: API-/transportfel fäller varvet utan att räknas som
      // stagnation, so this aborts the round the same way a hard error does.
      const failedBundles = (finishedBid.failed_bundles as unknown[] | null) ?? [];
      if (failedBundles.length > 0) {
        throw new Error(
          `bid ${bidId} (fixtur ${fixture.id}) genererades delvis — ${failedBundles.length} misslyckad(e) ` +
          `enhet(er) i failed_bundles. Varvet avbryts (protokollregel 4 — API-/transportfel räknas inte som stagnation).`,
        );
      }
      const sections = finishedBid.sections as BidSection[];
      console.log(`genererad — renderar...`);

      const master = buildMasterContext({ analysis, now: new Date(), companyName: orgProfile?.companyName });
      const buffer = await renderFromProfile(template, storedProfile, sections, master);

      const pptxPath = path.join(runDir, `${fixture.id}.pptx`);
      await writeFile(pptxPath, buffer);

      console.log(`renderad — mäter (COM)...`);
      const { measured, findings } = await measureBid(pptxPath, buffer);

      const scanReport = buildReport(`${fixture.id}.pptx`, measured.slideCount, findings);
      await writeFile(
        path.join(runDir, `${fixture.id}.scan.json`),
        JSON.stringify(scanReport, null, 2) + "\n",
        "utf8",
      );

      const duplicates = collectDuplicates(sections, slotMeta);
      const fill = collectFill(sections, slotMeta);
      const totalChars = totalProseChars(sections);

      const bidMeasurement: BidMeasurement = {
        fixtureId: fixture.id,
        label: fixture.label,
        bidId,
        findings,
        measurement: measured,
        duplicates,
        fill,
        totalChars,
      };
      const gate = applyGates(bidMeasurement, knownDefects);
      results.push({ bid: bidMeasurement, gate });

      console.log(
        `${fixture.id}: ${gate.pass ? "PASS" : "FAIL"} — ` +
        `fails ${scanReport.summary.fail}, warns ${scanReport.summary.warn}, ` +
        `dup ${duplicates.length}, tecken ${totalChars}` +
        (gate.breaches.length > 0 ? ` [${gate.breaches.map((b) => b.gate).join(", ")}]` : ""),
      );
    }

    const costUsdRun = await sumBidCosts(supabase, insertedBidIds);
    const { sum: accumulatedBefore, previous } = await accumulatedCostBefore(varv);
    const costUsdAccumulated = accumulatedBefore + costUsdRun;
    const branchCommit = await gitCommit();

    const report = buildRunReport({
      varv, branchCommit, results, previous, knownDefects, costUsdRun, costUsdAccumulated,
    });
    const md = renderMarkdown(report);

    // --only measures a single fixture, not all 5 — its aggregate is not
    // comparable to a full round and must never seed the next full round's
    // delta baseline (accumulatedCostBefore only ever reads "rapport.json").
    const reportBase = only ? "rapport.partial" : "rapport";
    await writeFile(path.join(runDir, `${reportBase}.json`), JSON.stringify(report, null, 2) + "\n", "utf8");
    await writeFile(path.join(runDir, `${reportBase}.md`), md + "\n", "utf8");
    if (only) {
      // rapport.partial.json is never read by accumulatedCostBefore, so without
      // this the --only run's spend would vanish from the $50-cap accounting.
      // Booked AFTER the report above — its own costUsdAccumulated already
      // includes this run via `+ costUsdRun`, so booking first would double it.
      const ledgerTotal = await addToCostLedger(runDir, costUsdRun);
      console.log(
        `\n--only ${only}: rapporten skrevs som ${reportBase}.json/.md (räknas inte som fullt varv); ` +
        `$${costUsdRun.toFixed(2)} bokfört i abort-cost.json ($${ledgerTotal.toFixed(2)} off-report ackumulerat för varvet).`,
      );
    }

    console.log("\n" + md);

    exitCode = report.aggregate.passed === report.aggregate.total ? 0 : 1;
  } catch (err) {
    // The round aborted (transport error, partial generation, ...) before a
    // report could be built. Bids already exist and were already billed — sum
    // their ai_call_logs cost NOW, before the finally-block below deletes them
    // (the FK sets ai_call_logs.bid_id to null on delete, so this is the last
    // moment that link is queryable). accumulatedCostBefore reads this file for
    // varvs that never produced a rapport.json. Cost capture is best-effort and
    // must never mask the original error (e.g. the same Supabase transport
    // failure that caused the abort can also break sumBidCosts here) — the
    // original `err` is always rethrown below regardless of what happens in
    // this block.
    if (insertedBidIds.length > 0) {
      try {
        const costUsd = await sumBidCosts(supabase, insertedBidIds);
        const totalCostUsd = await addToCostLedger(runDir, costUsd);
        console.error(
          `\nVarvet avbröts — $${costUsd.toFixed(2)} redan spenderat på ${insertedBidIds.length} bud ` +
          `(skrivet till abort-cost.json innan städningen; $${totalCostUsd.toFixed(2)} ackumulerat för detta varv).`,
        );
      } catch (costErr) {
        console.error(`VARNING: kunde inte fånga avbrottskostnad för varvet: ${String(costErr)}`);
      }
    }
    throw err;
  } finally {
    if (insertedBidIds.length > 0) {
      if (keepBids) {
        console.log(`\n--keep-bids: behåller ${insertedBidIds.length} bid-rader (${insertedBidIds.join(", ")}).`);
      } else {
        const { error: deleteError } = await supabase.from("bids").delete().in("id", insertedBidIds);
        if (deleteError) {
          console.error(`VARNING: kunde inte städa ${insertedBidIds.length} eval-bid ur bids: ${deleteError.message}`);
        } else {
          console.log(`\nStädat: ${insertedBidIds.length} eval-bid raderade ur bids.`);
        }
      }
    }
  }

  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
