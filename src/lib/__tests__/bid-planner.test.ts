// @vitest-environment node
import { describe, it, expect } from "vitest";
import { BidPlanSchema, ThreeColumnResponseSchema, FORMAT_SCHEMAS } from "../ai-schemas";
import type { BidPlan } from "../bid-planner";

describe("BidPlanSchema", () => {
  it("parses a minimal valid plan", () => {
    const raw = {
      language: "sv",
      sections: [
        { kind: "cover", semanticKey: "cover" },
        { kind: "placeholder", title: "Kontakt", instruction: "Fyll i", semanticKey: "contact" },
        { kind: "placeholder", title: "Sekretess", instruction: "Boilerplate", semanticKey: "confidentiality" },
      ],
    };
    const result = BidPlanSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      const plan: BidPlan = result.data;
      expect(plan.sections[0].kind).toBe("cover");
    }
  });

  it("rejects unknown kind", () => {
    const raw = {
      language: "sv",
      sections: [{ kind: "unknown-kind", title: "X" }],
    };
    expect(BidPlanSchema.safeParse(raw).success).toBe(false);
  });

  it("rejects missing language", () => {
    const raw = { sections: [{ kind: "cover" }] };
    expect(BidPlanSchema.safeParse(raw).success).toBe(false);
  });

  it("accepts three-column with exactly three column hints", () => {
    const raw = {
      language: "sv",
      sections: [
        {
          kind: "three-column",
          title: "Perspektiv",
          columnHints: ["Nuläge", "Vad vi ser", "Vårt uppdrag"],
        },
      ],
    };
    expect(BidPlanSchema.safeParse(raw).success).toBe(true);
  });

  it("rejects three-column with wrong column count", () => {
    const raw = {
      language: "sv",
      sections: [
        { kind: "three-column", title: "Perspektiv", columnHints: ["A", "B"] },
      ],
    };
    expect(BidPlanSchema.safeParse(raw).success).toBe(false);
  });

  it("accepts optional top-level fields", () => {
    const raw = {
      language: "en",
      sections: [{ kind: "cover" }],
      unmappedRequirements: ["sustainability annex"],
      rationale: "simple structure",
    };
    expect(BidPlanSchema.safeParse(raw).success).toBe(true);
  });

  it("accepts null for optional fields (Sonnet often returns null instead of omitting)", () => {
    const raw = {
      language: "sv",
      sections: [
        { kind: "cover", semanticKey: null },
        {
          kind: "divider",
          number: 1,
          title: "Del 1",
          subtitle: "Intro",
          semanticKey: null,
        },
        {
          kind: "prose",
          title: "Bakgrund",
          promptHint: "Beskriv kontext",
          semanticKey: null,
        },
        {
          kind: "bullets",
          title: "Risker",
          promptHint: "3-5 risker",
          minItems: null,
          semanticKey: null,
        },
        {
          kind: "references",
          title: "Referenser",
          minCount: null,
          semanticKey: null,
        },
        {
          kind: "placeholder",
          title: "Pris",
          instruction: "Fyll i",
          reason: null,
          semanticKey: null,
        },
      ],
      unmappedRequirements: null,
      rationale: null,
    };
    const result = BidPlanSchema.safeParse(raw);
    expect(result.success).toBe(true);
  });
});

import { vi, beforeEach } from "vitest";
import type { BidContext } from "../bid-section-prompts";

const mockCreate = vi.hoisted(() => vi.fn());
vi.mock("@anthropic-ai/sdk", () => ({
  default: function () {
    return { messages: { create: mockCreate } };
  },
  APIError: class MockAPIError extends Error { status?: number },
}));

const minimalCtx: BidContext = {
  analysis: {
    title: "Test RFP",
    client: "Test Kund",
    deadline: null,
    summary: "Digital transformation",
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
      competencies: [{ competency: "PM", category: "methodology" }],
      references: [],
      createdAt: "",
      updatedAt: "",
    },
  ],
  scoredConsultants: [
    { consultantId: "c1", consultantName: "Anna", level: "senior", score: 90, reasoning: "Fit" },
  ],
  goNoGoResult: {
    mustRequirements: [],
    winProbability: 70,
    winProbabilityReasoning: "",
    strengths: [],
    gaps: [],
    improvements: [],
    recommendation: "go",
    reasoning: "",
  },
};

const validPlanJson = JSON.stringify({
  language: "sv",
  sections: [
    { kind: "cover", semanticKey: "cover" },
    { kind: "prose", title: "Förståelse", promptHint: "x", semanticKey: "understanding" },
    { kind: "team", title: "Team", semanticKey: "team" },
    { kind: "placeholder", title: "Kontakt", instruction: "x", semanticKey: "contact" },
    { kind: "placeholder", title: "Sekretess", instruction: "x", semanticKey: "confidentiality" },
  ],
});

describe("planBid", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("returns a parsed BidPlan on happy path", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: validPlanJson }],
    });
    const { planBid } = await import("../bid-planner");
    const plan = await planBid(minimalCtx);
    expect(plan.language).toBe("sv");
    expect(plan.sections[0].kind).toBe("cover");
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("retries once with sharpened prompt on invalid JSON", async () => {
    mockCreate
      .mockResolvedValueOnce({
        content: [{ type: "text", text: "not json at all" }],
      })
      .mockResolvedValueOnce({
        content: [{ type: "text", text: validPlanJson }],
      });
    const { planBid } = await import("../bid-planner");
    const plan = await planBid(minimalCtx);
    expect(plan.sections.length).toBeGreaterThan(0);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    // Sharpened retry: second call's system prompt mentions "invalid"
    const secondCall = mockCreate.mock.calls[1][0];
    expect(String(secondCall.system).toLowerCase()).toContain("invalid");
  });

  it("throws after retry also fails", async () => {
    mockCreate
      .mockResolvedValueOnce({ content: [{ type: "text", text: "nope" }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "still nope" }] });
    const { planBid } = await import("../bid-planner");
    await expect(planBid(minimalCtx)).rejects.toThrow();
  });
});

describe("planBidOrFallback", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("returns planner output on success", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: validPlanJson }],
    });
    const { planBidOrFallback } = await import("../bid-planner");
    const plan = await planBidOrFallback(minimalCtx);
    expect(plan.sections[0].kind).toBe("cover");
  });

  it("falls back to DEFAULT_BID_PLAN on persistent failure", async () => {
    mockCreate
      .mockResolvedValueOnce({ content: [{ type: "text", text: "bad" }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "bad" }] });
    const { planBidOrFallback, DEFAULT_BID_PLAN } = await import("../bid-planner");
    const plan = await planBidOrFallback(minimalCtx);
    expect(plan).toEqual(DEFAULT_BID_PLAN);
  });
});

import { DEFAULT_BID_PLAN } from "../bid-planner";

describe("DEFAULT_BID_PLAN", () => {
  it("is a valid BidPlan", () => {
    expect(BidPlanSchema.safeParse(DEFAULT_BID_PLAN).success).toBe(true);
  });

  it("contains all required semanticKeys", () => {
    const keys = DEFAULT_BID_PLAN.sections
      .map((s) => s.semanticKey)
      .filter((k): k is string => !!k);
    expect(keys).toContain("cover");
    expect(keys).toContain("quality");
    expect(keys).toContain("team");
    expect(keys).toContain("requirement-matrix");
    expect(keys).toContain("references");
    expect(keys).toContain("contact");
    expect(keys).toContain("confidentiality");
  });

  it("puts cover first, confidentiality last", () => {
    const first = DEFAULT_BID_PLAN.sections[0];
    const last = DEFAULT_BID_PLAN.sections[DEFAULT_BID_PLAN.sections.length - 1];
    expect(first.kind).toBe("cover");
    expect(last.semanticKey).toBe("confidentiality");
  });

  it("puts contact second-to-last", () => {
    const secondToLast =
      DEFAULT_BID_PLAN.sections[DEFAULT_BID_PLAN.sections.length - 2];
    expect(secondToLast.semanticKey).toBe("contact");
  });
});

describe("ThreeColumnResponseSchema", () => {
  it("parses a valid three-column response", () => {
    const raw = {
      columns: [
        { title: "Nuläge", icon: "N", body: "Text A" },
        { title: "Vad vi ser", icon: "V", body: "Text B" },
        { title: "Vårt uppdrag", icon: "U", body: "Text C" },
      ],
    };
    expect(ThreeColumnResponseSchema.safeParse(raw).success).toBe(true);
  });

  it("rejects fewer than 3 columns", () => {
    const raw = { columns: [{ title: "A", icon: "A", body: "x" }] };
    expect(ThreeColumnResponseSchema.safeParse(raw).success).toBe(false);
  });

  it("rejects more than 3 columns", () => {
    const raw = {
      columns: [
        { title: "A", icon: "A", body: "x" },
        { title: "B", icon: "B", body: "y" },
        { title: "C", icon: "C", body: "z" },
        { title: "D", icon: "D", body: "w" },
      ],
    };
    expect(ThreeColumnResponseSchema.safeParse(raw).success).toBe(false);
  });
});

describe("FORMAT_SCHEMAS", () => {
  it("maps every AI-generating kind to a schema", () => {
    expect(FORMAT_SCHEMAS.prose).toBeDefined();
    expect(FORMAT_SCHEMAS.bullets).toBeDefined();
    expect(FORMAT_SCHEMAS["three-column"]).toBeDefined();
    expect(FORMAT_SCHEMAS.phases).toBeDefined();
    expect(FORMAT_SCHEMAS.team).toBeDefined();
    expect(FORMAT_SCHEMAS.references).toBeDefined();
  });
});

describe("generateAllSections (planner-driven)", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("returns sections in plan order and includes plan in result", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            language: "sv",
            sections: [
              { kind: "cover", semanticKey: "cover" },
              { kind: "prose", title: "Förståelse", promptHint: "x", semanticKey: "understanding" },
              { kind: "prose", title: "Kvalitet", promptHint: "x", semanticKey: "quality" },
              { kind: "team", title: "Team", semanticKey: "team" },
              { kind: "requirement-matrix", title: "Krav", semanticKey: "requirement-matrix" },
              { kind: "references", title: "Ref", semanticKey: "references" },
              { kind: "placeholder", title: "Kontakt", instruction: "i", semanticKey: "contact" },
              { kind: "placeholder", title: "Sekretess", instruction: "i", semanticKey: "confidentiality" },
            ],
          }),
        },
      ],
    });
    mockCreate.mockImplementation(({ system }: { system: string }) => {
      if (system.includes("prose-sektion")) {
        return Promise.resolve({
          content: [{ type: "text", text: '{ "text": "Prose text" }' }],
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
      return Promise.resolve({
        content: [{ type: "text", text: '{ "text": "fallback" }' }],
      });
    });

    const { generateAllSections } = await import("../bid-generator");
    const { sections, plan } = await generateAllSections(minimalCtx);

    expect(plan).toBeDefined();
    expect(plan.sections[0].kind).toBe("cover");

    expect(sections[0].content.format).toBe("cover");
    const last = sections[sections.length - 1];
    expect(last.content.format).toBe("placeholder");
    expect(last.title.toLowerCase()).toMatch(/sekretess|confidentiality|s/i);
  });

  it("streams progress via onSectionComplete", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            language: "sv",
            sections: [
              { kind: "cover", semanticKey: "cover" },
              { kind: "placeholder", title: "Kontakt", instruction: "i", semanticKey: "contact" },
              { kind: "placeholder", title: "S", instruction: "i", semanticKey: "confidentiality" },
            ],
          }),
        },
      ],
    });

    const { generateAllSections } = await import("../bid-generator");
    const progress: string[] = [];
    await generateAllSections(minimalCtx, (s) => {
      progress.push(s.title);
    });
    expect(progress.length).toBeGreaterThan(0);
  });

  it("replaces failed section with placeholder (graceful degradation)", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            language: "sv",
            sections: [
              { kind: "cover", semanticKey: "cover" },
              { kind: "prose", title: "Förståelse", promptHint: "x", semanticKey: "understanding" },
              { kind: "placeholder", title: "Kontakt", instruction: "i", semanticKey: "contact" },
              { kind: "placeholder", title: "S", instruction: "i", semanticKey: "confidentiality" },
            ],
          }),
        },
      ],
    });
    mockCreate.mockImplementation(() =>
      Promise.resolve({ content: [{ type: "text", text: "not json" }] })
    );

    const { generateAllSections } = await import("../bid-generator");
    const { sections } = await generateAllSections(minimalCtx);
    const understanding = sections.find((s) => s.title === "Förståelse");
    expect(understanding).toBeDefined();
    expect(understanding?.content.format).toBe("placeholder");
  });
});

import type { PlannedSection } from "../bid-planner";

describe("buildSection dispatcher", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("builds a cover BidSection deterministically (no AI call)", async () => {
    const { buildSection } = await import("../bid-generator");
    const planned: PlannedSection = { kind: "cover", semanticKey: "cover" };
    const section = await buildSection(planned, minimalCtx);
    expect(section.type).toBe("data");
    expect(section.content.format).toBe("cover");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("builds a divider BidSection from planned fields", async () => {
    const { buildSection } = await import("../bid-generator");
    const planned: PlannedSection = {
      kind: "divider",
      number: 2,
      title: "Genomförande",
      subtitle: "Metod och tidplan",
    };
    const section = await buildSection(planned, minimalCtx);
    expect(section.type).toBe("data");
    expect(section.content.format).toBe("section-divider");
    if (section.content.format === "section-divider") {
      expect(section.content.sectionNumber).toBe(2);
      expect(section.content.subtitle).toBe("Metod och tidplan");
    }
    expect(section.title).toBe("Genomförande");
  });

  it("builds a placeholder BidSection from planned fields", async () => {
    const { buildSection } = await import("../bid-generator");
    const planned: PlannedSection = {
      kind: "placeholder",
      title: "Pris",
      instruction: "Fyll i",
      semanticKey: "pricing",
    };
    const section = await buildSection(planned, minimalCtx);
    expect(section.type).toBe("placeholder");
    expect(section.content.format).toBe("placeholder");
  });

  it("builds a requirement-matrix deterministically", async () => {
    const { buildSection } = await import("../bid-generator");
    const planned: PlannedSection = {
      kind: "requirement-matrix",
      title: "Krav",
      semanticKey: "requirement-matrix",
    };
    const section = await buildSection(planned, minimalCtx);
    expect(section.content.format).toBe("requirement-matrix");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("builds a prose section via AI call", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: '{ "text": "Prose content" }' }],
    });
    const { buildSection } = await import("../bid-generator");
    const planned: PlannedSection = {
      kind: "prose",
      title: "Förståelse",
      promptHint: "Visa förståelse",
      semanticKey: "understanding",
    };
    const section = await buildSection(planned, minimalCtx);
    expect(section.type).toBe("ai");
    expect(section.content.format).toBe("prose");
    if (section.content.format === "prose") {
      expect(section.content.text).toBe("Prose content");
    }
  });

  it("builds a three-column section via AI call", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            columns: [
              { title: "A", icon: "A", body: "text a" },
              { title: "B", icon: "B", body: "text b" },
              { title: "C", icon: "C", body: "text c" },
            ],
          }),
        },
      ],
    });
    const { buildSection } = await import("../bid-generator");
    const planned: PlannedSection = {
      kind: "three-column",
      title: "Perspektiv",
      columnHints: ["Nuläge", "Vad vi ser", "Vårt uppdrag"],
    };
    const section = await buildSection(planned, minimalCtx);
    expect(section.content.format).toBe("three-column");
    if (section.content.format === "three-column") {
      expect(section.content.columns).toHaveLength(3);
    }
  });

  it("throws on unknown kind (exhaustiveness check)", async () => {
    const { buildSection } = await import("../bid-generator");
    const planned = { kind: "bogus", title: "X" } as unknown as PlannedSection;
    await expect(buildSection(planned, minimalCtx)).rejects.toThrow(/Unhandled kind/);
  });
});
