import { z } from "zod";
import { callClaude } from "@/lib/ai-client";
import type { BidSection } from "@/lib/types";
import type { FieldBudgets, OverflowFlag } from "@/lib/pptx-template/budget-types";
import { formatContext, type BidContext } from "../context";
import { withBudgetRetry, type RetryBudget } from "../with-budget-retry";
import { renderBudgetTable } from "../render-budget-table";

export const ReferenceBundleSchema = z.object({
  references: z
    .array(
      z.object({
        clientName: z.string().min(1),
        contextLine: z.string().min(1),
        organisation: z.string().min(1),
        startDate: z.string().min(1),
        endDate: z.string().min(1),
        scope: z.string().min(1),
        contact: z.object({
          name: z.string().min(1),
          titlePhoneEmail: z.string().min(1),
        }),
        roleAndDelivery: z.string().min(1),
        result: z.string().min(1),
      }),
    )
    .min(1)
    .max(5),
});

const REFERENCE_BUDGET_KEYS: string[] = [];

const SYSTEM_PROMPT = `Du väljer referensuppdrag till ett svenskt konsultanbud.

Plocka 1-5 mest relevanta uppdrag från teamets faktiska referenslistor. Prioritera domänrelevans och nylighet.

KÄLLMATERIAL-TROHET (HÅRD REGEL):
Plocka referenser ENDAST från Uppdrag-listan i Team-sektionen.
Hitta INTE på nya kunder, datum eller kontaktpersoner.
Om CV:n saknar fält (kontakt, exakt datum, scope-detaljer) — skriv "ej angivet" i fältet hellre än att gissa.
Hellre 1 sann referens än 3 där 2 är påhittade.

Datum ska vara i format "MM/ÅÅÅÅ" om det står i CV:n, annars "ej angivet". Håll texterna korta.

Skriv konkret, ingen markdown.

Svara med giltig JSON:
{
  "references": [
    {
      "clientName": "Kundens namn",
      "contextLine": "Kort kontext (1 mening)",
      "organisation": "Vilken del av organisationen",
      "startDate": "01/2024",
      "endDate": "12/2024",
      "scope": "Uppdragets scope — 1-2 meningar",
      "contact": { "name": "Referensperson", "titlePhoneEmail": "Titel · telefon · e-post" },
      "roleAndDelivery": "Vår roll och leverans — 1-2 meningar",
      "result": "Resultat/utfall — 1 mening"
    }
  ]
}

1-5 referenser baserade på faktisk CV-data. Använd "ej angivet" om fält saknas — inga tomma strängar.`;

export async function buildReferenceBundle(
  ctx: BidContext,
  budgets: FieldBudgets,
  retryBudget: RetryBudget,
): Promise<{ sections: BidSection[]; overflowFlags: OverflowFlag[] }> {
  const basePrompt = SYSTEM_PROMPT + renderBudgetTable(budgets, REFERENCE_BUDGET_KEYS);

  const { output: parsed, overflows } = await withBudgetRetry({
    basePrompt,
    callLLM: (p) =>
      callClaude({
        model: "claude-sonnet-4-6",
        maxTokens: 3000,
        system: p,
        userContent: formatContext(ctx),
        schema: ReferenceBundleSchema,
        label: "reference bundle",
        organizationId: ctx.organizationId,
      }),
    budgets,
    retryBudget,
  });

  const sections: BidSection[] = [
    {
      type: "ai",
      key: "reference-v2",
      title: "Referensuppdrag",
      content: {
        format: "reference-v2",
        references: parsed.references,
      },
      generatedAt: new Date().toISOString(),
    },
  ];

  return { sections, overflowFlags: overflows };
}
