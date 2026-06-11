// evals/scripts/draft-analyzer-golden.ts
// Kör produktions-analyzern på extracted.txt och skriver ett fixture-UTKAST.
// Utkastet är INTE golden förrän det granskats mot källdokumentet (Stefan-gate) —
// annars förankras facit i modellens egen output och evalen mäter ingenting.
//   npx tsx evals/scripts/draft-analyzer-golden.ts evals/fixtures/source-docs/eskilstuna-lokalforsorjning eskilstuna-lokalforsorjning
import fs from "fs/promises";
import path from "path";
import { stringify as stringifyYaml } from "yaml";
import { analyzeRfp } from "@/lib/rfp-analyzer";

async function main() {
  const [dir, fixtureId] = [process.argv[2], process.argv[3]];
  if (!dir || !fixtureId) {
    console.error("Användning: draft-analyzer-golden.ts <source-doc-katalog> <fixture-id>");
    process.exit(1);
  }
  const rfpText = await fs.readFile(path.join(dir, "extracted.txt"), "utf-8");
  const analysis = await analyzeRfp(rfpText);
  const draft = {
    id: fixtureId,
    source_url: "FYLL I TED-URL",
    notes: "UTKAST — golden ej granskad ännu. Granska varje fält mot källdokumentet.",
    rfp_text: rfpText,
    golden: analysis,
  };
  const out = path.resolve("evals/fixtures/analyzer", `${fixtureId}.draft.yaml`);
  await fs.writeFile(out, stringifyYaml(draft, { lineWidth: 100 }), "utf-8");
  console.log(`Skrev ${out} — GRANSKA innan .draft tas bort ur filnamnet.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
