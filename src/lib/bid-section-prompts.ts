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

// --- Format-level prompts ---

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
    "Sektionen ska beskriva det VÄRDE SOM UPPDRAGET SKAPAR FÖR KUNDEN om vi vinner — inte hur teamet lever upp till krav. Fokus: affärsnytta, effektivisering, risk-reduktion, strategiskt värde. Koppla till kundens mål, inte till våra kompetenser.",
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

const STYLE_RULES = `Skriv som en erfaren konsult — inte som en AI. Undvik:
- Överdrivna adjektiv ("unik", "banbrytande", "holistisk", "robust", "sömlös")
- Abstrakta floskler utan substans
- Upprepande mönster och parallella strukturer i varje stycke
- Markdown-formatering (**, ##, etc.) — returnera ren text
Skriv konkret, direkt och professionellt. Kortare meningar. Variera meningslängd.`;

export const FORMAT_PROMPTS: FormatPromptSet = {
  prose: {
    system: ({ language, promptHint, semanticKey }) =>
      `Du skriver en prose-sektion i ett konsultanbud på språk "${language}".
${semanticGuidance(semanticKey, language)}
${STYLE_RULES}
Fokus enligt plannern: ${promptHint}
Svara med giltig JSON: { "text": "..." }
150–300 ord. Inga rubriker inuti texten.`,
    userContent: formatContext,
  },

  bullets: {
    system: ({ language, promptHint, semanticKey, minItems }) =>
      `Du skriver en bullets-sektion i ett konsultanbud på språk "${language}".
${semanticGuidance(semanticKey, language)}
${STYLE_RULES}
Fokus enligt plannern: ${promptHint}
Svara med giltig JSON: { "items": ["Punkt 1", "Punkt 2", ...] }
${minItems ? `Minst ${minItems} punkter.` : "4-6 punkter."} Varje punkt: 1-2 meningar. Börja INTE punkter med ** eller annan formatering — ren text.`,
    userContent: formatContext,
  },

  "three-column": {
    system: ({ language, columnHints, semanticKey }) =>
      `Du skriver en three-column-sektion i ett konsultanbud på språk "${language}".
${semanticGuidance(semanticKey, language)}
${STYLE_RULES}
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
${STYLE_RULES}
Fokus enligt plannern: ${promptHint}
Bryt ner genomförandet i 3-5 faser med tydliga mål, aktiviteter och leverabler.

VIKTIGT om realism:
- Leverabler per fas: max 2-3 konkreta leverabler. Lova BARA det RFP:en faktiskt efterfrågar — ingen överkommunikation. Totalt antal leverabler över alla faser ska vara hanterbart, inte en önskelista.
- Timmar: uppskatta realistiskt baserat på scope. Projektetablering tar ofta 2-4 veckor, inte 1.
- Duration: matcha tidplanen mot projektets verkliga komplexitet och köpta timmar.
- Aktiviteter: inkludera bara aktiviteter ni faktiskt planerar genomföra. Om intervjuer nämns i en fas, se till att intervjugenomförande finns i en annan fas.
- Var konsistent — referera inte till saker som inte dyker upp i andra faser.

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
${STYLE_RULES}
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
${STYLE_RULES}
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
