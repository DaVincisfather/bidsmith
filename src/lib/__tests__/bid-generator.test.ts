import { describe, it, expect } from "vitest";
import { buildCoverSection, buildRequirementMatrix } from "../bid-generator";
import { RfpAnalysis, Consultant } from "../types";

const mockAnalysis: RfpAnalysis = {
  title: "IT-konsulttjänster för Region Västra Götaland",
  client: "Region Västra Götaland",
  deadline: "2026-05-01",
  summary: "Upphandling av IT-konsulttjänster",
  requirements: [
    { category: "Kompetens", description: "Minst 5 års erfarenhet av projektledning", priority: "must" },
    { category: "Kompetens", description: "Erfarenhet av offentlig sektor", priority: "should" },
    { category: "Certifiering", description: "PMP eller motsvarande", priority: "nice-to-have" },
  ],
  evaluationCriteria: [{ name: "Kompetens", weight: 60, description: "Teamets samlade kompetens" }],
  requiredCompetencies: ["projektledning", "agil metodik"],
  estimatedScope: "3 konsulter, 6 månader",
  redFlags: [],
  domain: "IT",
};

const mockTeam: Consultant[] = [
  {
    id: "c1",
    organizationId: "org1",
    name: "Anna Svensson",
    level: "senior",
    yearsExperience: 12,
    summary: "Senior projektledare",
    rawCvText: null,
    competencies: [
      { competency: "projektledning", category: "methodology" },
      { competency: "agil metodik", category: "methodology" },
    ],
    references: [
      { title: "Digitalisering VGR", description: "Led digital transformation", year: 2024, sector: "public" },
    ],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  },
  {
    id: "c2",
    organizationId: "org1",
    name: "Erik Johansson",
    level: "intermediate",
    yearsExperience: 6,
    summary: "IT-konsult",
    rawCvText: null,
    competencies: [
      { competency: "systemutveckling", category: "technical" },
    ],
    references: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  },
];

describe("buildCoverSection", () => {
  it("creates a cover section from analysis data", () => {
    const section = buildCoverSection(mockAnalysis);
    expect(section.type).toBe("data");
    expect(section.key).toBe("cover");
    expect(section.content.format).toBe("cover");
    if (section.content.format === "cover") {
      expect(section.content.title).toBe("IT-konsulttjänster för Region Västra Götaland");
      expect(section.content.client).toBe("Region Västra Götaland");
      expect(section.content.date).toBeTruthy();
    }
  });
});

describe("buildRequirementMatrix", () => {
  it("creates a matrix with consultants vs requirements", () => {
    const section = buildRequirementMatrix(mockAnalysis, mockTeam);
    expect(section.type).toBe("data");
    expect(section.key).toBe("requirement-matrix");
    if (section.content.format === "requirement-matrix") {
      expect(section.content.rows.length).toBe(3);
      expect(section.content.rows[0].requirement).toBe("Minst 5 års erfarenhet av projektledning");
      expect(Object.keys(section.content.rows[0].coverage)).toContain("c1");
      expect(Object.keys(section.content.rows[0].coverage)).toContain("c2");
    }
  });
});

