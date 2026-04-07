import Anthropic from "@anthropic-ai/sdk";
import {
  RfpAnalysis,
  Consultant,
  ScoredConsultant,
  GoNoGoResult,
} from "./types";

const client = new Anthropic();

const SYSTEM_PROMPT = `Du är expert på att bedöma konsultfirmors chanser att vinna upphandlingar.
Du får en RFP-analys, ett låst team med individuella matchscores, och övriga tillgängliga konsulter i poolen.

Din uppgift:
1. Kontrollera varje SKA-KRAV (priority: "must") mot teamets kompetenser och referensuppdrag. Binärt: uppfyllt eller ej.
2. Om NÅGOT ska-krav INTE uppfylls → winProbability = 0. Inga undantag.
3. Bedöm bör-krav (should) och önskemål (nice-to-have) för sannolikhetsbedömningen.
4. Vikta utvärderingskriterierna som anges i RFP:en.
5. Beakta red flags.
6. Generera förbättringsförslag genom att jämföra teamets luckor mot tillgängliga konsulter i poolen. Föreslå konkreta byten med uppskattad påverkan.
7. Ge en rekommendation: go, no-go, eller go-with-reservations.

Svara ALLTID med giltig JSON som matchar detta schema:
{
  "mustRequirements": [
    {
      "requirement": "Beskrivning av ska-kravet",
      "met": true,
      "coveredBy": "Konsultens namn, eller null om ej uppfyllt"
    }
  ],
  "winProbability": 72,
  "winProbabilityReasoning": "Kort motivering av sannolikhetsbedömningen",
  "strengths": ["Styrka 1", "Styrka 2"],
  "gaps": ["Lucka 1", "Lucka 2"],
  "improvements": [
    {
      "swap": { "remove": "Konsult A", "add": "Konsult B" },
      "swapIds": { "removeId": "uuid-a", "addId": "uuid-b" },
      "estimatedImpact": "+15%",
      "reason": "Konsult B har erfarenhet av X som täcker ska-krav Y"
    }
  ],
  "recommendation": "go",
  "reasoning": "Sammanfattande motivering av rekommendationen"
}

Regler:
- winProbability: 0-100. ALLTID 0 om något ska-krav saknas.
- improvements: sortera efter estimatedImpact (högst först). Du får BARA referera till konsulter som finns i listan "Övriga tillgängliga konsulter" nedan. Använd EXAKT namn och ID från den listan. Hitta INTE PÅ konsulter. Om inga tillgängliga konsulter förbättrar teamet, returnera en tom improvements-lista.
- coveredBy: använd EXAKT namn från teamlistan.
- strengths/gaps: koppla till specifika krav i RFP:en, inte generella påståenden.
- reasoning: 2-4 meningar, professionell ton.`;

function formatTeamForPrompt(
  team: Consultant[],
  scores: ScoredConsultant[]
): string {
  return team
    .map((c) => {
      const score = scores.find((s) => s.consultantId === c.id);
      const comps = c.competencies.map((co) => co.competency).join(", ");
      const refs = c.references
        .map((r) => `${r.title} (${r.year}, ${r.sector})`)
        .join("; ");
      return `- ${c.name} [id: ${c.id}] (${c.level}, score: ${score?.score ?? "N/A"})
  Kompetenser: ${comps}
  Uppdrag: ${refs}
  AI-bedömning: ${score?.reasoning ?? "N/A"}`;
    })
    .join("\n\n");
}

function formatPoolForPrompt(
  pool: ScoredConsultant[],
  teamIds: string[]
): string {
  const available = pool.filter((c) => !teamIds.includes(c.consultantId));
  if (available.length === 0) return "Inga ytterligare konsulter tillgängliga.";

  return available
    .sort((a, b) => b.score - a.score)
    .map(
      (c) =>
        `- ${c.consultantName} [id: ${c.consultantId}] (${c.level}, score: ${c.score}): ${c.reasoning}`
    )
    .join("\n");
}

export async function evaluateGoNoGo(
  analysis: RfpAnalysis,
  teamConsultants: Consultant[],
  allScoredConsultants: ScoredConsultant[]
): Promise<GoNoGoResult> {
  const teamIds = teamConsultants.map((c) => c.id);
  const teamText = formatTeamForPrompt(teamConsultants, allScoredConsultants);
  const poolText = formatPoolForPrompt(allScoredConsultants, teamIds);

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `Bedöm detta teams chanser att vinna följande upphandling.

## RFP-analys
${JSON.stringify(analysis, null, 2)}

## Låst team
${teamText}

## Övriga tillgängliga konsulter (för förbättringsförslag)
${poolText}`,
      },
    ],
    system: SYSTEM_PROMPT,
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON found in Claude response");
  }

  return JSON.parse(jsonMatch[0]) as GoNoGoResult;
}
