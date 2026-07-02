import type { RfpRequirement } from "@/lib/types";

// Delar upp RFP-kraven i kvalifikationskrav vs leverabler. Saknat `kind` räknas som
// qualification (bakåtkompatibelt — äldre analyser + Zod-defaulten). Generisk util
// (analysvy, go/no-go, bid-bundles) — leverabler ska aldrig behandlas som ska/bör-krav.

export function qualificationRequirements(reqs: RfpRequirement[]): RfpRequirement[] {
  return reqs.filter((r) => r.kind !== "deliverable");
}

export function deliverableRequirements(reqs: RfpRequirement[]): RfpRequirement[] {
  return reqs.filter((r) => r.kind === "deliverable");
}
