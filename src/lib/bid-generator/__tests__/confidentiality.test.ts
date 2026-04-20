import { describe, it, expect } from "vitest";
import { buildConfidentialitySection } from "../deterministic/confidentiality";
import type { RfpAnalysis } from "@/lib/types";

const baseAnalysis: RfpAnalysis = {
  title: "t", client: "c", deadline: null, summary: "s",
  requirements: [], evaluationCriteria: [], requiredCompetencies: [],
  estimatedScope: "", redFlags: [], domain: "",
  oslReference: null, secrecyRows: [],
};

describe("buildConfidentialitySection", () => {
  it("passes through oslReference and secrecyRows from analysis", () => {
    const a: RfpAnalysis = {
      ...baseAnalysis,
      oslReference: "19 kap 3 §",
      secrecyRows: [{ reference: "Bilaga 2", scope: "Personuppgifter", justification: "GDPR" }],
    };
    const s = buildConfidentialitySection(a);
    if (s.content.format !== "confidentiality") throw new Error("format mismatch");
    expect(s.content.oslReference).toBe("19 kap 3 §");
    expect(s.content.secrecyRows).toEqual(a.secrecyRows);
  });

  it("falls back to empty string when oslReference is null", () => {
    const s = buildConfidentialitySection(baseAnalysis);
    if (s.content.format !== "confidentiality") throw new Error("format mismatch");
    expect(s.content.oslReference).toBe("");
    expect(s.content.secrecyRows).toEqual([]);
  });
});
