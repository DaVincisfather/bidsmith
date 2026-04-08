import {
  RfpAnalysis,
  Consultant,
  ScoredConsultant,
  GoNoGoResult,
} from "./types";

export interface BidContext {
  analysis: RfpAnalysis;
  teamConsultants: Consultant[];
  scoredConsultants: ScoredConsultant[];
  goNoGoResult: GoNoGoResult;
}

function formatContext(ctx: BidContext): string {
  const teamSummary = ctx.teamConsultants
    .map((c) => {
      const score = ctx.scoredConsultants.find(
        (s) => s.consultantId === c.id
      );
      const comps = c.competencies.map((co) => co.competency).join(", ");
      const refs = c.references
        .map((r) => `${r.title} (${r.year}, ${r.sector})`)
        .join("; ");
      return `- ${c.name} (${c.level}, score: ${score?.score ?? "N/A"})\n  Kompetenser: ${comps}\n  Uppdrag: ${refs}\n  AI-bedömning: ${score?.reasoning ?? "N/A"}`;
    })
    .join("\n\n");

  return `## Förfrågningsunderlag (RFP)
${JSON.stringify(ctx.analysis, null, 2)}

## Team
${teamSummary}

## Go/No-Go-bedömning
- Rekommendation: ${ctx.goNoGoResult.recommendation}
- Vinstchans: ${ctx.goNoGoResult.winProbability}%
- Styrkor: ${ctx.goNoGoResult.strengths.join(", ")}
- Luckor: ${ctx.goNoGoResult.gaps.join(", ")}
- Motivering: ${ctx.goNoGoResult.reasoning}`;
}

interface SectionPrompt {
  system: string;
  user: (ctx: BidContext) => string;
}

const SECTION_PROMPTS: Record<string, SectionPrompt> = {
  understanding: {
    system: `Du skriver sektionen "Uppdragsförståelse" i ett konsultanbud.
Visa att ni förstår kundens behov, utmaningar och mål — inte bara kraven.
Ton: professionell, empatisk, specifik. Undvik generiska påståenden.
Svara med giltig JSON: { "text": "Löpande text, 200-400 ord" }`,
    user: (ctx) =>
      `Skriv Uppdragsförståelse baserat på:\n\n${formatContext(ctx)}`,
  },

  "value-proposition": {
    system: `Du skriver sektionen "Identifierat värde" i ett konsultanbud.
Koppla varje värdepunkt till ett specifikt område i RFP:en.
Svara med giltig JSON: { "items": ["Punkt 1", "Punkt 2", ...] }
Varje punkt: 1-2 meningar. 4-6 punkter totalt.`,
    user: (ctx) =>
      `Identifiera värde vi kan leverera baserat på:\n\n${formatContext(ctx)}`,
  },

  "execution-plan": {
    system: `Du skriver sektionen "Genomförandeplan" i ett konsultanbud.
Bryt ner genomförandet i 3-5 faser med tydliga mål, aktiviteter och leverabler.
Svara med giltig JSON:
{
  "phases": [
    {
      "name": "Fas 1: Nulägesanalys",
      "objective": "Förstå nuvarande processer och identifiera förbättringsmöjligheter",
      "activities": ["Intervjuer med nyckelintressenter", "Dokumentanalys"],
      "deliverables": ["Nulägesrapport", "Gap-analys"],
      "duration": "2 veckor"
    }
  ]
}
Anpassa antalet faser efter uppdragets komplexitet. Varje fas ska ha konkreta, mätbara leverabler.`,
    user: (ctx) =>
      `Skapa en genomförandeplan baserat på:\n\n${formatContext(ctx)}`,
  },

  quality: {
    system: `Du skriver sektionen "Kvalitetssäkring och samverkan" i ett konsultanbud.
Beskriv hur ni säkerställer kvalitet: avstämningspunkter, rapportering, eskalering, kunskapsöverföring.
Svara med giltig JSON: { "text": "Löpande text, 150-250 ord" }`,
    user: (ctx) =>
      `Beskriv kvalitetssäkring för detta uppdrag:\n\n${formatContext(ctx)}`,
  },

  risks: {
    system: `Du skriver sektionen "Risker och hantering" i ett konsultanbud.
Identifiera 4-6 realistiska risker specifika för detta uppdrag. Koppla till RFP:ens red flags och luckor.
Svara med giltig JSON: { "items": ["Risk: X. Hantering: Y.", ...] }`,
    user: (ctx) =>
      `Identifiera risker och hanteringsstrategier baserat på:\n\n${formatContext(ctx)}`,
  },

  team: {
    system: `Du skriver sektionen "Teamet" i ett konsultanbud.
Presentera varje konsult med fokus på erfarenhet relevant för detta specifika uppdrag.
Svara med giltig JSON:
{
  "members": [
    {
      "consultantId": "uuid",
      "name": "Anna Svensson",
      "role": "Projektledare",
      "relevantExperience": "10 års erfarenhet av...",
      "keyCompetencies": ["Kompetens 1", "Kompetens 2"]
    }
  ]
}
Använd EXAKT namn och ID från teamlistan. Rollen ska vara specifik för detta uppdrag, inte en generell titel.`,
    user: (ctx) =>
      `Presentera teamet för detta uppdrag:\n\n${formatContext(ctx)}`,
  },

  references: {
    system: `Du skriver sektionen "Referensuppdrag" i ett konsultanbud.
Välj de mest relevanta referensuppdragen från teamets historik. Koppla varje referens till specifika krav i RFP:en.
Svara med giltig JSON:
{
  "references": [
    {
      "title": "Uppdragstitel",
      "client": "Kund",
      "year": 2024,
      "description": "Kort beskrivning av uppdraget",
      "relevance": "Relevant för detta uppdrag eftersom..."
    }
  ]
}
Välj 3-5 referensuppdrag. Prioritera nyliga och domänrelevanta.`,
    user: (ctx) =>
      `Välj relevanta referensuppdrag baserat på:\n\n${formatContext(ctx)}`,
  },

  summary: {
    system: `Du skriver sektionen "Sammanfattning — Varför oss" i ett konsultanbud.
Sammanfatta varför ni är rätt partner: teamets styrkor, relevant erfarenhet, och ert unika värde.
Svara med giltig JSON: { "text": "Löpande text, 150-250 ord" }
Avsluta med en framåtblickande mening.`,
    user: (ctx) =>
      `Skriv en sammanfattning av varför vi bör väljas:\n\n${formatContext(ctx)}`,
  },
};

export function getSectionPrompt(
  key: string
): SectionPrompt | undefined {
  return SECTION_PROMPTS[key];
}

export const AI_SECTION_KEYS = Object.keys(SECTION_PROMPTS);
