import type { RfpRequirement } from "@/lib/types";

// Delar upp RFP-kraven i kvalifikationskrav vs leverabler. Saknat `kind` räknas som
// qualification (bakåtkompatibelt — äldre analyser + Zod-defaulten). Används för att
// hålla leverabler ute ur kravmatrisen och föda dem till genomförandeplanen.

export function qualificationRequirements(reqs: RfpRequirement[]): RfpRequirement[] {
  return reqs.filter((r) => r.kind !== "deliverable");
}

export function deliverableRequirements(reqs: RfpRequirement[]): RfpRequirement[] {
  return reqs.filter((r) => r.kind === "deliverable");
}
