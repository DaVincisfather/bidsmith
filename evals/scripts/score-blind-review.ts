// evals/scripts/score-blind-review.ts
// Rättar den ifyllda blind-review.md mot blind-facit.json och skriver utfallet
// i modelltermer. Körs EFTER att granskaren fyllt i Vinnare-kolumnen.
import fs from "fs/promises";
import path from "path";
import { parseBlindReviewMarks, scoreBlindReview } from "../harness/core/compare-report";

async function main() {
  const md = await fs.readFile(path.resolve("evals/runs/compare/blind-review.md"), "utf-8");
  const facit = JSON.parse(
    await fs.readFile(path.resolve("evals/runs/compare/blind-facit.json"), "utf-8"),
  );
  const marks = parseBlindReviewMarks(md);
  const score = scoreBlindReview(marks, facit);
  console.log(JSON.stringify({ marks: marks.length, ...score }, null, 1));
}

main().catch((e) => { console.error(e); process.exit(1); });
