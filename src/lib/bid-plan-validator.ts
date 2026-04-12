import type { BidPlan, PlannedSection } from "./bid-planner";
import type { BidContext } from "./bid-section-prompts";

export type RequiredSectionRule = {
  semanticKey: string;
  kind: PlannedSection["kind"];
  position: "first" | "second-to-last" | "last" | "free";
  buildDefault: (ctx: BidContext, language: "sv" | "en") => PlannedSection;
};

export const REQUIRED_SECTIONS: RequiredSectionRule[] = [
  {
    semanticKey: "cover",
    kind: "cover",
    position: "first",
    buildDefault: () => ({ kind: "cover", semanticKey: "cover" }),
  },
  {
    semanticKey: "quality",
    kind: "prose",
    position: "free",
    buildDefault: (_ctx, language) => ({
      kind: "prose",
      title: language === "sv" ? "Kvalitetssäkring och samverkan" : "Quality and collaboration",
      promptHint:
        language === "sv"
          ? "Hur kvalitet säkerställs, samverkan, rapportering, eskalering"
          : "How quality is assured, collaboration, reporting, escalation",
      semanticKey: "quality",
    }),
  },
  {
    semanticKey: "team",
    kind: "team",
    position: "free",
    buildDefault: (_ctx, language) => ({
      kind: "team",
      title: language === "sv" ? "Team" : "Team",
      semanticKey: "team",
    }),
  },
  {
    semanticKey: "requirement-matrix",
    kind: "requirement-matrix",
    position: "free",
    buildDefault: (_ctx, language) => ({
      kind: "requirement-matrix",
      title: language === "sv" ? "Kravuppfyllnad" : "Requirement coverage",
      semanticKey: "requirement-matrix",
    }),
  },
  {
    semanticKey: "references",
    kind: "references",
    position: "free",
    buildDefault: (_ctx, language) => ({
      kind: "references",
      title: language === "sv" ? "Referenser" : "References",
      minCount: 3,
      semanticKey: "references",
    }),
  },
  {
    semanticKey: "contact",
    kind: "placeholder",
    position: "second-to-last",
    buildDefault: (_ctx, language) => ({
      kind: "placeholder",
      title: language === "sv" ? "Kontakt" : "Contact",
      instruction:
        language === "sv"
          ? "Fyll i kontaktuppgifter för ansvarig säljare och uppdragsledare"
          : "Fill in contact details for responsible sales lead and engagement manager",
      semanticKey: "contact",
    }),
  },
  {
    semanticKey: "confidentiality",
    kind: "placeholder",
    position: "last",
    buildDefault: (_ctx, language) => ({
      kind: "placeholder",
      title: language === "sv" ? "Anbudssekretess" : "Confidentiality",
      instruction:
        language === "sv"
          ? "Lägg in sekretess-boilerplate och ISO-certifieringar"
          : "Add confidentiality boilerplate and ISO certifications",
      semanticKey: "confidentiality",
    }),
  },
];

export function validateAndRepair(plan: BidPlan, _ctx: BidContext): BidPlan {
  // Deep-clone so we never mutate the input
  const cloned: BidPlan = JSON.parse(JSON.stringify(plan));
  // Pass A — injection (Task 5)
  // Pass B — position enforcement (Task 6)
  // Pass C — sanity checks (Task 7)
  return cloned;
}
