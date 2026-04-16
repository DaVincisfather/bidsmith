// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BidContext } from "../bid-section-prompts";

const mockCreate = vi.hoisted(() => vi.fn());

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: function () {
      return { messages: { create: mockCreate } };
    },
    APIError: class MockAPIError extends Error { status?: number },
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

const PLANNER_RESPONSE = JSON.stringify({
  language: "sv",
  sections: [
    { kind: "cover", semanticKey: "cover" },
    { kind: "toc", title: "Innehåll" },
    { kind: "prose", title: "Uppdragsförståelse", promptHint: "Visa förståelse", semanticKey: "understanding" },
    { kind: "bullets", title: "Identifierat värde", promptHint: "4-6 värdepunkter", semanticKey: "value-proposition" },
    { kind: "phases", title: "Genomförandeplan", promptHint: "3-5 faser", semanticKey: "execution-plan" },
    { kind: "gantt", title: "Tidplan" },
    { kind: "prose", title: "Kvalitet", promptHint: "Kvalitet", semanticKey: "quality" },
    { kind: "team", title: "Team", semanticKey: "team" },
    { kind: "requirement-matrix", title: "Krav", semanticKey: "requirement-matrix" },
    { kind: "references", title: "Referenser", semanticKey: "references" },
    { kind: "placeholder", title: "Pris", instruction: "Fyll i", semanticKey: "pricing" },
    { kind: "placeholder", title: "Kontakt", instruction: "Fyll i", semanticKey: "contact" },
    { kind: "placeholder", title: "Sekretess", instruction: "Fyll i", semanticKey: "confidentiality" },
  ],
});

describe("generateAllSections (integration, planner-driven)", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    let callCount = 0;
    mockCreate.mockImplementation(({ system }: { system: string }) => {
      callCount++;
      // First call is the planner
      if (callCount === 1) {
        return Promise.resolve({
          content: [{ type: "text", text: PLANNER_RESPONSE }],
        });
      }
      // Subsequent calls are content — match by format keyword in system prompt
      if (system.includes("prose-sektion")) {
        return Promise.resolve({
          content: [{ type: "text", text: '{ "text": "Prose content" }' }],
        });
      }
      if (system.includes("bullets-sektion")) {
        return Promise.resolve({
          content: [{ type: "text", text: '{ "items": ["Point 1", "Point 2"] }' }],
        });
      }
      if (system.includes("phases-sektion")) {
        return Promise.resolve({
          content: [
            {
              type: "text",
              text: '{ "phases": [{ "name": "Fas 1", "objective": "Goal", "activities": ["A"], "deliverables": ["D"], "duration": "2w" }] }',
            },
          ],
        });
      }
      if (system.includes("team-sektion")) {
        return Promise.resolve({
          content: [
            {
              type: "text",
              text: '{ "members": [{ "consultantId": "c1", "name": "Anna", "role": "Lead", "relevantExperience": "10y", "keyCompetencies": ["PM"] }] }',
            },
          ],
        });
      }
      if (system.includes("references-sektion")) {
        return Promise.resolve({
          content: [
            {
              type: "text",
              text: '{ "references": [{ "title": "R1", "client": "C", "year": 2024, "description": "d", "relevance": "r" }] }',
            },
          ],
        });
      }
      if (system.includes("three-column-sektion")) {
        return Promise.resolve({
          content: [
            {
              type: "text",
              text: '{ "columns": [{"title":"A","icon":"A","body":"x"},{"title":"B","icon":"B","body":"y"},{"title":"C","icon":"C","body":"z"}] }',
            },
          ],
        });
      }
      return Promise.resolve({
        content: [{ type: "text", text: '{ "text": "fallback" }' }],
      });
    });
  });

  it("returns all sections in plan order with required ones present", async () => {
    const { generateAllSections } = await import("../bid-generator");
    const { sections, plan } = await generateAllSections(mockContext);

    expect(plan).toBeDefined();
    const formats = sections.map((s) => s.content.format);
    expect(formats[0]).toBe("cover");
    expect(sections.find((s) => s.title === "Uppdragsförståelse")).toBeDefined();
    expect(sections.find((s) => s.title === "Team")).toBeDefined();
    expect(sections.find((s) => s.title === "Krav")).toBeDefined();
    expect(sections.find((s) => s.title === "Referenser")).toBeDefined();
    expect(sections.find((s) => s.title === "Kontakt")).toBeDefined();
    expect(sections.find((s) => s.title === "Sekretess")).toBeDefined();

    // Confidentiality is last
    expect(sections[sections.length - 1].title).toBe("Sekretess");
  });

  it("calls onSectionComplete callback for each generated section", async () => {
    const { generateAllSections } = await import("../bid-generator");
    const completed: string[] = [];
    await generateAllSections(mockContext, (section) => {
      completed.push(section.title);
    });

    expect(completed.length).toBeGreaterThan(0);
    // Every reported section should appear in final output
    expect(completed).toContain("Team");
    expect(completed).toContain("Krav");
  });
});
