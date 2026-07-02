import { describe, it, expect } from "vitest";
import type { RfpRequirement } from "@/lib/types";
import {
  qualificationRequirements,
  deliverableRequirements,
} from "../requirement-kind";

const reqs: RfpRequirement[] = [
  { category: "Konsultkvalifikationer", description: "5 års erfarenhet", priority: "must", kind: "qualification" },
  { category: "Leverans", description: "Skriftlig slutrapport", priority: "must", kind: "deliverable" },
  { category: "Legacy", description: "post utan kind", priority: "should" }, // saknar kind
];

describe("requirement-kind-filter", () => {
  it("qualificationRequirements = allt UTOM deliverable (saknat kind ⇒ qualification)", () => {
    expect(qualificationRequirements(reqs).map((r) => r.description)).toEqual([
      "5 års erfarenhet",
      "post utan kind",
    ]);
  });

  it("deliverableRequirements = endast kind=deliverable", () => {
    expect(deliverableRequirements(reqs).map((r) => r.description)).toEqual([
      "Skriftlig slutrapport",
    ]);
  });
});
