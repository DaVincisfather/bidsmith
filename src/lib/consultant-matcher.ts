import {
  RfpAnalysis,
  Consultant,
  ScoredMatchResult,
} from "./types";
import { ScoredMatchResultSchema } from "./ai-schemas";
import { callClaude } from "./ai-client";

const SYSTEM_PROMPT = `Du är expert på att matcha konsulter till förfrågningsunderlag (RFP:er).
Du får en RFP-analys och en lista konsulter. Scora VARJE konsult individuellt mot RFP:en.
Bedöm hur väl varje konsults kompetenser, erfarenhet och referensuppdrag matchar kraven.

Rankning sker enbart inom samma erfarenhetsnivå — juniors tävlar aldrig mot seniors.

Svara ALLTID med giltig JSON som matchar detta schema:
{
  "scoredConsultants": [
    {
      "consultantId": "uuid",
      "consultantName": "Namn",
      "level": "senior",
      "score": 85,
      "reasoning": "2-3 meningar om varför denna konsult matchar (eller inte matchar) uppdraget"
    }
  ]
}

Regler:
- Scora ALLA konsulter, inte bara de bästa
- Score 0-100: 80+ stark matchning, 60-79 relevant, 40-59 delvis relevant, <40 svag matchning
- reasoning: specifik koppling till RFP-kraven, inte generell text
- Sortera per nivå, högst score först inom varje nivå`;

function formatConsultantsForPrompt(consultants: Consultant[]): string {
  const grouped: Record<string, Consultant[]> = {};
  for (const c of consultants) {
    if (!grouped[c.level]) grouped[c.level] = [];
    grouped[c.level].push(c);
  }

  return Object.entries(grouped)
    .map(([level, cons]) => {
      const entries = cons.map((c) => {
        const comps = c.competencies.map((co) => co.competency).join(", ");
        const refs = c.references
          .map((r) => `${r.title} (${r.year}, ${r.sector})`)
          .join("; ");
        return `  - ${c.name} [id: ${c.id}]: ${c.summary}\n    Kompetenser: ${comps}\n    Uppdrag: ${refs}`;
      });
      return `${level.toUpperCase()}:\n${entries.join("\n")}`;
    })
    .join("\n\n");
}

export async function matchConsultants(
  analysis: RfpAnalysis,
  consultants: Consultant[],
  organizationId?: string | null
): Promise<ScoredMatchResult> {
  const consultantText = formatConsultantsForPrompt(consultants);

  return callClaude({
    model: "claude-sonnet-4-6",
    maxTokens: 8000,
    system: SYSTEM_PROMPT,
    userContent: `Scora följande konsulter individuellt mot detta förfrågningsunderlag.

## RFP-analys
${JSON.stringify(analysis, null, 2)}

## Konsulter att scora
${consultantText}`,
    schema: ScoredMatchResultSchema,
    label: "consultant matching",
    organizationId,
  });
}
