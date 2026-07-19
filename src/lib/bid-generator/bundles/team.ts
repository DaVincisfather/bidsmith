import { z } from "zod";
import { callClaude } from "@/lib/ai-client";
import { MODELS } from "@/lib/models";
import { MAX_TEAM_SIZE } from "@/lib/constants";
import type { BidSection } from "@/lib/types";
import type { BudgetPlan, OverflowFlag } from "@/lib/pptx-template/budget-types";
import { formatContext, type BidContext } from "../context";
import { withBudgetRetry, type RetryBudget } from "../with-budget-retry";
import { renderBudgetTable } from "../render-budget-table";

export const TeamBundleSchema = z.object({
  members: z
    .array(
      z.object({
        name: z.string().min(1),
        role: z.string().min(1),
        omfattningPct: z.number().int().min(1).max(100),
        timmar: z.number().int().min(1),
      }),
    )
    .min(1)
    .max(MAX_TEAM_SIZE),
});

const TEAM_BUDGET_KEYS: string[] = [];

const SYSTEM_PROMPT = `Du skapar team-pricing-raderna till ett svenskt konsultanbud.

För varje konsult i teamet:
- name: exakt namn från teamlistan
- role: vilken roll konsulten tar i detta uppdrag (t.ex. "Projektledare", "Lösningsarkitekt")
- omfattningPct: procentuell omfattning (1-100), heltal
- timmar: uppskattat totalt antal timmar över projektets löptid, positivt heltal

Max 5 konsulter (template slot cap). Ideal 3-5 för full impact.

Svara med giltig JSON:
{
  "members": [
    { "name": "Anna", "role": "Projektledare", "omfattningPct": 50, "timmar": 240 }
  ]
}

OBS: timpris sätts av bolaget efter generering — inkludera INTE timpris eller total i ditt svar.`;

export async function buildTeamBundle(
  ctx: BidContext,
  plan: BudgetPlan,
  retryBudget: RetryBudget,
): Promise<{ sections: BidSection[]; overflowFlags: OverflowFlag[] }> {
  const basePrompt = SYSTEM_PROMPT + renderBudgetTable(plan.budgets, TEAM_BUDGET_KEYS);

  const { output: parsed, overflows } = await withBudgetRetry({
    basePrompt,
    callLLM: (p) =>
      callClaude({
        model: MODELS.writingSupport,
        maxTokens: 2000,
        system: p,
        cachedContext: formatContext(ctx),
        userContent: "Generera JSON-payloaden enligt systeminstruktionerna.",
        schema: TeamBundleSchema,
        label: "team bundle",
        userId: ctx.userId,
        bidId: ctx.bidId,
      }),
    plan,
    retryBudget,
  });

  const members = parsed.members.map((m) => ({
    name: m.name,
    role: m.role,
    omfattningPct: m.omfattningPct,
    timpris: null,
    timmar: m.timmar,
    total: null,
  }));
  const totalTimmar = members.reduce((acc, m) => acc + m.timmar, 0);

  const sections: BidSection[] = [
    {
      type: "ai",
      key: "team-pricing",
      title: "Team och pris",
      content: {
        format: "team-pricing",
        members,
        summary: { totalTimmar, totalPris: null },
      },
      generatedAt: new Date().toISOString(),
    },
  ];

  return { sections, overflowFlags: overflows };
}
