import { z } from "zod";
import { callClaude } from "@/lib/ai-client";
import { MODELS } from "@/lib/models";
import type { BidSection } from "@/lib/types";
import type { BudgetPlan, OverflowFlag } from "@/lib/pptx-template/budget-types";
import { formatContext, type BidContext } from "../context";
import { withBudgetRetry, type RetryBudget } from "../with-budget-retry";
import { renderBudgetTable } from "../render-budget-table";

export const UnderstandingBundleSchema = z.object({
  current: z.object({
    organisation: z.string(),
    system: z.string(),
    processer: z.string(),
    smärtpunkter: z.array(z.string()).min(1).max(4),
  }),
  assignment: z.object({
    stycken: z.array(z.string()).length(3),
  }),
  vision: z.object({
    utmaningar: z.array(z.string()).min(1).max(4),
    värden: z.array(z.string()).min(1).max(4),
  }),
});

const UNDERSTANDING_BUDGET_KEYS: string[] = [];

const SYSTEM_PROMPT = `Du skriver förståelsesektionerna till ett svenskt konsultanbud.
Producera en JSON-payload med tre delar som tillsammans bygger upp vår förståelse av uppdraget.

Skriv som en erfaren konsult — inte som en AI. Undvik överdrivna adjektiv, abstrakta floskler,
markdown-formatering och upprepade parallella strukturer. Variera meningslängd. Konkret och direkt.

KÄLLMATERIAL-TROHET (HÅRD REGEL):
Skriv ENDAST baserat på vad som faktiskt står i RFP:n och teamkontexten.
Hitta INTE på:
- Organisationsstorlek (antal medarbetare/omsättning/invånare) om RFP:n inte säger det
- Klientens tidigare uppdrag, system eller historik utöver RFP:n
- Procentuella mål eller siffror som inte finns i källmaterialet
- Sektor- eller verksamhetsdetaljer utöver vad RFP:n explicit anger

Om RFP:n är tunn på kontext — skriv kortare istället för att fylla ut.
Hellre 1 mening korrekt fakta än 2 meningar varav 1 påhittad.

Svara med giltig JSON:
{
  "current": {
    "organisation": "1-2 meningar — VAD RFP:n explicit säger om kunden (namn, typ av organisation). Ange INTE storlek/medarbetarantal om det inte står.",
    "system": "1-2 meningar om de system/verktyg/tekniska landskap som berörs",
    "processer": "1-2 meningar om hur de jobbar idag",
    "smärtpunkter": ["max 4 korta konkreta smärtpunkter som RFP:en pekar på"]
  },
  "assignment": {
    "stycken": ["exakt 3 stycken, vardera 2-4 meningar, som beskriver uppdraget från vårt perspektiv — inte en upprepning av RFP:en"]
  },
  "vision": {
    "utmaningar": ["max 4 utmaningar uppdraget behöver lösa"],
    "värden": ["max 4 värden vi levererar om vi vinner — kopplade till kundens mål, inte våra kompetenser"]
  }
}

smärtpunkter, utmaningar och värden: max 4 poster per lista, minst 1.
assignment.stycken: exakt 3 stycken.
Leverera så många poster som bäst representerar RFP:en inom de gränserna.`;

export async function buildUnderstandingBundle(
  ctx: BidContext,
  plan: BudgetPlan,
  retryBudget: RetryBudget,
): Promise<{ sections: BidSection[]; overflowFlags: OverflowFlag[] }> {
  const basePrompt = SYSTEM_PROMPT + renderBudgetTable(plan.budgets, UNDERSTANDING_BUDGET_KEYS);

  const { output: parsed, overflows } = await withBudgetRetry({
    basePrompt,
    callLLM: (p) =>
      callClaude({
        model: MODELS.writing,
        maxTokens: 32000,
        system: p,
        cachedContext: formatContext(ctx),
        userContent: "Generera JSON-payloaden enligt systeminstruktionerna.",
        schema: UnderstandingBundleSchema,
        label: "understanding bundle",
        effort: "max",
        userId: ctx.userId,
        bidId: ctx.bidId,
      }),
    plan,
    retryBudget,
  });

  const now = new Date().toISOString();
  const sections: BidSection[] = [
    {
      type: "ai",
      key: "understanding-current",
      title: "Kunden idag",
      content: {
        format: "understanding-current",
        organisation: parsed.current.organisation,
        system: parsed.current.system,
        processer: parsed.current.processer,
        smärtpunkter: parsed.current.smärtpunkter,
      },
      generatedAt: now,
    },
    {
      type: "ai",
      key: "understanding-assignment",
      title: "Uppdragsbeskrivning",
      content: { format: "understanding-assignment", stycken: parsed.assignment.stycken },
      generatedAt: now,
    },
    {
      type: "ai",
      key: "understanding-vision",
      title: "Vad vi ser",
      content: {
        format: "understanding-vision",
        utmaningar: parsed.vision.utmaningar,
        värden: parsed.vision.värden,
      },
      generatedAt: now,
    },
  ];

  return { sections, overflowFlags: overflows };
}
