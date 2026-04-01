import Anthropic from "@anthropic-ai/sdk";
import {
  RfpAnalysis,
  Consultant,
  MatchResult,
  TeamProposal,
  SwapComparison,
} from "./types";

const client = new Anthropic();

const MATCH_SYSTEM_PROMPT = `Du är expert på att matcha konsulter till förfrågningsunderlag (RFP:er).
Du får en RFP-analys och en lista konsulter. Ranka de bästa konsulterna PER erfarenhetsnivå (senior, intermediate, junior).
Juniors tävlar ALDRIG mot seniors — rankning sker enbart inom samma nivå.

Returnera topp 3 konsulter per nivå (eller färre om det finns färre). Om en nivå saknar konsulter, returnera tom lista.

Svara ALLTID med giltig JSON som matchar detta schema:
{
  "teamProposal": {
    "senior": [{ "consultantId": "uuid", "consultantName": "Namn", "level": "senior", "score": 85, "reasoning": "Varför denna konsult passar" }],
    "intermediate": [...],
    "junior": [...]
  },
  "teamEvaluation": {
    "overallFit": "Övergripande bedömning av teamets matchning",
    "gaps": ["Kompetens eller erfarenhet som saknas i teamet"],
    "requirementCoverage": {
      "must": { "met": 3, "total": 4, "details": ["Krav 1: uppfyllt av Anna", "Krav 2: ej uppfyllt"] },
      "should": { "met": 2, "total": 3, "details": [...] },
      "niceToHave": { "met": 1, "total": 2, "details": [...] }
    }
  }
}`;

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
  consultants: Consultant[]
): Promise<MatchResult> {
  const consultantText = formatConsultantsForPrompt(consultants);

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `Matcha följande konsulter mot detta förfrågningsunderlag.

## RFP-analys
${JSON.stringify(analysis, null, 2)}

## Tillgängliga konsulter
${consultantText}`,
      },
    ],
    system: MATCH_SYSTEM_PROMPT,
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON found in Claude response");
  }

  return JSON.parse(jsonMatch[0]) as MatchResult;
}

const REEVALUATE_SYSTEM_PROMPT = `Du är expert på att bedöma konsultteam mot förfrågningsunderlag.
Du får en RFP-analys, ett nytt team, och det tidigare teamförslaget.
Bedöm det nya teamet och jämför mot det tidigare.

Svara ALLTID med giltig JSON:
{
  "teamProposal": { "senior": [...], "intermediate": [...], "junior": [...] },
  "teamEvaluation": {
    "overallFit": "...",
    "gaps": [...],
    "requirementCoverage": { "must": {...}, "should": {...}, "niceToHave": {...} }
  },
  "comparison": "Jämförelse med tidigare team: vad har blivit bättre/sämre, t.ex. 'Tappade Power BI-erfarenhet, fick starkare offentlig-sektor-referenser'"
}`;

export async function reEvaluateTeam(
  analysis: RfpAnalysis,
  consultants: Consultant[],
  previousProposal: TeamProposal
): Promise<SwapComparison> {
  const consultantText = formatConsultantsForPrompt(consultants);

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `Bedöm detta konsultteam mot RFP:en och jämför med det tidigare förslaget.

## RFP-analys
${JSON.stringify(analysis, null, 2)}

## Tillgängliga konsulter (det nya teamet)
${consultantText}

## Tidigare teamförslag
${JSON.stringify(previousProposal, null, 2)}`,
      },
    ],
    system: REEVALUATE_SYSTEM_PROMPT,
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON found in Claude response");
  }

  return JSON.parse(jsonMatch[0]) as SwapComparison;
}
