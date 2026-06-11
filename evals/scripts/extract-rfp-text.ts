// evals/scripts/extract-rfp-text.ts
// Konverterar nedladdade upphandlingsdokument till text via produktionens
// dokumentparser. Användning:
//   npx tsx evals/scripts/extract-rfp-text.ts evals/fixtures/source-docs/eskilstuna-lokalforsorjning
// Skriver <mapp>/extracted.txt — klistras sedan in som rfp_text i fixture-yaml.
import fs from "fs/promises";
import path from "path";
import { parseDocument } from "@/lib/document-parser";

async function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error("Ange katalog med underlagsdokument.");
    process.exit(1);
  }
  // notis-*.pdf är TED-notiser (metadata, kontext för människor) — inte en del
  // av förfrågningsunderlaget och inget en användare laddar upp i appen.
  const files = (await fs.readdir(dir)).filter(
    (f) => /\.(pdf|docx|pptx|xlsx)$/i.test(f) && !f.startsWith("notis-"),
  );
  if (files.length === 0) {
    console.error(`Inga dokument i ${dir}`);
    process.exit(1);
  }
  const parts: string[] = [];
  for (const f of files.sort()) {
    const buf = await fs.readFile(path.join(dir, f));
    const text = await parseDocument(buf, f);
    parts.push(`=== ${f} ===\n${text}`);
  }
  const out = path.join(dir, "extracted.txt");
  await fs.writeFile(out, parts.join("\n\n"), "utf-8");
  console.log(`Skrev ${out} (${parts.join("").length} tecken)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
