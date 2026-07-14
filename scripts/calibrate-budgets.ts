// scripts/calibrate-budgets.ts
// CLI: node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/calibrate-budgets.ts <templateId> [--write] [--max-rounds N]
// Dry-run by default: prints the per-slot budget table; --write persists to template_profiles.
import { calibrateTemplate } from "../src/lib/pptx-template/calibrate/calibrate";

async function main() {
  const args = process.argv.slice(2);
  const templateId = args.find((a) => !a.startsWith("--"));
  if (!templateId) {
    console.error("Användning: npm run calibrate:budgets -- <templateId> [--write] [--max-rounds N]");
    process.exit(1);
  }
  const write = args.includes("--write");
  const mrIdx = args.indexOf("--max-rounds");
  const maxRounds = mrIdx >= 0 ? Number(args[mrIdx + 1]) : undefined;
  // NaN would make the round-loop condition (round < NaN) false → a silent
  // zero-round "calibration" where every slot reports the geometry fallback.
  if (maxRounds !== undefined && !Number.isFinite(maxRounds)) {
    console.error("--max-rounds kräver ett numeriskt värde, t.ex. --max-rounds 6");
    process.exit(1);
  }

  const report = await calibrateTemplate(templateId, { write, maxRounds });

  console.log(`\nKalibrering ${report.templateId} — ${report.rounds} render-varv`);
  console.log("token".padEnd(42) + "budget".padStart(7) + "  varv  metod              kortfält");
  for (const r of report.results) {
    console.log(
      r.token.padEnd(42) + String(r.budget).padStart(7) +
      String(r.rounds).padStart(6) + `  ${r.method.padEnd(18)}` + (r.shortField ? "JA" : ""),
    );
    for (const w of r.warnings) console.log(`    VARNING: ${w}`);
  }
  if (report.unresolved.length > 0) console.log(`\nOmätta (geometri-fallback): ${report.unresolved.join(", ")}`);
  console.log(write ? "\nProfil SPARAD." : "\nDRY-RUN — inget sparat. Kör med --write för att persistera.");
}

main().catch((err) => { console.error(err); process.exit(1); });
