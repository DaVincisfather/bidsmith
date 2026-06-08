// @vitest-environment node
import { describe, it, expect } from "vitest";
import { matchConsultants } from "@/lib/consultant-matcher";
import { RfpAnalysis, Consultant, ScoredMatchResult } from "@/lib/types";

const mockAnalysis: RfpAnalysis = {
  title: "Organisationsöversyn",
  client: "Göteborgs stad",
  deadline: "2026-05-01",
  summary: "Översyn av organisationsstruktur inom stadsförvaltningen",
  requirements: [
    { category: "Kompetens", description: "Erfarenhet av organisationsöversyner", priority: "must" },
    { category: "Kompetens", description: "Erfarenhet av offentlig sektor", priority: "must" },
    { category: "Kompetens", description: "Förändringsledning", priority: "should" },
  ],
  evaluationCriteria: [
    { name: "Kompetens", weight: 50, description: "Relevant erfarenhet" },
    { name: "Genomförande", weight: 30, description: "Metodik och plan" },
    { name: "Pris", weight: 20, description: "Timpris" },
  ],
  requiredCompetencies: ["Organisationsöversyner", "Offentlig sektor", "Förändringsledning"],
  estimatedScope: "2 konsulter, 3 månader",
  redFlags: [],
  domain: "management",
  oslReference: null,
  secrecyRows: [],
};

const mockConsultants: Consultant[] = [
  {
    id: "c1",
    name: "Anna Lindström",
    level: "senior",
    yearsExperience: 12,
    summary: "Senior konsult med fokus på organisationsöversyner i offentlig sektor",
    rawCvText: null,
    competencies: [
      { competency: "Organisationsöversyner", category: "domain" },
      { competency: "Ekonomistyrning", category: "domain" },
      { competency: "Förändringsledning", category: "methodology" },
    ],
    references: [
      { title: "Organisationsöversyn Region Mellansverige", description: "Ledde genomlysning", year: 2024, sector: "public" },
    ],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  },
  {
    id: "c2",
    name: "Erik Johansson",
    level: "intermediate",
    yearsExperience: 5,
    summary: "Konsult med erfarenhet av ekonomistyrning och dataanalys",
    rawCvText: null,
    competencies: [
      { competency: "Dataanalys", category: "technical" },
      { competency: "Ekonomistyrning", category: "domain" },
    ],
    references: [
      { title: "Ekonomianalys Borås kommun", description: "Stödde ekonomistyrning", year: 2025, sector: "public" },
    ],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  },
];

// Live-API integration test: skips unless ANTHROPIC_API_KEY is set
// (npm test stays offline; run with `npm run test:integration`).
describe.skipIf(!process.env.ANTHROPIC_API_KEY)("matchConsultants", () => {
  it("scores all consultants individually against the RFP", async () => {
    const result: ScoredMatchResult = await matchConsultants(mockAnalysis, mockConsultants);

    // Returns scored list for all consultants
    expect(result.scoredConsultants).toBeDefined();
    expect(result.scoredConsultants.length).toBe(2);

    // Each consultant has score + reasoning
    for (const sc of result.scoredConsultants) {
      expect(sc.consultantId).toBeTruthy();
      expect(sc.consultantName).toBeTruthy();
      expect(["junior", "intermediate", "senior", "expert"]).toContain(sc.level);
      expect(sc.score).toBeGreaterThanOrEqual(0);
      expect(sc.score).toBeLessThanOrEqual(100);
      expect(sc.reasoning).toBeTruthy();
    }

    // Anna (senior, strong match) should score higher than Erik (intermediate, partial match)
    const anna = result.scoredConsultants.find((c) => c.consultantId === "c1");
    const erik = result.scoredConsultants.find((c) => c.consultantId === "c2");
    expect(anna).toBeDefined();
    expect(erik).toBeDefined();
    expect(anna!.score).toBeGreaterThan(erik!.score);
  }, 120000);
});
