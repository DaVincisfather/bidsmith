import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BidContext } from "../context";
import type { RfpAnalysis } from "@/lib/types";

vi.mock("@/lib/ai-client", () => ({ callClaude: vi.fn() }));
import { callClaude } from "@/lib/ai-client";
import {
  buildRequirementMatrixBundle,
  RequirementMatrixBundleSchema,
} from "../bundles/requirement-matrix";
import { z } from "zod";

const baseAnalysis: RfpAnalysis = {
  title: "t",
  client: "c",
  deadline: null,
  summary: "s",
  requirements: [
    { category: "Kompetens", description: "5 års PL", priority: "must" },
  ],
  evaluationCriteria: [],
  requiredCompetencies: [],
  estimatedScope: "",
  redFlags: [],
  domain: "",
  oslReference: null,
  secrecyRows: [],
};
const baseCtx: BidContext = {
  analysis: baseAnalysis,
  teamConsultants: [
    {
      id: "c1",
      organizationId: "o",
      name: "Anna",
      level: "senior",
      yearsExperience: 12,
      summary: null,
      rawCvText: null,
      competencies: [],
      references: [],
      createdAt: "",
      updatedAt: "",
    },
  ],
  scoredConsultants: [],
  goNoGoResult: {
    mustRequirements: [],
    winProbability: 50,
    winProbabilityReasoning: "",
    strengths: [],
    gaps: [],
    improvements: [],
    recommendation: "go",
    reasoning: "",
  },
};

beforeEach(() => {
  vi.mocked(callClaude).mockReset();
});

describe("buildRequirementMatrixBundle", () => {
  it("returns requirement-matrix-v2 section with coverage per row", async () => {
    vi.mocked(callClaude).mockResolvedValue({
      rows: [
        {
          requirement: "5 års PL",
          hurUppfylls: "Anna har 12 års PL-erfarenhet",
          referens: "CV Anna",
          coverage: [
            { consultantName: "Anna", status: "JA", evidence: "12 år" },
          ],
        },
      ],
    });

    const { sections, overflowFlags } = await buildRequirementMatrixBundle(baseCtx, {}, { remaining: 5 });
    const [s] = sections;
    expect(s.key).toBe("requirement-matrix-v2");
    if (!s.content) throw new Error("content missing");
    if (s.content.format !== "requirement-matrix-v2") throw new Error();
    expect(s.content.rows).toHaveLength(1);
    expect(s.content.rows[0].coverage).toHaveLength(1);
    expect(s.content.rows[0].coverage[0].status).toBe("JA");
    expect(overflowFlags).toEqual([]);
  });
});

describe("RequirementMatrixBundleSchema", () => {
  const validRow = {
    requirement: "r",
    hurUppfylls: "h",
    referens: "ref",
    coverage: [
      { consultantName: "A", status: "JA" as const, evidence: "e" },
    ],
  };

  it("rejects empty rows array", () => {
    expect(() => RequirementMatrixBundleSchema.parse({ rows: [] })).toThrow(
      z.ZodError,
    );
  });

  it("rejects >6 rows", () => {
    const seven = Array.from({ length: 7 }, () => validRow);
    expect(() =>
      RequirementMatrixBundleSchema.parse({ rows: seven }),
    ).toThrow(z.ZodError);
  });

  it("rejects row with empty coverage array", () => {
    expect(() =>
      RequirementMatrixBundleSchema.parse({
        rows: [{ ...validRow, coverage: [] }],
      }),
    ).toThrow(z.ZodError);
  });

  it("rejects invalid coverage status value", () => {
    expect(() =>
      RequirementMatrixBundleSchema.parse({
        rows: [
          {
            ...validRow,
            coverage: [
              { consultantName: "A", status: "MAYBE", evidence: "e" },
            ],
          },
        ],
      }),
    ).toThrow(z.ZodError);
  });

  it("rejects empty requirement string", () => {
    expect(() =>
      RequirementMatrixBundleSchema.parse({
        rows: [{ ...validRow, requirement: "" }],
      }),
    ).toThrow(z.ZodError);
  });
});
