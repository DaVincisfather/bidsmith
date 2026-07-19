// scripts/onboarding-measure.ts
// CLI: npm run onboarding:measure -- <templateId> [--write] [--max-rounds N]
// The onboarding measurement pass (design notes/2026-07-19-onboarding-measure-design.md):
// (1) empty-substrate defect scan (COM), (2) budget calibration (COM),
// (3) ONE atomic profile save. Dry-run by default. Requires PowerPoint CLOSED.
import { createServiceClient } from "../src/lib/supabase";
import { calibrateTemplate, hasCalibratableSlots, type CalibrationReport } from "../src/lib/pptx-template/calibrate/calibrate";
import { loadTemplateProfile, saveTemplateProfile } from "../src/lib/pptx-template/profile-store";
import { buildEmptyScanDefects } from "../src/lib/pptx-template/measure/empty-scan";
import { composeMeasuredProfile } from "../src/lib/pptx-template/measure/compose-measured-profile";

async function main() {
  const args = process.argv.slice(2);
  // --max-rounds's VALUE is itself a non-flag token, so it must be excluded from
  // the positional search below — otherwise `onboarding:measure -- --max-rounds 8 <id>`
  // picks up "8" as templateId (mirrors scan-deck.ts's --json/--profile exclusion).
  const mrIdx = args.indexOf("--max-rounds");
  const templateId = args.find((a, i) => !a.startsWith("--") && (mrIdx < 0 || i !== mrIdx + 1));
  if (!templateId) {
    console.error("Användning: npm run onboarding:measure -- <templateId> [--write] [--max-rounds N]");
    process.exit(1);
  }
  const write = args.includes("--write");
  const maxRounds = mrIdx >= 0 ? Number(args[mrIdx + 1]) : undefined;
  if (maxRounds !== undefined && !Number.isFinite(maxRounds)) {
    console.error("--max-rounds kräver ett numeriskt värde, t.ex. --max-rounds 6");
    process.exit(1);
  }

  const supabase = createServiceClient();
  // Early load: validates the template has a profile before the multi-minute
  // COM pass below runs at all.
  const profile = await loadTemplateProfile(templateId);
  if (!profile) throw new Error(`mall ${templateId} saknar profil — onboarda den först`);

  console.log("=== Steg 1/2: defektscan på tomma mallen ===");
  const scanned = await buildEmptyScanDefects(supabase, templateId);

  console.log("\n=== Steg 2/2: budgetkalibrering ===");
  let report: CalibrationReport;
  if (!hasCalibratableSlots(profile)) {
    console.log("Inga kalibrerbara prosa-rutor — kalibreringssteget hoppas över (tabell-/statisk mall).");
    report = { templateId, rounds: 0, results: [], unresolved: [] };
  } else {
    report = await calibrateTemplate(templateId, { write: false, maxRounds });
  }

  // Re-load right before compose/save: a wizard defect-accept made DURING the
  // COM pass above must not be silently overwritten by the stale profile
  // captured at the top of main() (mergeDefectAccepts needs the fresh accepts).
  const fresh = await loadTemplateProfile(templateId);
  if (!fresh) throw new Error(`mall ${templateId} saknar profil — onboarda den först`);

  const updated = composeMeasuredProfile(fresh, report, scanned, new Date().toISOString());

  // Rapport (svenska): budgettabell (samma kolumner som calibrate-budgets) + defektlista.
  console.log(`\nKalibrering: ${report.rounds} varv, ${report.results.length} slots, ${report.unresolved.length} omätta.`);
  console.log("token".padEnd(42) + "budget".padStart(7) + "  varv  metod              kortfält");
  for (const r of report.results) {
    console.log(
      r.token.padEnd(42) + String(r.budget).padStart(7) +
      String(r.rounds).padStart(6) + `  ${r.method.padEnd(18)}` + (r.shortField ? "JA" : "") +
      (r.signals.length > 0 ? ` [${r.signals.join(",")}]` : ""),
    );
    for (const w of r.warnings) console.log(`    VARNING: ${w}`);
  }
  if (report.unresolved.length > 0) console.log(`\nOmätta (geometri-fallback): ${report.unresolved.join(", ")}`);
  const unconverged = report.results.filter((r) =>
    r.warnings.includes("did not converge within maxRounds — budget is last proven fit"),
  );
  if (unconverged.length > 0) {
    console.log(`\nVARNING: ${unconverged.length} slots ej konvergerade — kör om med --max-rounds högre innan --write.`);
  }

  const open = (updated.knownDefects ?? []).filter((d) => d.status === "open");
  const accepted = (updated.knownDefects ?? []).filter((d) => d.status === "accepted");
  console.log(`\nDefekter: ${open.length} öppna, ${accepted.length} accepterade (bevarade).`);
  for (const d of updated.knownDefects ?? []) {
    console.log(`  slide ${String(d.slide).padStart(2)}  ${d.checkId.padEnd(16)} ${d.shape.padEnd(12)} [${d.status}]`);
    console.log(`    → ${d.suggestion}`);
  }

  if (write) {
    await saveTemplateProfile(updated);
    console.log("\nProfil SPARAD (budgetar + mätstatus + defekter).");
  } else {
    console.log("\nDRY-RUN — inget sparat. Kör med --write för att persistera.");
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
