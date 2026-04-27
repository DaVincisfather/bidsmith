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
  "diaryNumber": "Diarienummer/upphandlings-ID om angivet i dokumentet. Utelämna fältet helt om det inte anges.",
  "summary": "2-3 meningar som sammanfattar uppdraget — kort och skarpt",
  "background": "4-6 meningar som beskriver uppdragets kontext.",
  "requirements": [
    { "category": "Kategori", "description": "Beskrivning", "priority": "must | should | nice-to-have" }
  ],
  "evaluationCriteria": [ { "name": "...", "weight": 40, "description": "..." } ],
  "requiredCompetencies": ["..."],
  "estimatedScope": "...",
  "redFlags": ["..."],
  "domain": "...",
  "oslReference": "Paragraf i offentlighets- och sekretesslagen (OSL) som RFP:en hänvisar till, t.ex. '19 kap 3 §'. Använd null om inte nämnd.",
  "secrecyRows": [
    {
      "reference": "Bilaga eller avsnitt som ska sekretessbeläggas, t.ex. 'Bilaga 2'",
      "scope": "Vad sekretessen gäller",
      "justification": "Motivering baserad på RFP-texten"
    }
  ]
}

Var noggrann med att:
- priority MÅSTE vara exakt ett av strängvärdena "must", "should", "nice-to-have".
  Mappa svenska termer: ska-krav/skall-krav/skall/ska → "must",
  bör-krav/bör → "should", kan-krav/kan/önskemål → "nice-to-have".
  Använd aldrig svenska värden eller andra varianter i fältet.
- Extrahera utvärderingskriterier med vikter
- Identifiera oklarheter (redFlags)
- Plocka diarienummer exakt — utelämna fältet om det saknas
- Extrahera OSL-referens och sekretess-bilagor om RFP:en behandlar sekretess; annars null respektive tom lista
- Sammanfatta i professionell ton`;

export async function analyzeRfp(
  rfpText: string,
  organizationId?: string | null
): Promise<RfpAnalysis> {
  return callClaude({
    model: "claude-sonnet-4-6",
    maxTokens: 4000,
    system: SYSTEM_PROMPT,
    userContent: `Analysera följande förfrågningsunderlag och returnera en strukturerad JSON-analys:\n\n${rfpText}`,
    schema: RfpAnalysisSchema,
    label: "RFP analysis",
    organizationId,
  });
}
