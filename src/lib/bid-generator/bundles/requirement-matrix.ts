import { z } from "zod";
import { callClaude } from "@/lib/ai-client";
import { MODELS } from "@/lib/models";
import type { BidSection } from "@/lib/types";
import type { BudgetPlan, OverflowFlag } from "@/lib/pptx-template/budget-types";
import { formatContext, type BidContext } from "../context";
import { withBudgetRetry, type RetryBudget } from "../with-budget-retry";
import { renderBudgetTable } from "../render-budget-table";
import { qualificationRequirements } from "@/lib/requirement-kind";

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
    // No longer capped at the old 6-slot template limit — the matrix paginates
    // across cloned slides (6 rows each). The upper bound is only a runaway
    // guard: a real qualification-requirement set won't exceed this.
    .max(60),
});

const REQUIREMENT_MATRIX_BUDGET_KEYS: string[] = [];

const SYSTEM_PROMPT = `Du skapar en kravmatris för ett svenskt konsultanbud.

För varje ska-/bör-krav i RFP:en:
1. Skriv "hurUppfylls" — en kort text (1-2 meningar) som visar hur teamet uppfyller kravet totalt sett.
2. Skriv "referens" — vilken CV/erfarenhet/referens som styrker uppfyllelsen.
3. Fyll i "coverage" — en per-konsult-bedömning: status JA/NEJ/DELVIS + kort evidence (1 mening).
   ALLA konsulter i teamet ska finnas med i coverage-arrayen för varje rad (minst 1).

Skapa EN rad per kvalifikationskrav i listan nedan (prioritera must- och should-krav).
Matrisen pagineras automatiskt över flera slides — begränsa INTE antalet rader.

Kravmatrisen får ALDRIG innehålla leverabler (det uppdraget ska producera, t.ex.
rapporter/analyser) — de hör till genomförandeplanen, inte hit. Använd ENDAST
kvalifikationskraven som listas nedan.

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
  plan: BudgetPlan,
  retryBudget: RetryBudget,
): Promise<{ sections: BidSection[]; overflowFlags: OverflowFlag[] }> {
  // Explicit kvalifikationskrav-lista (leverabler filtreras bort) så matrisen aldrig
  // bygger rader på leverabler även om de finns i den delade RFP-kontexten.
  const kvalKrav = qualificationRequirements(ctx.analysis.requirements);
  const kravBlock = kvalKrav.length
    ? `\n\n## Kvalifikationskrav att täcka (ENDAST dessa)\n${kvalKrav
        .map((r) => `- [${r.priority}] ${r.description}`)
        .join("\n")}`
    : "";
  const basePrompt =
    SYSTEM_PROMPT + kravBlock + renderBudgetTable(plan.budgets, REQUIREMENT_MATRIX_BUDGET_KEYS);

  // One row per qualification requirement, each carrying a per-consultant
  // coverage array — so output scales with both requirement count and team
  // size. The old fixed 4000 truncated large matrices (a 20-req, 5-person team
  // needs ~7k). Clamped so cost stays bounded; callClaude streams (no ceiling).
  const teamSize = Math.max(1, ctx.teamConsultants.length);
  const maxTokens = Math.min(
    16000,
    Math.max(4000, 1000 + kvalKrav.length * (140 + teamSize * 40)),
  );

  const { output: parsed, overflows } = await withBudgetRetry({
    basePrompt,
    callLLM: (p) =>
      callClaude({
        model: MODELS.writingSupport,
        maxTokens,
        system: p,
        cachedContext: formatContext(ctx),
        userContent: "Generera JSON-payloaden enligt systeminstruktionerna.",
        schema: RequirementMatrixBundleSchema,
        label: "requirement-matrix bundle",
        userId: ctx.userId,
        bidId: ctx.bidId,
      }),
    plan,
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
