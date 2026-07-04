// @vitest-environment node
import { describe, it, expect } from "vitest";
import { evaluateGoNoGo, formatTeamForPrompt } from "@/lib/go-no-go-evaluator";
import { RfpAnalysis, Consultant, ScoredConsultant } from "@/lib/types";

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

const mockTeam: Consultant[] = [
  {
    id: "c1",
    name: "Anna Lindström",
    level: "senior",
    yearsExperience: 15,
    summary: "Senior managementkonsult med fokus på organisationsutveckling",
    rawCvText: null,
    competencies: [
      { competency: "Organisationsöversyner", category: "domain" },
      { competency: "Offentlig sektor", category: "domain" },
      { competency: "Förändringsledning", category: "methodology" },
    ],
    references: [
      { title: "Omorganisation Region Västra Götaland", description: "Ledde översyn", year: 2025, sector: "public" },
    ],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  },
];

const mockScored: ScoredConsultant[] = [
  { consultantId: "c1", consultantName: "Anna Lindström", level: "senior", score: 88, reasoning: "Stark matchning" },
  { consultantId: "c2", consultantName: "Erik Nilsson", level: "senior", score: 62, reasoning: "Delvis relevant" },
  { consultantId: "c3", consultantName: "Maria Svensson", level: "intermediate", score: 71, reasoning: "Bra erfarenhet" },
];

// Fas C — policy A: team-texten som matas till go/no-go får inte bära obelagda claims.
describe("formatTeamForPrompt (grundad AI-input)", () => {
  const postFeatureTeam: Consultant[] = [
    {
      id: "c1",
      name: "Anna Lindström",
      level: "senior",
      yearsExperience: 15,
      summary: "s",
      rawCvText: null,
      competencies: [
        { competency: "Grundad kompetens", category: "domain", evidence: "citat ur CV" },
        { competency: "Fabricerad kompetens", category: "domain" },
      ],
      references: [
        { title: "Grundat uppdrag", description: "d", year: 2025, sector: "public", evidence: "citat" },
        { title: "Obelagt uppdrag", description: "d", year: 2024, sector: "public" },
      ],
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    },
  ];

  it("excludes flagged claims for a post-feature team member", () => {
    const out = formatTeamForPrompt(postFeatureTeam, mockScored);
    expect(out).toContain("Grundad kompetens");
    expect(out).not.toContain("Fabricerad kompetens");
    expect(out).toContain("Grundat uppdrag");
    expect(out).not.toContain("Obelagt uppdrag");
  });

  it("includes every claim for a legacy team member (no evidence anywhere)", () => {
    const out = formatTeamForPrompt(mockTeam, mockScored);
    expect(out).toContain("Organisationsöversyner");
    expect(out).toContain("Förändringsledning");
    expect(out).toContain("Omorganisation Region Västra Götaland");
  });
});

// Live-API integration test: skips unless ANTHROPIC_API_KEY is set
// (npm test stays offline; run with `npm run test:integration`).
describe.skipIf(!process.env.ANTHROPIC_API_KEY)("evaluateGoNoGo", () => {
  it("returns a structured Go/No-Go result", async () => {
    const result = await evaluateGoNoGo(mockAnalysis, mockTeam, mockScored);

    // Must return all required fields
    expect(result).toHaveProperty("mustRequirements");
    expect(result).toHaveProperty("winProbability");
    expect(result).toHaveProperty("strengths");
    expect(result).toHaveProperty("gaps");
    expect(result).toHaveProperty("improvements");
    expect(result).toHaveProperty("recommendation");
    expect(result).toHaveProperty("reasoning");

    // winProbability should be a number 0-100
    expect(result.winProbability).toBeGreaterThanOrEqual(0);
    expect(result.winProbability).toBeLessThanOrEqual(100);

    // recommendation should be one of the valid values
    expect(["go", "no-go", "go-with-reservations"]).toContain(result.recommendation);

    // mustRequirements should have entries
    expect(result.mustRequirements.length).toBeGreaterThan(0);
  }, 120000);
});
