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

  // Fas C — policy A: obelagda konsult-claims får inte nå anbudstexten.
  const teamMember = (over: Partial<Consultant>): Consultant => ({
    id: "c1",
    name: "Anna",
    level: "senior",
    yearsExperience: 10,
    summary: "s",
    rawCvText: null,
    competencies: [],
    references: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    ...over,
  });

  it("utelämnar flaggade claims för post-feature-konsult", () => {
    const out = formatContext({
      ...baseCtx,
      teamConsultants: [
        teamMember({
          competencies: [
            { competency: "Grundad kompetens", category: "domain", evidence: "citat" },
            { competency: "Fabricerad kompetens", category: "domain" },
          ],
          references: [
            { title: "Grundat uppdrag", description: "d", year: 2024, sector: "public", evidence: "citat" },
            { title: "Obelagt uppdrag", description: "d", year: 2023, sector: "public" },
          ],
        }),
      ],
    });
    expect(out).toContain("Grundad kompetens");
    expect(out).not.toContain("Fabricerad kompetens");
    expect(out).toContain("Grundat uppdrag");
    expect(out).not.toContain("Obelagt uppdrag");
  });

  it("bär allt för legacy-konsult (ingen evidens någonstans)", () => {
    const out = formatContext({
      ...baseCtx,
      teamConsultants: [
        teamMember({
          competencies: [{ competency: "Legacy-kompetens", category: "domain" }],
          references: [{ title: "Legacy-uppdrag", description: "d", year: 2024, sector: "public" }],
        }),
      ],
    });
    expect(out).toContain("Legacy-kompetens");
    expect(out).toContain("Legacy-uppdrag");
  });
});
