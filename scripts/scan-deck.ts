// scripts/scan-deck.ts
// CLI: npm run deck:scan -- <anbud.pptx> [--json ut.json]
// Scans a GENERATED deck for layout ugliness via the shared measurement core:
// COM-measures every text shape (measure-overflow.ps1), applies the seven
// checks, prints a per-slide report. Exit contract: 0 clean / 1 WARN /
// 2 FAIL / 3 crash-or-usage-error — a gate beside inspect-pptx and
// deck:dupes. Design: notes/2026-07-14-measure-core-design.md.
// NOTE: --profile budget checks are deferred to the app-surface track (a
// generated deck has no placeholders left to map shapes to slots).
import { execFile } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";
import { readPptxSlides } from "../src/lib/pptx-template/introspect/read-pptx";
import { prefixKey, readFontScalesByPrefix } from "../src/lib/pptx-template/calibrate/font-scales";
import type { Finding, MeasurementFile } from "../src/lib/pptx-template/measure/types";
import {
  checkAutofitShrink, checkHorizontalClip, checkOutsideSlide,
  checkSingleLineBreak, checkVerticalOverflow, deadspaceFindings,
} from "../src/lib/pptx-template/measure/verdicts";
import { buildReport, exitCodeFor, renderTextReport } from "../src/lib/pptx-template/measure/report";
import { SEVERITIES } from "../src/lib/pptx-template/measure/types";

const execFileAsync = promisify(execFile);
const PREFIX_LEN = 40;

async function main() {
  const args = process.argv.slice(2);
  // --json's VALUE is itself a non-flag token, so it must be excluded from the
  // positional search below — otherwise `deck:scan -- --json ut.json anbud.pptx`
  // picks up "ut.json" as the pptx path.
  const jsonIdx = args.indexOf("--json");
  const jsonOut = jsonIdx >= 0 ? args[jsonIdx + 1] ?? null : null;
  if (jsonIdx >= 0 && !jsonOut) {
    console.error("--json kräver en filsökväg");
    process.exit(3);
  }
  const pptxPath = args.find((a, i) => !a.startsWith("--") && (jsonIdx < 0 || i !== jsonIdx + 1));
  if (!pptxPath) {
    console.error("Användning: npm run deck:scan -- <anbud.pptx> [--json ut.json]");
    process.exit(3);
  }

  const workDir = await mkdtemp(path.join(os.tmpdir(), "deck-scan-"));
  let code: number;
  try {
    const measureJson = path.join(workDir, "measure.json");
    const recalcPath = path.join(workDir, "recalc.pptx");
    await execFileAsync("pwsh", ["-NoProfile", "-File", path.resolve("scripts", "measure-overflow.ps1"),
      "-Pptx", path.resolve(pptxPath), "-OutJson", measureJson, "-RecalcOut", recalcPath]);

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

    // raw-token (xml): any {token} left in the exported deck is an unfilled slot.
    const slides = await readPptxSlides(await readFile(pptxPath));
    for (const slide of slides) {
      for (const token of slide.tokens) {
        findings.push({ checkId: "raw-token", severity: SEVERITIES["raw-token"], slide: slide.source,
          shape: "(xml)", detail: `ofylld platshållare kvar: ${token}` });
      }
    }

    const report = buildReport(path.basename(pptxPath), measured.slideCount, findings);
    console.log(renderTextReport(report));
    if (jsonOut) {
      await writeFile(jsonOut, JSON.stringify(report, null, 2) + "\n", "utf8");
      console.log(`JSON: ${jsonOut}`);
    }
    code = exitCodeFor(report);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
  process.exit(code);
}

main().catch((err) => { console.error(err); process.exit(3); });
