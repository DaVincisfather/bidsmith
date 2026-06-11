import { RfpAnalysis } from "./types";
import { RfpAnalysisSchema } from "./ai-schemas";
import { callClaude } from "./ai-client";
import { MODELS } from "./models";

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
  "evaluationCriteria": [ { "name": "...", "weight": 40, "description": "..." } ] — weight är procentvikt 0-100, eller null om källan inte anger procentvikter,
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
- Extrahera utvärderingskriterier. weight = procentvikt ENDAST om källan uttryckligen
  anger procentvikter. Vid rangordning, prisavdragsmodeller (mervärde i kronor) eller
  annan icke-procentuell utvärdering: sätt weight till null och beskriv modellen i
  description. Hitta ALDRIG på vikter som inte står i underlaget.
- Identifiera oklarheter (redFlags)
- Plocka diarienummer exakt — utelämna fältet om det saknas
- Extrahera OSL-referens och sekretess-bilagor om RFP:en behandlar sekretess; annars null respektive tom lista
- Sammanfatta i professionell ton`;

export async function analyzeRfp(
  rfpText: string,
  userId?: string | null
): Promise<RfpAnalysis> {
  return callClaude({
    model: MODELS.extraction,
    // 8000: stora FFU:er (200k+ tecken) ger analyser som trunkerades av
    // 4000-taket mitt i JSON:en — deterministiskt vid temp 0.
    maxTokens: 8000,
    system: SYSTEM_PROMPT,
    userContent: `Analysera följande förfrågningsunderlag och returnera en strukturerad JSON-analys:\n\n${rfpText}`,
    schema: RfpAnalysisSchema,
    label: "RFP analysis",
    // Extraktion ska vara deterministisk: samma FFU → samma kravlista, både för
    // kunden och för eval-grinden (temp 1.0 tärningskastade segmenteringen).
    temperature: 0,
    userId,
  });
}
