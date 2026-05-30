import { callClaude } from "./ai-client";
import { ConsultantExtractionSchema } from "./ai-schemas";
import { ConsultantExtraction } from "./types";

const SYSTEM_PROMPT = `Du är expert på att analysera konsult-CV:n och extrahera strukturerad profildata.
Du läser ett CV-dokument och producerar en strukturerad profil i JSON-format.

Svara ALLTID med giltig JSON som matchar detta schema:
{
  "name": "Konsultens fullständiga namn",
  "level": "junior | intermediate | senior | expert",
  "yearsExperience": 12,
  "summary": "2-3 meningars sammanfattning av konsultens profil och styrkor",
  "competencies": [
    {
      "competency": "Kompetensnamn",
      "category": "technical | domain | methodology | certification"
    }
  ],
  "references": [
    {
      "title": "Uppdragstitel",
      "description": "Kort beskrivning av uppdraget och konsultens roll",
      "year": 2024,
      "sector": "public | private"
    }
  ]
}

Regler:
- level: junior (<3 år), intermediate (3-7 år), senior (7-15 år), expert (>15 år)
- Extrahera ALLA kompetenser som nämns (nyckelkompetenser, verktyg, metoder, certifieringar)
- Kategorisera kompetenser: technical (verktyg, programmering, system), domain (bransch, sektor), methodology (metoder, ramverk), certification (certifieringar, utbildningar utöver examen)
- Extrahera ALLA uppdrag/referensprojekt som nämns
- sector: bedöm om kunden är offentlig (kommun, region, myndighet) eller privat
- Om information saknas, gör en rimlig bedömning baserat på context`;

export async function extractConsultant(
  cvText: string,
  userId?: string | null
): Promise<ConsultantExtraction> {
  return callClaude({
    model: "claude-sonnet-4-6",
    maxTokens: 4000,
    system: SYSTEM_PROMPT,
    userContent: `Analysera följande konsult-CV och returnera en strukturerad JSON-profil:\n\n${cvText}`,
    schema: ConsultantExtractionSchema,
    label: "consultant-extraction",
    userId,
  });
}
