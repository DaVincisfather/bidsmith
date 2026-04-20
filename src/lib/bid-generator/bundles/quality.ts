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

Slot caps: qaProcess 1-2 stycken (längre text), checkpoints 1-4 (korta).
Välj en lämplig person från teamet som qualityLead.

Skriv konkret och direkt. Undvik markdown och floskler.

Svara med giltig JSON:
{
  "qaProcess": ["Stycke 1 om kvalitetsprocessen", "Stycke 2"],
  "qualityLead": {
    "name": "Exakt namn från teamet",
    "roleAndMandate": "Roll och mandat",
    "contact": "e-post/telefon"
  },
  "escalation": {
    "process": "Hur vi eskalerar problem",
    "reporting": "Hur vi rapporterar"
  },
  "checkpoints": ["Avstämning 1", "Avstämning 2"]
}`;

export async function buildQualityBundle(ctx: BidContext): Promise<BidSection[]> {
  const parsed = await callClaude({
    model: "claude-opus-4-6",
    maxTokens: 2000,
    system: SYSTEM_PROMPT,
    userContent: formatContext(ctx),
    schema: QualityBundleSchema,
    label: "quality bundle",
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
