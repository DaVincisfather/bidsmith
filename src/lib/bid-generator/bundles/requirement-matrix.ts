import { z } from "zod";
import { callClaude } from "@/lib/ai-client";
import { MODELS } from "@/lib/models";
import type { BidSection } from "@/lib/types";
import type { FieldBudgets, OverflowFlag } from "@/lib/pptx-template/budget-types";
import { formatContext, type BidContext } from "../context";
import { withBudgetRetry, type RetryBudget } from "../with-budget-retry";
import { renderBudgetTable } from "../render-budget-table";

export const RequirementMatrixBundleSchema = z.object({
  rows: z
    .array(
      z.object({
        requirement: z.string().min(1),
        hurUppfylls: z.string().min(1),
        referens: z.string().min(1),
        coverage: z
          .array(
            z.object({
              consultantName: z.string().min(1),
              status: z.enum(["JA", "NEJ", "DELVIS"]),
              evidence: z.string().min(1),
            }),
          )
          .min(1),
        met: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(6),
});

const REQUIREMENT_MATRIX_BUDGET_KEYS: string[] = [];

const SYSTEM_PROMPT = `Du skapar en kravmatris för ett svenskt konsultanbud.

För varje ska-/bör-krav i RFP:en:
1. Skriv "hurUppfylls" — en kort text (1-2 meningar) som visar hur teamet uppfyller kravet totalt sett.
2. Skriv "referens" — vilken CV/erfarenhet/referens som styrker uppfyllelsen.
3. Fyll i "coverage" — en per-konsult-bedömning: status JA/NEJ/DELVIS + kort evidence (1 mening).
   ALLA konsulter i teamet ska finnas med i coverage-arrayen för varje rad (minst 1).

Fokusera på must- och should-krav. 1-6 rader per matris (template slot cap).

Skriv kort och konkret. Inga floskler, ingen markdown.

KÄLLMATERIAL-TROHET (HÅRD REGEL):
evidence-fältet ska citera eller parafrasera faktisk CV-text.
Hitta INTE på årtal, klientnamn, branschdetaljer eller siffror som inte finns i CV:n.
Om CV:n säger "jobbat på startup inom e-handel" — skriv inte "(2024)" eller annat årtal.
Om en konsult saknar relevant erfarenhet för ett krav — skriv "NEJ" + kort förklaring,
hellre än att tillskriva fabricerade meriter.

Svara med giltig JSON:
{
  "rows": [
    {
      "requirement": "RFP-kravet i en mening",
      "hurUppfylls": "Team-nivå: så uppfyller vi",
      "referens": "Konkret referens/CV",
      "coverage": [
        { "consultantName": "Anna", "status": "JA", "evidence": "Konkret evidens från CV" }
      ]
    }
  ]
}`;

export async function buildRequirementMatrixBundle(
  ctx: BidContext,
  budgets: FieldBudgets,
  retryBudget: RetryBudget,
): Promise<{ sections: BidSection[]; overflowFlags: OverflowFlag[] }> {
  const basePrompt = SYSTEM_PROMPT + renderBudgetTable(budgets, REQUIREMENT_MATRIX_BUDGET_KEYS);

  const { output: parsed, overflows } = await withBudgetRetry({
    basePrompt,
    callLLM: (p) =>
      callClaude({
        model: MODELS.writingSupport,
        maxTokens: 4000,
        system: p,
        userContent: formatContext(ctx),
        schema: RequirementMatrixBundleSchema,
        label: "requirement-matrix bundle",
        userId: ctx.userId,
        bidId: ctx.bidId,
      }),
    budgets,
    retryBudget,
  });

  const sections: BidSection[] = [
    {
      type: "ai",
      key: "requirement-matrix-v2",
      title: "Kravmatris",
      content: { format: "requirement-matrix-v2", rows: parsed.rows },
      generatedAt: new Date().toISOString(),
    },
  ];

  return { sections, overflowFlags: overflows };
}
