// scripts/backfill-single-line.ts
// CLI: node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/backfill-single-line.ts <templateId> [--write]
// Patches ONLY the singleLine flag on an already-calibrated profile, derived
// from pure geometry (planTargets — no PowerPoint COM, no budget changes).
// Dry-run by default: prints which slots gain/lose the flag; --write persists.
import { readFile } from "fs/promises";
import { loadTemplate } from "../src/lib/pptx-template/template-store";
import { loadTemplateProfile, saveTemplateProfile } from "../src/lib/pptx-template/profile-store";
import { readPptxSlides } from "../src/lib/pptx-template/introspect/read-pptx";
import { planTargets } from "../src/lib/pptx-template/calibrate/plan-targets";
import { applySingleLineFlags } from "../src/lib/pptx-template/calibrate/calibrate";

async function main() {
  const args = process.argv.slice(2);
  const templateId = args.find((a) => !a.startsWith("--"));
  if (!templateId) {
    console.error("Användning: npx tsx scripts/backfill-single-line.ts <templateId> [--write]");
    process.exit(1);
  }
  const write = args.includes("--write");

  const tpl = await loadTemplate(templateId);
  const profile = await loadTemplateProfile(templateId);
  if (!profile) throw new Error(`template ${templateId} has no stored profile — onboard it first`);

  const slides = await readPptxSlides(await readFile(tpl.templateFile));
  const targets = planTargets(slides, profile);
  if (targets.length === 0) throw new Error("no generic-prose slots in profile");

  const patched = applySingleLineFlags(profile, targets);

  let gained = 0, lost = 0, budgetDrift = 0;
  for (let i = 0; i < profile.slides.length; i++) {
    for (let j = 0; j < profile.slides[i].slots.length; j++) {
      const before = profile.slides[i].slots[j];
      const after = patched.slides[i].slots[j];
      if (before.budgetChars !== after.budgetChars) budgetDrift++;
      if (!before.singleLine && after.singleLine) {
        gained++;
        console.log(`+ singleLine  slide ${profile.slides[i].source}  ${after.placeholder}  (budget ${after.budgetChars ?? "-"})`);
      } else if (before.singleLine && !after.singleLine) {
        lost++;
        console.log(`- singleLine  slide ${profile.slides[i].source}  ${after.placeholder}`);
      }
    }
  }
  console.log(`\n${gained} slots flaggade, ${lost} avflaggade, budgetändringar: ${budgetDrift} (ska vara 0)`);
  if (budgetDrift > 0) throw new Error("backfill ändrade budgetar — får inte hända");

  if (write) {
    await saveTemplateProfile(patched);
    console.log("Profil SPARAD.");
  } else {
    console.log("DRY-RUN — inget sparat. Kör med --write för att persistera.");
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
