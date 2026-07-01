import { describe, it, expect } from "vitest";
import { formatContext, type BidContext } from "../context";
import type {
  RfpAnalysis,
  Consultant,
  ScoredConsultant,
  GoNoGoResult,
} from "@/lib/types";

const analysis: RfpAnalysis = {
  title: "Strategiskt utvecklingsstöd",
  client: "Region Västra Götaland",
  deadline: "2026-05-01",
  summary: "x",
  requirements: [],
  evaluationCriteria: [],
  requiredCompetencies: [],
  estimatedScope: "x",
  redFlags: [],
  domain: "management",
  oslReference: null,
  secrecyRows: [],
};

const goNoGoResult: GoNoGoResult = {
  mustRequirements: [],
  winProbability: 60,
  winProbabilityReasoning: "Stark matchning.",
  strengths: ["Erfaret team"],
  gaps: ["Tunn referens"],
  improvements: [],
  recommendation: "go",
  reasoning: "Stark matchning.",
};

const baseCtx: BidContext = {
  analysis,
  teamConsultants: [] as Consultant[],
  scoredConsultants: [] as ScoredConsultant[],
  goNoGoResult,
};

describe("formatContext", () => {
  it("prependar avsändarprofil när ctx.profile finns", () => {
    const out = formatContext({
      ...baseCtx,
      profile: {
        id: "p1",
        companyName: "Testbolaget AB",
        logoPath: null,
        colors: null,
        tonality: "Rak, konkret, inga superlativ.",
        boilerplate: "Grundat 2001 i Göteborg.",
      },
    });
    expect(out.indexOf("## Avsändarprofil")).toBe(0);
    expect(out).toContain("Testbolaget AB");
    expect(out).toContain("Rak, konkret");
    expect(out.indexOf("## Avsändarprofil")).toBeLessThan(
      out.indexOf("## Förfrågningsunderlag"),
    );
  });

  it("oförändrad output utan profil (cache-paritet med legacy)", () => {
    expect(formatContext(baseCtx)).toMatch(/^## Förfrågningsunderlag/);
  });
});
