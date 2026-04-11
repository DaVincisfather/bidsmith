import { z } from "zod";
import { BidPlanSchema, PlannedSectionSchema } from "./ai-schemas";

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
      kind: "prose",
      title: "Kvalitetssäkring och samverkan",
      promptHint: "Avstämningar, rapportering, eskalering, kunskapsöverföring",
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
