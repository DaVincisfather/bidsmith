// Empty-template defect scan (design doc 2026-07-19-onboarding-measure-design.md).
// Behavior-preserving extraction of scripts/overflow-bootstrap.ts's Radrum-v4-
// specific defect-list builder into a lib function parameterized by templateId,
// so the onboarding-measure CLI (Task 4) can run the same scan for foreign
// templates. Consumed by both the frozen overflow-eval bootstrap AND the new
// CLI — the eval's own output (evals/overflow/known-template-defects.json)
// must not change, so every check, log string, and ordering here is a direct
// copy of the pre-refactor bootstrap code, not a rewrite.
import { execFile } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";
import type { SupabaseClient } from "@supabase/supabase-js";
import { grossOverflowShapes } from "@/lib/overflow-eval/gates";
import { prefixKey, readFontScalesByPrefix } from "../calibrate/font-scales";
import { TEMPLATE_BUCKET } from "../template-store";
import { dedupeDefects } from "./template-defects";
import {
  checkAutofitShrink, checkHorizontalClip, checkOutsideSlide,
  checkSingleLineBreak, checkVerticalOverflow, deadspaceFindings,
} from "./verdicts";
import type { Finding, MeasurementFile } from "./types";

const execFileAsync = promisify(execFile);
const PREFIX_LEN = 40;

/** Structurally identical to the overflow-eval's KnownDefect (gates.ts /
 *  known-template-defects.json) and to TemplateDefect minus suggestion/status
 *  — bootstrap continues writing its JSON unchanged, and Task 4 composes this
 *  straight into TemplateDefect (open, with a generated suggestion). */
export interface EmptyScanDefect {
  slide: number;
  checkId: string;
  shape: string;
  note: string;
  /** Empty-substrate measured boundHeightPt — recorded for gross-overflow
   *  entries only (the magnitude-cap baseline gates.ts's
   *  DEFECT_BASELINE_TOLERANCE_PT checks generated content against). Absent
   *  for FAIL-class entries, which keep the unconditional exclusion. */
  baselineBoundHeightPt?: number;
}

/** One empty-template scan's finding→defect mapping: same per-shape loop as
 *  scan-deck.ts's verdicts-checkarna — deliberately WITHOUT scan-deck.ts's
 *  separate raw-token xml scan: both scan targets carry unfilled {tokens} by
 *  definition (bare template resp. instrumented substrate), so raw-token
 *  findings here are the normal empty state, not defects
 *  (notes/2026-07-14-deck-scan-facit.md: 137 raw-token on the instrumented
 *  baseline, explicitly excluded there too). Pure — unit-testable without the
 *  COM harness. */
export function defectsFromMeasurement(
  measured: MeasurementFile,
  scales: Map<string, number>,
  note: string,
): EmptyScanDefect[] {
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

  const failDefects: EmptyScanDefect[] = findings
    .filter((f) => f.severity === "FAIL")
    .map((f) => ({ slide: f.slide, checkId: f.checkId, shape: f.shape, note }));

  // Gross-overflow uses gates.ts's own shared predicate (same frozen constants,
  // no known defects yet — this scan is what BUILDS the defect list) — it is not
  // a "check" in verdicts.ts, it reads shape geometry directly.
  const gross = grossOverflowShapes(measured, []);
  // baselineBoundHeightPt records THIS empty-substrate scan's measured value —
  // the magnitude-cap baseline grossOverflowShapes checks generated content
  // against (gates.ts DEFECT_BASELINE_TOLERANCE_PT) so a listed shape only
  // rides the exclusion up to baseline + tolerance, not unconditionally.
  const grossDefects: EmptyScanDefect[] = gross.map((s) => ({
    slide: s.slide, checkId: "gross-overflow", shape: s.name, note,
    baselineBoundHeightPt: s.boundHeightPt,
  }));

  return [...failDefects, ...grossDefects];
}

/** COM harness for one already-downloaded template buffer: mkdtemp, invoke
 *  measure-overflow.ps1, read back the measurement + recalculated font
 *  scales, map to defects, clean up. */
export async function scanEmptyTemplateBuffer(buffer: Buffer, note: string): Promise<EmptyScanDefect[]> {
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

    return defectsFromMeasurement(measured, scales, note);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

interface TemplateRow {
  id: string;
  name: string;
  version: number;
  storage_path: string | null;
}

export interface ScanTarget {
  storagePath: string;
  /** EmptyScanDefect.note for findings this scan produces. */
  note: string;
}

/** Onboarded templates go through the instrument+calibrate flow (ROADMAP:
 *  "Radrum v4: 6 varv, 137/137 mätta") — the templates row's storage_path is
 *  rewritten to the INSTRUMENTED copy ({name}/v{n}-instrumented.pptx) once
 *  calibration completes (onboarding/complete/route.ts:97-132), while the
 *  true original stays at its own upload path ({name}/v{n}.pptx,
 *  templates/route.ts:106) untouched.
 *
 *  BOTH are scanned (decision 2026-07-15, coordinator): generated decks render
 *  from the INSTRUMENTED copy, so it is the actual empty render substrate —
 *  its {token} label texts surface defects (Radrum slide 9's 817pt statisk
 *  text) that the original's shorter labels never trigger. The original still
 *  contributes its own content-independent gross-overflows. The defect list is
 *  the UNION of both scans; both files are contentless, so content-driven
 *  FAILs (real generated prose) stay out by construction. */
export async function resolveEmptyScanTargets(supabase: SupabaseClient, templateId: string): Promise<ScanTarget[]> {
  const { data: row, error } = await supabase
    .from("templates")
    .select("id, name, version, storage_path")
    .eq("id", templateId)
    .single();
  if (error || !row) throw new Error(`templates-raden ${templateId} saknas: ${error?.message ?? "ingen rad"}`);
  const tpl = row as TemplateRow;
  if (!tpl.storage_path) throw new Error(`mall ${templateId} saknar storage_path — bundlad mall, ingen fil att scanna`);

  const { data: listing, error: listErr } = await supabase.storage.from(TEMPLATE_BUCKET).list(tpl.name);
  if (listErr) throw new Error(`kunde inte lista storage-mappen '${tpl.name}/': ${listErr.message}`);
  console.log(`\nStorage-innehåll för '${tpl.name}/': ${(listing ?? []).map((f) => f.name).join(", ") || "(tomt)"}`);
  console.log(`templates-radens aktuella storage_path: ${tpl.storage_path}`);

  const isInstrumented = tpl.storage_path.endsWith("-instrumented.pptx");
  if (!isInstrumented) {
    throw new Error(
      `storage_path (${tpl.storage_path}) pekar inte på en -instrumented.pptx — mall ${templateId} förväntas vara onboardad; verifiera manuellt innan defektlistan byggs`,
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

/** Full empty-template defect build for one templateId: resolve targets,
 *  download + scan each (original first), union, dedupe (first-wins — the
 *  original scan's provenance note wins over the instrumented re-find),
 *  sort. */
export async function buildEmptyScanDefects(supabase: SupabaseClient, templateId: string): Promise<EmptyScanDefect[]> {
  const targets = await resolveEmptyScanTargets(supabase, templateId);

  // Original first: a defect present in BOTH scans keeps "tom originalmall"
  // (dedupeDefects is first-wins on slide+checkId+shape) — the more
  // conservative provenance, since it needs no substrate text to manifest.
  const all: EmptyScanDefect[] = [];
  for (const target of targets) {
    const { data: fileBlob, error: dlErr } = await supabase.storage
      .from(TEMPLATE_BUCKET)
      .download(target.storagePath);
    if (dlErr || !fileBlob) throw new Error(`kunde inte ladda ner ${target.storagePath}: ${dlErr?.message ?? "tom respons"}`);
    const buffer = Buffer.from(await fileBlob.arrayBuffer());

    const defects = await scanEmptyTemplateBuffer(buffer, target.note);
    const grossDefects = defects.filter((d) => d.checkId === "gross-overflow");
    const failDefects = defects.filter((d) => d.checkId !== "gross-overflow");
    console.log(
      `\nScan ${target.storagePath}: ${failDefects.length} FAIL-fynd, ${grossDefects.length} grov-overflow.`,
    );
    all.push(...defects);
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
