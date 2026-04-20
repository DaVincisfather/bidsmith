import { z } from "zod";
import { callClaude } from "@/lib/ai-client";
import type { BidSection } from "@/lib/types";
import { formatContext, type BidContext } from "../context";

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
    .max(5),
});

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

export async function buildTeamBundle(ctx: BidContext): Promise<BidSection[]> {
  const parsed = await callClaude({
    model: "claude-sonnet-4-6",
    maxTokens: 2000,
    system: SYSTEM_PROMPT,
    userContent: formatContext(ctx),
    schema: TeamBundleSchema,
    label: "team bundle",
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

  return [
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
}
