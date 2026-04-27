import { z } from "zod";
import { callClaude } from "@/lib/ai-client";
import type { BidSection } from "@/lib/types";
import { formatContext, type BidContext } from "../context";

export const PhasesV2Schema = z.object({
  phases: z
    .array(
      z.object({
        name: z.string(),
        objective: z.string(),
        activities: z.array(z.string()).min(1).max(4),
        deliverables: z.array(z.string()).min(1).max(3),
        duration: z.string(),
        risks: z.array(z.string()).optional(),
        hoursEstimate: z.number().optional(),
        period: z.string().optional(),
        decisions: z.array(z.string()).min(1).max(3),
        shortDescription: z.string(),
      }),
    )
    .min(3)
    .max(4),
});

const SYSTEM_PROMPT = `Du skriver genomförandesektionen i ett svenskt konsultanbud.
Bryt ner uppdraget i 3-4 faser — mallen visar upp till 4 faser.

Gränser per fas: activities 1-4, deliverables 1-3, decisions 1-3.
Totalt 3-4 faser i leveransen.

VIKTIGT om realism:
- Lova bara det RFP:en efterfrågar.
- Period: månadsintervall i formatet "M1-M2", "M2-M5" etc.
- Duration: vecko-string, t.ex. "4 v", "6 v".
- decisions: 1-3 beslut styrgruppen tar vid faslut. Sista fasen har typiskt "Go/no-go till nästa fas".
- shortDescription: 3-6 ord, används på fasöversikts-sliden som undertitel.
- Var konsistent — referera inte till aktiviteter som inte finns i andra faser.
- Skriv konkret och direkt. Undvik floskler och markdown.

Svara med giltig JSON:
{
  "phases": [
    {
      "name": "Fas 1: Förstudie",
      "objective": "En-meningsbeskrivning av fasens mål",
      "activities": ["Kort aktivitet 1", "Kort aktivitet 2"],
      "deliverables": ["Konkret leverabel"],
      "duration": "4 v",
      "period": "M1-M2",
      "decisions": ["Vad styrgruppen beslutar vid faslut"],
      "shortDescription": "Kort undertitel",
      "risks": ["Risk 1"],
      "hoursEstimate": 80
    }
  ]
}`;

export async function buildPhasesBundle(ctx: BidContext): Promise<BidSection[]> {
  const parsed = await callClaude({
    model: "claude-opus-4-7",
    maxTokens: 32000,
    system: SYSTEM_PROMPT,
    userContent: formatContext(ctx),
    schema: PhasesV2Schema,
    label: "phases bundle",
    effort: "max",
    organizationId: ctx.organizationId,
  });

  return [
    {
      type: "ai",
      key: "phases",
      title: "Genomförande",
      content: { format: "phases", phases: parsed.phases },
      generatedAt: new Date().toISOString(),
    },
  ];
}
