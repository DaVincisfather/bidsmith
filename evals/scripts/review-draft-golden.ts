// evals/scripts/review-draft-golden.ts
// Motläsning av ett golden-UTKAST: jagar avvikelser mellan utkastet och källtexten
// åt båda hållen, så att Stefan-gaten (6.6) kan granska en kort avvikelserapport
// istället för att sträckläsa källdokumenten. Judgen ser golden och letar fel —
// omvänd uppgift mot analyzerns extraktion, vilket bryter förankringsrisken.
//   npx tsx evals/scripts/review-draft-golden.ts evals/fixtures/analyzer/<id>.draft.yaml
import fs from "fs/promises";
import path from "path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { callClaude } from "@/lib/ai-client";
import { MODELS } from "@/lib/models";
import { JUDGE_TEMPERATURE } from "../harness/core/judges";

const ReviewSchema = z.object({
  missing_requirements: z.array(z.object({
    source_quote: z.string(),
    suggested_requirement: z.string(),
    priority: z.enum(["must", "should", "info"]),
  })),
  unsupported_in_golden: z.array(z.object({
    golden_item: z.string(),
    problem: z.string(),
  })),
  field_issues: z.array(z.object({
    field: z.string(),
    golden_value: z.string(),
    source_says: z.string(),
  })),
  minor_notes: z.array(z.string()),
});

const SYSTEM = `Du motläser ett golden-facit för en RFP-analys mot källtexten (ett svenskt förfrågningsunderlag). Ditt jobb är att hitta AVVIKELSER, inte att bekräfta.

Leta åt båda hållen:
1. missing_requirements: ska-krav/obligatoriska krav i KÄLLAN som SAKNAS bland golden-kraven. Citera källan ordagrant (kort citat räcker). Ange föreslagen prioritet: must (ska-krav), should (bör-krav), info.
2. unsupported_in_golden: golden-poster (krav, kriterier, red flags) som INTE har stöd i källan eller motsäger den.
3. field_issues: fel i title/client/deadline/diaryNumber/summary jämfört med vad källan faktiskt säger.
4. minor_notes: småfel utan betydelse för facit (extraktionsartefakter, saknade mellanslag, stavning).

Var noggrann med kravlistan — det farligaste felet är ett missat ska-krav. Administrativa standardkrav (registreringsbevis, skattekontroll, ESPD-formalia) är krav OM källan uttrycker dem som obligatoriska för anbudet. Tomma listor är ett giltigt svar om facit håller.`;

async function main() {
  const draftPath = process.argv[2];
  if (!draftPath) {
    console.error("Användning: review-draft-golden.ts <path till .draft.yaml>");
    process.exit(1);
  }
  const draft = parseYaml(await fs.readFile(draftPath, "utf-8"));
  const golden = JSON.stringify(draft.golden, null, 1);

  const review = await callClaude({
    model: MODELS.judge,
    maxTokens: 8000,
    temperature: JUDGE_TEMPERATURE,
    system: SYSTEM,
    userContent: `KÄLLTEXT (förfrågningsunderlag):\n${draft.rfp_text}\n\n---\n\nGOLDEN-UTKAST att motläsa:\n${golden}`,
    schema: ReviewSchema,
    label: `golden-review(${draft.id})`,
  });

  const lines: string[] = [`# Motläsning: ${draft.id}`, ""];
  lines.push(`## Möjligen missade krav (${review.missing_requirements.length})`);
  for (const m of review.missing_requirements) {
    lines.push(`- **[${m.priority}]** ${m.suggested_requirement}`);
    lines.push(`  > ${m.source_quote}`);
  }
  lines.push("", `## Golden-poster utan stöd i källan (${review.unsupported_in_golden.length})`);
  for (const u of review.unsupported_in_golden) {
    lines.push(`- ${u.golden_item} — ${u.problem}`);
  }
  lines.push("", `## Fältfel (${review.field_issues.length})`);
  for (const f of review.field_issues) {
    lines.push(`- **${f.field}**: golden="${f.golden_value}" / källan: ${f.source_says}`);
  }
  lines.push("", `## Småfel utan facit-betydelse (${review.minor_notes.length})`);
  for (const n of review.minor_notes) lines.push(`- ${n}`);

  const outDir = path.resolve("evals/runs/golden-review");
  await fs.mkdir(outDir, { recursive: true });
  const out = path.join(outDir, `${draft.id}.md`);
  await fs.writeFile(out, lines.join("\n"), "utf-8");
  console.log(`Skrev ${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
