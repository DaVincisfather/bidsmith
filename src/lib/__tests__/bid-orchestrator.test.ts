import { describe, it, expect, vi, beforeEach } from "vitest";
import { BidContext } from "../bid-section-prompts";

const mockCreate = vi.hoisted(() => vi.fn());

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: function() {
      return { messages: { create: mockCreate } };
    },
  };
});

const mockContext: BidContext = {
  analysis: {
    title: "Test RFP",
    client: "Test Client",
    deadline: null,
    summary: "Test",
    requirements: [
      { category: "Kompetens", description: "Projektledning", priority: "must" },
    ],
    evaluationCriteria: [],
    requiredCompetencies: [],
    estimatedScope: "3 months",
    redFlags: [],
    domain: "IT",
  },
  teamConsultants: [
    {
      id: "c1",
      organizationId: "org1",
      name: "Anna",
      level: "senior",
      yearsExperience: 10,
      summary: "Lead",
      rawCvText: null,
      competencies: [{ competency: "projektledning", category: "methodology" }],
      references: [],
      createdAt: "",
      updatedAt: "",
    },
  ],
  scoredConsultants: [
    { consultantId: "c1", consultantName: "Anna", level: "senior", score: 90, reasoning: "Great" },
  ],
  goNoGoResult: {
    mustRequirements: [{ requirement: "Projektledning", met: true, coveredBy: "Anna" }],
    winProbability: 80,
    winProbabilityReasoning: "Strong",
    strengths: ["Experienced team"],
    gaps: [],
    improvements: [],
    recommendation: "go",
    reasoning: "Go ahead",
  },
};

describe("generateAllSections", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    // Return appropriate JSON based on which system prompt is used
    mockCreate.mockImplementation(({ system }: { system: string }) => {
      if (system.includes("Uppdragsförståelse")) {
        return Promise.resolve({ content: [{ type: "text", text: '{ "text": "Understanding text" }' }] });
      }
      if (system.includes("Identifierat värde")) {
        return Promise.resolve({ content: [{ type: "text", text: '{ "items": ["Value 1"] }' }] });
      }
      if (system.includes("Genomförandeplan")) {
        return Promise.resolve({ content: [{ type: "text", text: '{ "phases": [{ "name": "Fas 1", "objective": "Goal", "activities": ["A1"], "deliverables": ["D1"], "duration": "2w" }] }' }] });
      }
      if (system.includes("Kvalitetssäkring")) {
        return Promise.resolve({ content: [{ type: "text", text: '{ "text": "Quality text" }' }] });
      }
      if (system.includes("Risker och hantering")) {
        return Promise.resolve({ content: [{ type: "text", text: '{ "items": ["Risk 1"] }' }] });
      }
      if (system.includes("Teamet")) {
        return Promise.resolve({ content: [{ type: "text", text: '{ "members": [{ "consultantId": "c1", "name": "Anna", "role": "Lead", "relevantExperience": "10 yrs", "keyCompetencies": ["PM"] }] }' }] });
      }
      if (system.includes("Referensuppdrag")) {
        return Promise.resolve({ content: [{ type: "text", text: '{ "references": [{ "title": "Ref1", "client": "Client", "year": 2024, "description": "Desc", "relevance": "Relevant" }] }' }] });
      }
      if (system.includes("Sammanfattning")) {
        return Promise.resolve({ content: [{ type: "text", text: '{ "text": "Summary text" }' }] });
      }
      return Promise.resolve({ content: [{ type: "text", text: '{ "text": "fallback" }' }] });
    });
  });

  it("returns all section types in correct order", async () => {
    const { generateAllSections } = await import("../bid-generator");
    const { sections } = await generateAllSections(mockContext);

    const keys = sections.map((s) => s.key);
    expect(keys[0]).toBe("cover");
    expect(keys[1]).toBe("toc");
    expect(keys).toContain("understanding");
    expect(keys).toContain("execution-plan");
    expect(keys).toContain("team");
    expect(keys).toContain("requirement-matrix");
    expect(keys).toContain("pricing");
    expect(keys).toContain("confidentiality");
    expect(keys).toContain("contact");
  });

  it("calls onSectionComplete callback for progress tracking", async () => {
    const { generateAllSections } = await import("../bid-generator");
    const completed: string[] = [];
    await generateAllSections(mockContext, (section) => {
      completed.push(section.key);
    });

    expect(completed.length).toBeGreaterThan(0);
    expect(completed[0]).toBe("cover");
  });
});
