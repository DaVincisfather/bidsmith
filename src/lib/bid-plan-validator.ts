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

export function validateAndRepair(plan: BidPlan, ctx: BidContext): BidPlan {
  const cloned: BidPlan = JSON.parse(JSON.stringify(plan));

  // Pass A — inject missing required sections
  const presentKeys = new Set(
    cloned.sections.map((s) => s.semanticKey).filter((k): k is string => !!k)
  );
  for (const rule of REQUIRED_SECTIONS) {
    if (!presentKeys.has(rule.semanticKey)) {
      const injected = rule.buildDefault(ctx, cloned.language);
      cloned.sections.push(injected);
      console.log(
        `[bid-plan-validator] injected missing required section: ${rule.semanticKey}`
      );
    }
  }

  // Pass C — sanity checks (dedupe, gantt/phases coupling)
  cloned.sections = sanityCheck(cloned.sections);

  // Pass B — position enforcement (runs after sanity to keep constraints stable)
  cloned.sections = enforcePositions(cloned.sections);

  return cloned;
}

function sanityCheck(sections: PlannedSection[]): PlannedSection[] {
  let working = [...sections];

  // Remove duplicates of cover/toc/gantt, keep first occurrence of each.
  // For cover, also normalize semanticKey so enforcePositions (which looks up
  // by semanticKey) can find it even if the planner produced a cover without one.
  for (const dupKind of ["cover", "toc", "gantt"] as const) {
    let seen = false;
    working = working.filter((s) => {
      if (s.kind !== dupKind) return true;
      if (seen) {
        console.log(`[bid-plan-validator] removed duplicate ${dupKind}`);
        return false;
      }
      seen = true;
      return true;
    });
  }
  working = working.map((s) =>
    s.kind === "cover" && !s.semanticKey ? { ...s, semanticKey: "cover" } : s
  );

  // If phases exists but no gantt, auto-inject gantt right after phases
  const phasesIdx = working.findIndex((s) => s.kind === "phases");
  const ganttIdx = working.findIndex((s) => s.kind === "gantt");
  if (phasesIdx !== -1 && ganttIdx === -1) {
    const injected: PlannedSection = { kind: "gantt", title: "Tidplan" };
    working.splice(phasesIdx + 1, 0, injected);
    console.log("[bid-plan-validator] auto-injected gantt after phases");
  }

  // If gantt exists but no phases, remove orphan gantt
  if (ganttIdx !== -1 && phasesIdx === -1) {
    working = working.filter((s) => s.kind !== "gantt");
    console.warn("[bid-plan-validator] removed orphan gantt (no phases section)");
  }

  // Warn on long plan without dividers (do not inject)
  if (working.length > 6) {
    const hasDividers = working.some((s) => s.kind === "divider");
    if (!hasDividers) {
      console.warn(
        `[bid-plan-validator] plan has ${working.length} sections but no dividers — consider adding structure`
      );
    }
  }

  return working;
}

function extractBySemanticKey(
  sections: PlannedSection[],
  key: string
): { section: PlannedSection | undefined; rest: PlannedSection[] } {
  const idx = sections.findIndex((s) => s.semanticKey === key);
  if (idx === -1) return { section: undefined, rest: sections };
  const section = sections[idx];
  const rest = [...sections.slice(0, idx), ...sections.slice(idx + 1)];
  return { section, rest };
}

function enforcePositions(sections: PlannedSection[]): PlannedSection[] {
  let working = [...sections];

  // Extract cover, contact, confidentiality in any order
  const cover = extractBySemanticKey(working, "cover");
  working = cover.rest;
  const contact = extractBySemanticKey(working, "contact");
  working = contact.rest;
  const confidentiality = extractBySemanticKey(working, "confidentiality");
  working = confidentiality.rest;

  // Re-assemble: cover first, then middle, then contact, then confidentiality
  const out: PlannedSection[] = [];
  if (cover.section) {
    out.push(cover.section);
  } else {
    console.warn("[bid-plan-validator] no cover section after Pass A — this should not happen");
  }
  out.push(...working);
  if (contact.section) out.push(contact.section);
  if (confidentiality.section) out.push(confidentiality.section);

  return out;
}
