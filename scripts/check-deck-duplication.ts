// CLI: npx tsx scripts/check-deck-duplication.ts <deck.pptx>
// Pairwise same-slide similarity over an EXPORTED deck's text shapes.
// Exit 0 = clean, 1 = pairs ≥ 0.7 (fail), prints WARN for pairs ≥ 0.5.
import { readFile } from "fs/promises";
import { readPptxSlides } from "../src/lib/pptx-template/introspect/read-pptx";
import { duplicatePairs } from "../src/lib/text-similarity";

const MIN_TEXT_CHARS = 120; // short labels/headers pair-match trivially — skip
const WARN_AT = 0.5;
const FAIL_AT = 0.7;

async function main() {
  const [pptxPath] = process.argv.slice(2);
  if (!pptxPath) {
    console.error("Användning: npx tsx scripts/check-deck-duplication.ts <deck.pptx>");
    process.exit(1);
  }
  const slides = await readPptxSlides(await readFile(pptxPath));
  let failed = false;
  for (const slide of slides) {
    const items = slide.shapes
      .map((s, i) => ({ label: `slide ${slide.source} shape ${i}`, text: s.paragraphs.join("\n") }))
      .filter((s) => s.text.length >= MIN_TEXT_CHARS);
    for (const p of duplicatePairs(items, WARN_AT)) {
      const level = p.similarity >= FAIL_AT ? "FAIL" : "WARN";
      if (p.similarity >= FAIL_AT) failed = true;
      console.log(`${level} ${p.a} ~ ${p.b}: ${p.similarity.toFixed(2)}`);
    }
  }
  console.log(failed ? "\nDUBBLETTER ÖVER FAIL-TRÖSKELN." : "\nInga dubbletter över fail-tröskeln.");
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
