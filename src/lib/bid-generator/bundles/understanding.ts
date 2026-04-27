import { z } from "zod";
import { callClaude } from "@/lib/ai-client";
import type { BidSection } from "@/lib/types";
import { formatContext, type BidContext } from "../context";

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

const SYSTEM_PROMPT = `Du skriver förståelsesektionerna till ett svenskt konsultanbud.
Producera en JSON-payload med tre delar som tillsammans bygger upp vår förståelse av uppdraget.

Skriv som en erfaren konsult — inte som en AI. Undvik överdrivna adjektiv, abstrakta floskler,
markdown-formatering och upprepade parallella strukturer. Variera meningslängd. Konkret och direkt.

Svara med giltig JSON:
{
  "current": {
    "organisation": "1-2 meningar om kundens organisation — vilka de är, storlek, mandat",
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
  ctx: BidContext
): Promise<BidSection[]> {
  const parsed = await callClaude({
    model: "claude-opus-4-7",
    maxTokens: 32000,
    system: SYSTEM_PROMPT,
    userContent: formatContext(ctx),
    schema: UnderstandingBundleSchema,
    label: "understanding bundle",
    effort: "max",
    organizationId: ctx.organizationId,
  });

  const now = new Date().toISOString();
  return [
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
}
