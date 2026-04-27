import { callClaude } from "./ai-client";
import { OpportunityScoreSchema } from "./ai-schemas";
import type { OpportunityScore } from "./types-radar";

const SYSTEM_PROMPT = `Du är en expert på svensk offentlig upphandling och konsultbranschen.
Du får en upphandlingsbeskrivning och ett konsultbolags kompetensområden.
Bedöm hur relevant upphandlingen är för bolaget.

Svara ALLTID med giltig JSON:
{
  "relevanceScore": 0-100,
  "reasoning": "Kort motivering på svenska (1-2 meningar)"
}

Skala:
- 80-100: Stark match — upphandlingen ligger i bolagets kärnkompetens
- 50-79: Möjlig match — delvis överlapp, värt att titta på
- 20-49: Svag match — tangerar bolagets kompetens men inte kärnverksamhet
- 0-19: Irrelevant — ingen meningsfull koppling

Var realistisk. De flesta upphandlingar är INTE relevanta för ett specifikt konsultbolag.`;

interface ScoringInput {
  title: string;
  summary: string | null;
}

interface CompetencyInput {
  name: string;
  description: string;
  keywords: string[];
}

export function buildScoringPrompt(
  opportunity: ScoringInput,
  competencies: CompetencyInput[]
): string {
  const competencyText = competencies
    .map((c) => `### ${c.name}\n${c.description}\nNyckelord: ${c.keywords.join(", ")}`)
    .join("\n\n");

  return `## Upphandling
Titel: ${opportunity.title}
${opportunity.summary ? `Beskrivning: ${opportunity.summary}` : "Ingen beskrivning tillgänglig."}

## Konsultbolagets kompetensområden
${competencyText}`;
}

export async function scoreOpportunity(
  opportunity: ScoringInput,
  competencies: CompetencyInput[],
  organizationId?: string | null
): Promise<OpportunityScore> {
  const userContent = buildScoringPrompt(opportunity, competencies);

  return callClaude({
    model: "claude-haiku-4-5-20251001",
    maxTokens: 300,
    system: SYSTEM_PROMPT,
    userContent,
    schema: OpportunityScoreSchema,
    label: "opportunity scoring",
    organizationId,
  });
}
