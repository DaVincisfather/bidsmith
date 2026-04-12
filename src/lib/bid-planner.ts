import { z } from "zod";
import { BidPlanSchema, PlannedSectionSchema } from "./ai-schemas";
import { callClaude } from "./ai-client";
import type { BidContext } from "./bid-section-prompts";

// Type aliases inferred from Zod schemas
export type BidPlan = z.infer<typeof BidPlanSchema>;
export type PlannedSection = z.infer<typeof PlannedSectionSchema>;
export type SectionKind = PlannedSection["kind"];

// Subsequent tasks add planBid, planBidOrFallback

export const DEFAULT_BID_PLAN: BidPlan = {
  language: "sv",
  sections: [
    { kind: "cover", semanticKey: "cover" },
    { kind: "toc", title: "Innehåll" },
    {
      kind: "divider",
      number: 1,
      title: "Uppdragsförståelse",
      subtitle: "Vår förståelse och approach",
    },
    {
      kind: "prose",
      title: "Uppdragsförståelse",
      promptHint: "Visa förståelse för uppdragets kärna — inte bara repetera RFP:n",
      semanticKey: "understanding",
    },
    {
      kind: "bullets",
      title: "Identifierat värde",
      promptHint: "4-6 värdepunkter kopplade till RFP:ens kravområden",
      semanticKey: "value-proposition",
    },
    {
      kind: "divider",
      number: 2,
      title: "Genomförande",
      subtitle: "Metod, faser och tidplan",
    },
    {
      kind: "phases",
      title: "Genomförandeplan",
      promptHint: "3-5 faser med aktiviteter, leverabler och risker",
      semanticKey: "execution-plan",
    },
    { kind: "gantt", title: "Tidplan" },
    {
      kind: "three-column",
      title: "Kvalitetssäkring och samverkan",
      columnHints: ["Metodik", "Kvalitetsstyrning", "Samverkan"] as [string, string, string],
      semanticKey: "quality",
    },
    {
      kind: "bullets",
      title: "Risker och hantering",
      promptHint: "4-6 risker med mitigering — parade ihop",
      semanticKey: "risks",
    },
    {
      kind: "divider",
      number: 3,
      title: "Team & Referenser",
      subtitle: "Vårt team och relevanta uppdrag",
    },
    { kind: "team", title: "Team", semanticKey: "team" },
    {
      kind: "requirement-matrix",
      title: "Kravuppfyllnad",
      semanticKey: "requirement-matrix",
    },
    { kind: "references", title: "Referenser", minCount: 3, semanticKey: "references" },
    {
      kind: "placeholder",
      title: "Pris & omfattning",
      instruction: "Fyll i prisbild, timmar och eventuella förbehåll",
      semanticKey: "pricing",
    },
    {
      kind: "placeholder",
      title: "Kontakt",
      instruction: "Fyll i kontaktuppgifter för ansvarig säljare och uppdragsledare",
      semanticKey: "contact",
    },
    {
      kind: "placeholder",
      title: "Anbudssekretess",
      instruction: "Lägg in sekretess-boilerplate och ISO-certifieringar",
      semanticKey: "confidentiality",
    },
  ],
};

const PLANNER_SYSTEM = `Du är en bid planner för konsultanbud. Din uppgift är att PLANERA struktur och format, INTE skriva innehåll.

## Tillgängliga sektionstyper (closed palette)
- cover: framsida med titel/kund/datum
- toc: innehållsförteckning
- divider: sektionsavdelare med nummer + titel + subtitle
- prose: löpande text (150-400 ord)
- bullets: punktlista (3-7 punkter)
- three-column: tre parallella kolumner med titel + ikon + brödtext
- phases: faslista med aktiviteter, leverabler, risker
- gantt: tidplan (genereras automatiskt från phases)
- team: teampresentation baserad på tillgängliga konsulter
- requirement-matrix: kravmatris mot konsulter
- references: referensuppdrag
- placeholder: sektion som fylls i manuellt

## Obligatoriska semanticKeys
Anbudet MÅSTE innehålla följande semanticKey-värden (sätt semanticKey-fältet till exakt dessa strängar):
- "cover" (kind: cover, måste vara första sektionen)
- "quality" (kind: prose, fri position)
- "team" (kind: team, fri position)
- "requirement-matrix" (kind: requirement-matrix, fri position)
- "references" (kind: references, fri position)
- "contact" (kind: placeholder, näst sista sektionen)
- "confidentiality" (kind: placeholder, sista sektionen)

Övriga användbara semanticKeys (valfria): "understanding", "value-proposition", "execution-plan", "risks", "pricing".

## Format-variation (viktigt)
Fall INTE tillbaka på prose som standard. Använd three-column för jämförelser eller perspektiv, bullets för listor av värden/risker, phases för genomförande. Variation är centralt — anbudet får inte se ut som alla andra anbud.

## Omappade krav
Om ett RFP-krav inte passar någon av ovanstående format, skapa en placeholder med reason: "unmapped-requirement" och lista kravet på toppnivåns unmappedRequirements-array.

## Rationale
Skriv en mening per betydande strukturellt val i rationale-fältet.

## Language
Infera language från RFP:ns språk ("sv" eller "en").

Svara ENDAST med giltig JSON som matchar BidPlan-schemat. Inget annat.`;

function formatPlannerContext(ctx: BidContext): string {
  const topRequirements = ctx.analysis.requirements
    .slice(0, 10)
    .map((r, i) => `${i + 1}. [${r.priority}] ${r.description}`)
    .join("\n");

  const teamRoles = ctx.teamConsultants
    .map((c) => `- ${c.name} (${c.level})`)
    .join("\n");

  return `## RFP
Titel: ${ctx.analysis.title}
Kund: ${ctx.analysis.client}
Domän: ${ctx.analysis.domain}
Omfattning: ${ctx.analysis.estimatedScope}
Sammanfattning: ${ctx.analysis.summary}

## Top-10 krav
${topRequirements || "(inga)"}

## Team (${ctx.teamConsultants.length} personer)
${teamRoles || "(inget)"}

Planera en effektiv, RFP-anpassad struktur. Variera format. Returnera giltig JSON enligt BidPlan-schemat.`;
}

export async function planBid(ctx: BidContext): Promise<BidPlan> {
  const user = formatPlannerContext(ctx);

  try {
    return await callClaude({
      model: "claude-sonnet-4-6",
      maxTokens: 3000,
      system: PLANNER_SYSTEM,
      userContent: user,
      schema: BidPlanSchema,
      label: "bid planner",
    });
  } catch (firstError) {
    console.warn("[bid-planner] first attempt failed, retrying with sharpened prompt:", firstError);
    const sharpened =
      PLANNER_SYSTEM +
      "\n\n## VIKTIGT\nFöregående försök returnerade INVALID JSON eller matchade inte BidPlan-schemat. Returnera ENDAST giltig JSON som exakt matchar schemat. Inga kommentarer, inga förklaringar utanför JSON.";
    return await callClaude({
      model: "claude-sonnet-4-6",
      maxTokens: 3000,
      system: sharpened,
      userContent: user,
      schema: BidPlanSchema,
      label: "bid planner (retry)",
    });
  }
}

export async function planBidOrFallback(ctx: BidContext): Promise<BidPlan> {
  try {
    return await planBid(ctx);
  } catch (err) {
    console.error("[bid-planner] planner failed, using DEFAULT_BID_PLAN:", err);
    return DEFAULT_BID_PLAN;
  }
}
