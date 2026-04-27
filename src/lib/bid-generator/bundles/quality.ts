import { z } from "zod";
import { callClaude } from "@/lib/ai-client";
import type { BidSection } from "@/lib/types";
import { formatContext, type BidContext } from "../context";

export const QualityBundleSchema = z.object({
  qaProcess: z.array(z.string()).min(1).max(2),
  qualityLead: z.object({
    name: z.string().min(1),
    roleAndMandate: z.string().min(1),
    contact: z.string().min(1),
  }),
  escalation: z.object({
    process: z.string().min(1),
    reporting: z.string().min(1),
  }),
  checkpoints: z.array(z.string()).min(1).max(4),
});

const SYSTEM_PROMPT = `Du skriver kvalitetssäkringssektionen till ett svenskt konsultanbud.

PRINCIP: Anbudet ska visa vår ansats översiktligt, inte detaljera processen.
Behåll flexibilitet i hur uppdraget faktiskt utförs — detaljer förhandlas senare.
Skriv knapphändigt och konkret. Lås inte fast oss i specifika rutiner.

Slot caps (HÅRDA):
- qaProcess: 1-2 stycken, vardera MAX 2 meningar. Ansats, inte steg-för-steg.
- escalation.process och escalation.reporting: VARDERA max 1-2 meningar.
- checkpoints: 1-4, vardera max 1 mening.
- qualityLead: behåll fullständig — namn, roll/mandat, kontakt.

Välj en lämplig person från teamet som qualityLead.
Undvik markdown och floskler.

Svara med giltig JSON:
{
  "qaProcess": ["Kort stycke om ansats — max 2 meningar"],
  "qualityLead": {
    "name": "Exakt namn från teamet",
    "roleAndMandate": "Roll och mandat",
    "contact": "e-post/telefon"
  },
  "escalation": {
    "process": "Max 1-2 meningar",
    "reporting": "Max 1-2 meningar"
  },
  "checkpoints": ["Avstämning 1", "Avstämning 2"]
}`;

export async function buildQualityBundle(ctx: BidContext): Promise<BidSection[]> {
  const parsed = await callClaude({
    model: "claude-opus-4-7",
    maxTokens: 16000,
    system: SYSTEM_PROMPT,
    userContent: formatContext(ctx),
    schema: QualityBundleSchema,
    label: "quality bundle",
    effort: "max",
    organizationId: ctx.organizationId,
  });

  return [{
    type: "ai",
    key: "quality-assurance",
    title: "Kvalitetssäkring",
    content: {
      format: "quality-assurance",
      qaProcess: parsed.qaProcess,
      qualityLead: parsed.qualityLead,
      escalation: parsed.escalation,
      checkpoints: parsed.checkpoints,
    },
    generatedAt: new Date().toISOString(),
  }];
}
