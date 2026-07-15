// scripts/overflow-bootstrap.ts
// CLI: npm run overflow:bootstrap
// One-off bootstrap for the overflow-eval harness (Task 5, design doc
// notes/2026-07-15-overflow-loop-design.md). Writes the two frozen inputs
// every varv of the harness consumes:
//   evals/overflow/fixtures.json               — 5 analyses + teams + templateId
//   evals/overflow/known-template-defects.json  — Radrum v4's own static defects
// Run ONCE, hand-reviewed, then committed. The loop never regenerates these —
// "Listan uppdateras ENDAST av människa" (design doc).
import { execFile } from "child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "../src/lib/supabase";
import { TEMPLATE_BUCKET } from "../src/lib/pptx-template/template-store";
import { prefixKey, readFontScalesByPrefix } from "../src/lib/pptx-template/calibrate/font-scales";
import {
  checkAutofitShrink, checkHorizontalClip, checkOutsideSlide,
  checkSingleLineBreak, checkVerticalOverflow, deadspaceFindings,
} from "../src/lib/pptx-template/measure/verdicts";
import type { Finding, MeasurementFile } from "../src/lib/pptx-template/measure/types";
import { grossOverflowShapes } from "../src/lib/overflow-eval/gates";
import type { FixturesFile, KnownDefect, OverflowFixture } from "../src/lib/overflow-eval/types";
import type { RfpAnalysis, ScoredConsultant } from "../src/lib/types";

const execFileAsync = promisify(execFile);
const PREFIX_LEN = 40;

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

/** Latest bids.team_consultant_ids for the analysis if a bid exists; else the
 *  top-3-by-score consultantId from the latest matches.team_proposal. */
async function resolveTeam(supabase: SupabaseClient, analysisId: string): Promise<string[]> {
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

  const { data: matchRow, error: matchErr } = await supabase
    .from("matches")
    .select("team_proposal, created_at")
    .eq("analysis_id", analysisId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (matchErr) throw new Error(`kunde inte läsa matches för ${analysisId}: ${matchErr.message}`);
  const proposal = (matchRow?.team_proposal ?? []) as ScoredConsultant[];
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

    const teamConsultantIds = await resolveTeam(supabase, chosen.id);
    console.log(`  Team: ${teamConsultantIds.join(", ") || "(tomt)"}`);
    fixtures.push({ id: target.id, label: target.label, analysisId: chosen.id, teamConsultantIds });
  }

  return { templateId: TEMPLATE_ID, fixtures };
}

interface TemplateRow {
  id: string;
  name: string;
  version: number;
  storage_path: string | null;
}

interface ScanTarget {
  storagePath: string;
  /** KnownDefect.note for findings this scan produced. */
  note: string;
}

/** Radrum v4 goes through the same instrument+calibrate flow as onboarded
 *  templates (ROADMAP: "Radrum v4: 6 varv, 137/137 mätta") — the templates
 *  row's storage_path was rewritten to the INSTRUMENTED copy
 *  ({name}/v{n}-instrumented.pptx) once calibration completed
 *  (onboarding/complete/route.ts:97-132), while the true original stays at
 *  its own upload path ({name}/v{n}.pptx, templates/route.ts:106) untouched.
 *
 *  BOTH are scanned (decision 2026-07-15, coordinator): generated decks render
 *  from the INSTRUMENTED copy, so it is the actual empty render substrate —
 *  its {token} label texts surface defects (Radrum slide 9's 817pt statisk
 *  text) that the original's shorter labels never trigger. The original still
 *  contributes its own content-independent gross-overflows. The defect list is
 *  the UNION of both scans; both files are contentless, so content-driven
 *  FAILs (real generated prose) stay out by construction. */
async function resolveScanTargets(supabase: SupabaseClient): Promise<ScanTarget[]> {
  const { data: row, error } = await supabase
    .from("templates")
    .select("id, name, version, storage_path")
    .eq("id", TEMPLATE_ID)
    .single();
  if (error || !row) throw new Error(`templates-raden ${TEMPLATE_ID} saknas: ${error?.message ?? "ingen rad"}`);
  const tpl = row as TemplateRow;
  if (!tpl.storage_path) throw new Error(`mall ${TEMPLATE_ID} saknar storage_path — bundlad mall, ingen fil att scanna`);

  const { data: listing, error: listErr } = await supabase.storage.from(TEMPLATE_BUCKET).list(tpl.name);
  if (listErr) throw new Error(`kunde inte lista storage-mappen '${tpl.name}/': ${listErr.message}`);
  console.log(`\nStorage-innehåll för '${tpl.name}/': ${(listing ?? []).map((f) => f.name).join(", ") || "(tomt)"}`);
  console.log(`templates-radens aktuella storage_path: ${tpl.storage_path}`);

  const isInstrumented = tpl.storage_path.endsWith("-instrumented.pptx");
  if (!isInstrumented) {
    throw new Error(
      `storage_path (${tpl.storage_path}) pekar inte på en -instrumented.pptx — Radrum v4 förväntas vara onboardad; verifiera manuellt innan defektlistan byggs`,
    );
  }
  const instrumentedPath = tpl.storage_path;
  const originalPath = tpl.storage_path.replace(/-instrumented\.pptx$/, ".pptx");
  for (const p of [originalPath, instrumentedPath]) {
    const exists = (listing ?? []).some((f) => `${tpl.name}/${f.name}` === p);
    if (!exists) {
      throw new Error(`hittar inte ${p} i storage-mappen '${tpl.name}/' — verifiera manuellt innan defektlistan byggs`);
    }
  }
  console.log(`→ scannar BÅDA: original ${originalPath} + instrumenterad ${instrumentedPath} (union)`);

  return [
    { storagePath: originalPath, note: "tom originalmall" },
    { storagePath: instrumentedPath, note: "tom instrumenterad mall" },
  ];
}

function dedupeDefects(defects: KnownDefect[]): KnownDefect[] {
  const seen = new Set<string>();
  const out: KnownDefect[] = [];
  for (const d of defects) {
    const key = `${d.slide}|${d.checkId}|${d.shape}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}

/** One empty-template scan: same per-shape loop as scan-deck.ts's
 *  verdicts-checkarna — deliberately WITHOUT scan-deck.ts's separate raw-token
 *  xml scan: both scan targets carry unfilled {tokens} by definition (bare
 *  template resp. instrumented substrate), so raw-token findings here are the
 *  normal empty state, not defects (notes/2026-07-14-deck-scan-facit.md: 137
 *  raw-token on the instrumented baseline, explicitly excluded there too). */
async function scanEmptyTemplate(supabase: SupabaseClient, target: ScanTarget): Promise<KnownDefect[]> {
  const { data: fileBlob, error: dlErr } = await supabase.storage
    .from(TEMPLATE_BUCKET)
    .download(target.storagePath);
  if (dlErr || !fileBlob) throw new Error(`kunde inte ladda ner ${target.storagePath}: ${dlErr?.message ?? "tom respons"}`);
  const buffer = Buffer.from(await fileBlob.arrayBuffer());

  const workDir = await mkdtemp(path.join(os.tmpdir(), "overflow-bootstrap-"));
  try {
    const pptxPath = path.join(workDir, "scan.pptx");
    await writeFile(pptxPath, buffer);
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

    const failDefects: KnownDefect[] = findings
      .filter((f) => f.severity === "FAIL")
      .map((f) => ({ slide: f.slide, checkId: f.checkId, shape: f.shape, note: target.note }));

    // Gross-overflow uses gates.ts's own shared predicate (same frozen constants,
    // no known defects yet — this scan is what BUILDS the defect list) — it is not
    // a "check" in verdicts.ts, it reads shape geometry directly.
    const gross = grossOverflowShapes(measured, []);
    // baselineBoundHeightPt records THIS empty-substrate scan's measured value —
    // the magnitude-cap baseline grossOverflowShapes checks generated content
    // against (gates.ts DEFECT_BASELINE_TOLERANCE_PT) so a listed shape only
    // rides the exclusion up to baseline + tolerance, not unconditionally.
    const grossDefects: KnownDefect[] = gross.map((s) => ({
      slide: s.slide, checkId: "gross-overflow", shape: s.name, note: target.note,
      baselineBoundHeightPt: s.boundHeightPt,
    }));

    console.log(
      `\nScan ${target.storagePath}: ${failDefects.length} FAIL-fynd, ${grossDefects.length} grov-overflow.`,
    );
    return [...failDefects, ...grossDefects];
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function buildKnownDefects(supabase: SupabaseClient): Promise<KnownDefect[]> {
  const targets = await resolveScanTargets(supabase);

  // Original first: a defect present in BOTH scans keeps "tom originalmall"
  // (dedupeDefects is first-wins on slide+checkId+shape) — the more
  // conservative provenance, since it needs no substrate text to manifest.
  const all: KnownDefect[] = [];
  for (const target of targets) {
    all.push(...await scanEmptyTemplate(supabase, target));
  }

  const defects = dedupeDefects(all).sort(
    (a, b) => a.slide - b.slide || a.checkId.localeCompare(b.checkId) || a.shape.localeCompare(b.shape),
  );
  console.log(`\nUnion: ${defects.length} unika defekter efter dedupe.`);
  for (const d of defects) {
    console.log(`  slide ${String(d.slide).padStart(2)}  ${d.checkId.padEnd(16)} ${d.shape.padEnd(10)} (${d.note})`);
  }
  return defects;
}

async function main() {
  const supabase = createServiceClient();

  console.log("=== Bygger evals/overflow/fixtures.json ===");
  const fixturesFile = await buildFixtures(supabase);
  await mkdir(path.dirname(FIXTURES_OUT), { recursive: true });
  await writeFile(FIXTURES_OUT, JSON.stringify(fixturesFile, null, 2) + "\n", "utf8");
  console.log(`\nSkrev ${FIXTURES_OUT} (${fixturesFile.fixtures.length} fixturer).`);

  console.log("\n=== Bygger evals/overflow/known-template-defects.json ===");
  const defects = await buildKnownDefects(supabase);
  await mkdir(path.dirname(DEFECTS_OUT), { recursive: true });
  await writeFile(DEFECTS_OUT, JSON.stringify(defects, null, 2) + "\n", "utf8");
  console.log(`\nSkrev ${DEFECTS_OUT} (${defects.length} kända defekter).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
