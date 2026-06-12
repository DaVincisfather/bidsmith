// scripts/introspect-template.ts
// CLI: npx tsx scripts/introspect-template.ts <mall.pptx> [namn]
// Skriver <mall>.manifest.json bredvid pptx-filen + rapport till stdout.
import { readFile, writeFile } from "fs/promises";
import path from "path";
import { introspectTemplate } from "../src/lib/pptx-template/introspect";

async function main() {
  const [pptxPath, nameArg] = process.argv.slice(2);
  if (!pptxPath) {
    console.error("Användning: npx tsx scripts/introspect-template.ts <mall.pptx> [namn]");
    process.exit(1);
  }
  // Utan .pptx-suffix blir replace() nedan en no-op och JSON skrivs ÖVER inputfilen.
  if (!/\.pptx$/i.test(pptxPath)) {
    console.error("Förväntar en .pptx-fil");
    process.exit(1);
  }
  const name = nameArg ?? path.basename(pptxPath, ".pptx");
  const { manifest, warnings } = await introspectTemplate(await readFile(pptxPath), name);

  const outPath = pptxPath.replace(/\.pptx$/i, ".manifest.json");
  await writeFile(outPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  console.log(`Manifest: ${outPath}`);
  console.log(`Slides: ${manifest.slides.length} renderas, ${manifest.excludedSlides.length} exkluderas`);
  for (const e of manifest.excludedSlides) console.log(`  - slide ${e.source}: ${e.reason}`);
  console.log("Budgetar:");
  for (const [field, b] of Object.entries(manifest.budgets)) console.log(`  ${field}: ${b}`);
  const withImages = manifest.slides.filter((s) => s.imageShapes);
  if (withImages.length > 0) {
    console.log("Bildytor (lämnas orörda av genereringen):");
    for (const s of withImages) {
      console.log(
        `  slide ${s.source}: ${s.imageShapes!.placed} placerade, ${s.imageShapes!.placeholders} tomma placeholders`,
      );
    }
  }
  for (const w of warnings) console.warn(`VARNING: ${w}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
