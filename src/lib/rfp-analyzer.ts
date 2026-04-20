import { RfpAnalysis } from "./types";
import { RfpAnalysisSchema } from "./ai-schemas";
import { callClaude } from "./ai-client";

const SYSTEM_PROMPT = `Du är en expert på att analysera förfrågningsunderlag (RFP:er) för konsultuppdrag.
Du läser ett RFP-dokument och producerar en strukturerad analys i JSON-format.

Svara ALLTID med giltig JSON som matchar detta schema:
{
  "title": "Uppdragets titel",
  "client": "Kund/beställare (om angivet, annars 'Ej angivet')",
  "deadline": "Sista anbudsdag i ISO-format, eller null",
  "diaryNumber": "Diarienummer/upphandlings-ID om angivet i dokumentet (t.ex. 'VGR-2026-0042', 'Dnr 12345/2024'). Utelämna fältet helt om det inte anges.",
  "summary": "2-3 meningar som sammanfattar uppdraget — kort och skarpt",
  "background": "4-6 meningar som beskriver uppdragets kontext: varför upphandlingen sker, vad kunden vill åstadkomma, eventuell historik eller strategisk riktning. Skriv flytande prosa, inte punktlista.",
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
  "redFlags": ["Potentiella risker eller oklarheter i underlaget"],
  "domain": "Kort domäntagg, t.ex. IT, management, ekonomi, HR, hälsa, infrastruktur"
}

Var noggrann med att:
- Skilja mellan ska-krav (must) och bör-krav (should)
- Extrahera utvärderingskriterier med vikter om de anges
- Identifiera oklarheter eller potentiella problem (redFlags)
- Plocka diarienummer/upphandlings-ID exakt som det står i dokumentet — utelämna fältet om det saknas, gissa aldrig
- Sammanfatta i professionell ton`;

export async function analyzeRfp(rfpText: string): Promise<RfpAnalysis> {
  return callClaude({
    model: "claude-sonnet-4-6",
    maxTokens: 4000,
    system: SYSTEM_PROMPT,
    userContent: `Analysera följande förfrågningsunderlag och returnera en strukturerad JSON-analys:\n\n${rfpText}`,
    schema: RfpAnalysisSchema,
    label: "RFP analysis",
  });
}
