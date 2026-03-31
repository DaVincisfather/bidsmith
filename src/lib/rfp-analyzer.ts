import Anthropic from "@anthropic-ai/sdk";
import { RfpAnalysis } from "./types";

const client = new Anthropic();

const SYSTEM_PROMPT = `Du är en expert på att analysera förfrågningsunderlag (RFP:er) för konsultuppdrag.
Du läser ett RFP-dokument och producerar en strukturerad analys i JSON-format.

Svara ALLTID med giltig JSON som matchar detta schema:
{
  "title": "Uppdragets titel",
  "client": "Kund/beställare (om angivet, annars 'Ej angivet')",
  "deadline": "Sista anbudsdag i ISO-format, eller null",
  "summary": "2-3 meningar som sammanfattar uppdraget",
  "requirements": [
    {
      "category": "Kategori (t.ex. Kompetens, Erfarenhet, Kapacitet)",
      "description": "Beskrivning av kravet",
      "priority": "must | should | nice-to-have"
    }
  ],
  "evaluationCriteria": [
    {
      "name": "Kriteriets namn",
      "weight": 40,
      "description": "Vad som bedöms"
    }
  ],
  "requiredCompetencies": ["kompetens1", "kompetens2"],
  "estimatedScope": "Uppskattad omfattning i tid/resurser",
  "redFlags": ["Potentiella risker eller oklarheter i underlaget"]
}

Var noggrann med att:
- Skilja mellan ska-krav (must) och bör-krav (should)
- Extrahera utvärderingskriterier med vikter om de anges
- Identifiera oklarheter eller potentiella problem (redFlags)
- Sammanfatta i professionell ton`;

export async function analyzeRfp(rfpText: string): Promise<RfpAnalysis> {
  const message = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `Analysera följande förfrågningsunderlag och returnera en strukturerad JSON-analys:\n\n${rfpText}`,
      },
    ],
    system: SYSTEM_PROMPT,
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  // Extract JSON from response (Claude may wrap it in markdown code blocks)
  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON found in Claude response");
  }

  const analysis: RfpAnalysis = JSON.parse(jsonMatch[0]);
  return analysis;
}
