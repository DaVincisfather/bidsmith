import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateAiSection } from "../bid-generator";
import { BidContext } from "../bid-section-prompts";

// Hoist mockCreate so it can be referenced both in vi.mock factory and in tests
const mockCreate = vi.hoisted(() => vi.fn());

// Mock Anthropic SDK — lazy init pattern in getClient() calls new Anthropic().
// Must use a regular function (not arrow) so it works as a constructor.
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(function () {
    return { messages: { create: mockCreate } };
  }),
}));

const mockContext: BidContext = {
  analysis: {
    title: "Test RFP",
    client: "Test Client",
    deadline: null,
    summary: "Test summary",
    requirements: [],
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
      name: "Anna Svensson",
      level: "senior",
      yearsExperience: 10,
      summary: "Senior consultant",
      rawCvText: null,
      competencies: [],
      references: [],
      createdAt: "",
      updatedAt: "",
    },
  ],
  scoredConsultants: [
    {
      consultantId: "c1",
      consultantName: "Anna Svensson",
      level: "senior",
      score: 85,
      reasoning: "Strong match",
    },
  ],
  goNoGoResult: {
    mustRequirements: [],
    winProbability: 75,
    winProbabilityReasoning: "Good fit",
    strengths: ["Strong team"],
    gaps: [],
    improvements: [],
    recommendation: "go",
    reasoning: "Recommended",
  },
};

describe("generateAiSection", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("generates an understanding section with prose format", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: '{ "text": "Vi förstår att ni söker en partner som kan..." }',
        },
      ],
    });

    const section = await generateAiSection("understanding", mockContext);
    expect(section.type).toBe("ai");
    expect(section.key).toBe("understanding");
    expect(section.title).toBe("Uppdragsförståelse");
    expect(section.content.format).toBe("prose");
    if (section.content.format === "prose") {
      expect(section.content.text).toContain("Vi förstår");
    }

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-opus-4-6",
      })
    );
  });

  it("generates an execution-plan section with phases format", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            phases: [
              {
                name: "Fas 1: Nulägesanalys",
                objective: "Kartlägg nuläget",
                activities: ["Intervjuer"],
                deliverables: ["Nulägesrapport"],
                duration: "2 veckor",
              },
            ],
          }),
        },
      ],
    });

    const section = await generateAiSection("execution-plan", mockContext);
    expect(section.content.format).toBe("phases");
    if (section.content.format === "phases") {
      expect(section.content.phases).toHaveLength(1);
      expect(section.content.phases[0].name).toBe("Fas 1: Nulägesanalys");
    }
  });

  it("throws for unknown section key", async () => {
    await expect(generateAiSection("nonexistent", mockContext)).rejects.toThrow(
      "Unknown AI section key: nonexistent"
    );
  });
});
