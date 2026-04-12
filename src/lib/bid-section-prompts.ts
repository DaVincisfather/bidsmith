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
      "duration": "2 veckor",
      "risks": ["Tillgång till nyckelpersoner kan fördröjas"],
      "hoursEstimate": 80,
      "period": "Mars 2026"
    }
  ]
}
Anpassa antalet faser efter uppdragets komplexitet. Varje fas ska ha konkreta, mätbara leverabler.
Inkludera alltid risks (1-2 per fas), hoursEstimate (antal konsulttimmar), och period (tidsperiod i klartext).`,
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

// --- Format-level prompts (new architecture) ---

export type AiFormat = "prose" | "bullets" | "three-column" | "phases" | "team" | "references";

type Language = "sv" | "en";

interface ProseArgs {
  language: Language;
  promptHint: string;
  semanticKey: string | undefined;
}
interface BulletsArgs {
  language: Language;
  promptHint: string;
  semanticKey: string | undefined;
  minItems?: number;
}
interface ThreeColumnArgs {
  language: Language;
  columnHints: [string, string, string];
  semanticKey: string | undefined;
}
interface PhasesArgs {
  language: Language;
  promptHint: string;
  semanticKey: string | undefined;
}
interface TeamArgs {
  language: Language;
  preferredSize: number | undefined;
  semanticKey: string | undefined;
}
interface ReferencesArgs {
  language: Language;
  minCount: number | undefined;
  semanticKey: string | undefined;
}

interface FormatPromptSet {
  prose: {
    system: (args: ProseArgs) => string;
    userContent: (ctx: BidContext) => string;
  };
  bullets: {
    system: (args: BulletsArgs) => string;
    userContent: (ctx: BidContext) => string;
  };
  "three-column": {
    system: (args: ThreeColumnArgs) => string;
    userContent: (ctx: BidContext) => string;
  };
  phases: {
    system: (args: PhasesArgs) => string;
    userContent: (ctx: BidContext) => string;
  };
  team: {
    system: (args: TeamArgs) => string;
    userContent: (ctx: BidContext) => string;
  };
  references: {
    system: (args: ReferencesArgs) => string;
    userContent: (ctx: BidContext) => string;
  };
}

const SEMANTIC_GUIDANCE_SV: Record<string, string> = {
  understanding:
    "Sektionen ska visa att ni förstått uppdragets kärna — inte bara repetera RFP:n.",
  "value-proposition":
    "Sektionen ska koppla varje värdepunkt till ett specifikt område i RFP:en.",
  "execution-plan":
    "Sektionen ska bryta ner genomförandet i faser med konkreta, mätbara leverabler.",
  quality:
    "Sektionen ska säkerställa kvalitet: täck avstämningar, rapportering, eskalering, kunskapsöverföring.",
  risks:
    "Sektionen ska lista risker med mitigering — parade ihop, specifika för detta uppdrag.",
  team: "Sektionen ska presentera konsulterna med fokus på relevans för just detta uppdrag.",
  references:
    "Sektionen ska välja referenser som kopplar till RFP:ens krav och domän.",
};

const SEMANTIC_GUIDANCE_EN: Record<string, string> = {
  understanding:
    "This section should show you understood the core of the engagement — not just repeat the RFP.",
  "value-proposition":
    "This section should tie each value point to a specific area of the RFP.",
  "execution-plan":
    "This section should break execution into phases with concrete, measurable deliverables.",
  quality:
    "This section should ensure quality: cover check-ins, reporting, escalation, knowledge transfer.",
  risks:
    "This section should list risks paired with mitigations, specific to this engagement.",
  team: "This section should present consultants focused on relevance to this specific engagement.",
  references:
    "This section should pick references that tie back to the RFP's requirements and domain.",
};

export function semanticGuidance(
  key: string | undefined,
  language: Language
): string {
  if (!key) return "";
  const map = language === "sv" ? SEMANTIC_GUIDANCE_SV : SEMANTIC_GUIDANCE_EN;
  return map[key] ?? "";
}

export const FORMAT_PROMPTS: FormatPromptSet = {
  prose: {
    system: ({ language, promptHint, semanticKey }) =>
      `Du skriver en prose-sektion i ett konsultanbud på språk "${language}".
${semanticGuidance(semanticKey, language)}
Fokus enligt plannern: ${promptHint}
Svara med giltig JSON: { "text": "..." }
150–300 ord. Inga rubriker inuti texten.`,
    userContent: formatContext,
  },

  bullets: {
    system: ({ language, promptHint, semanticKey, minItems }) =>
      `Du skriver en bullets-sektion i ett konsultanbud på språk "${language}".
${semanticGuidance(semanticKey, language)}
Fokus enligt plannern: ${promptHint}
Svara med giltig JSON: { "items": ["Punkt 1", "Punkt 2", ...] }
${minItems ? `Minst ${minItems} punkter.` : "4-6 punkter."} Varje punkt: 1-2 meningar.`,
    userContent: formatContext,
  },

  "three-column": {
    system: ({ language, columnHints, semanticKey }) =>
      `Du skriver en three-column-sektion i ett konsultanbud på språk "${language}".
${semanticGuidance(semanticKey, language)}
Kolumnerna ska motsvara dessa tre teman:
1. ${columnHints[0]}
2. ${columnHints[1]}
3. ${columnHints[2]}
Svara med giltig JSON:
{
  "columns": [
    { "title": "...", "icon": "N", "body": "..." },
    { "title": "...", "icon": "V", "body": "..." },
    { "title": "...", "icon": "U", "body": "..." }
  ]
}
Varje kolumns body: 30-60 ord. icon är en enskild bokstav som representerar temat.`,
    userContent: formatContext,
  },

  phases: {
    system: ({ language, promptHint, semanticKey }) =>
      `Du skriver en phases-sektion i ett konsultanbud på språk "${language}".
${semanticGuidance(semanticKey, language)}
Fokus enligt plannern: ${promptHint}
Bryt ner genomförandet i 3-5 faser med tydliga mål, aktiviteter och leverabler.
Svara med giltig JSON:
{
  "phases": [
    {
      "name": "Fas 1: ...",
      "objective": "...",
      "activities": ["..."],
      "deliverables": ["..."],
      "duration": "2 veckor",
      "risks": ["..."],
      "hoursEstimate": 80,
      "period": "Mars 2026"
    }
  ]
}
Inkludera alltid risks (1-2 per fas), hoursEstimate och period.`,
    userContent: formatContext,
  },

  team: {
    system: ({ language, preferredSize, semanticKey }) =>
      `Du skriver en team-sektion i ett konsultanbud på språk "${language}".
${semanticGuidance(semanticKey, language)}
Presentera varje konsult med fokus på erfarenhet relevant för DETTA uppdrag.
${preferredSize ? `Fokusera på ${preferredSize} nyckelpersoner.` : ""}
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
Använd EXAKT namn och ID från teamlistan.`,
    userContent: formatContext,
  },

  references: {
    system: ({ language, minCount, semanticKey }) =>
      `Du skriver en references-sektion i ett konsultanbud på språk "${language}".
${semanticGuidance(semanticKey, language)}
Välj ${minCount ?? 3}-5 relevanta referensuppdrag från teamets historik. Prioritera nyliga och domänrelevanta.
Svara med giltig JSON:
{
  "references": [
    {
      "title": "Uppdragstitel",
      "client": "Kund",
      "year": 2024,
      "description": "Kort beskrivning",
      "relevance": "Relevant eftersom..."
    }
  ]
}`,
    userContent: formatContext,
  },
};
