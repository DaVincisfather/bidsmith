import { z } from "zod";
import { callClaude } from "@/lib/ai-client";
import type { BidSection } from "@/lib/types";
import { formatContext, type BidContext } from "../context";

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

const SYSTEM_PROMPT = `Du skapar en kravmatris för ett svenskt konsultanbud.

För varje ska-/bör-krav i RFP:en:
1. Skriv "hurUppfylls" — en kort text (1-2 meningar) som visar hur teamet uppfyller kravet totalt sett.
2. Skriv "referens" — vilken CV/erfarenhet/referens som styrker uppfyllelsen.
3. Fyll i "coverage" — en per-konsult-bedömning: status JA/NEJ/DELVIS + kort evidence (1 mening).
   ALLA konsulter i teamet ska finnas med i coverage-arrayen för varje rad (minst 1).

Fokusera på must- och should-krav. 1-6 rader per matris (template slot cap).

Skriv kort och konkret. Inga floskler, ingen markdown.

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
): Promise<BidSection[]> {
  const parsed = await callClaude({
    model: "claude-sonnet-4-6",
    maxTokens: 4000,
    system: SYSTEM_PROMPT,
    userContent: formatContext(ctx),
    schema: RequirementMatrixBundleSchema,
    label: "requirement-matrix bundle",
  });

  return [
    {
      type: "ai",
      key: "requirement-matrix-v2",
      title: "Kravmatris",
      content: { format: "requirement-matrix-v2", rows: parsed.rows },
      generatedAt: new Date().toISOString(),
    },
  ];
}
