import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BidContext } from "../context";
import type { RfpAnalysis } from "@/lib/types";

vi.mock("@/lib/ai-client", () => ({ callClaude: vi.fn() }));
import { callClaude } from "@/lib/ai-client";
import { buildReferenceBundle, ReferenceBundleSchema } from "../bundles/reference";
import { z } from "zod";

const baseAnalysis: RfpAnalysis = {
  title: "t",
  client: "c",
  deadline: null,
  summary: "s",
  requirements: [],
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

const makeRef = (overrides?: Partial<{
  clientName: string;
  contextLine: string;
  organisation: string;
  startDate: string;
  endDate: string;
  scope: string;
  contact: { name: string; titlePhoneEmail: string };
  roleAndDelivery: string;
  result: string;
}>) => ({
  clientName: "Göteborgs Stad",
  contextLine: "Strategisk rådgivning inom digitaliseringsinitiativ.",
  organisation: "Stadskansliet",
  startDate: "01/2023",
  endDate: "12/2023",
  scope: "Kartläggning och roadmap för digital transformation — 2 faser.",
  contact: {
    name: "Åsa Lindström",
    titlePhoneEmail: "Förvaltningschef · 031-123456 · asa@goteborg.se",
  },
  roleAndDelivery: "Vi ledde projektet och levererade strategi samt utbildning.",
  result: "Roadmap antagen av kommunstyrelsen.",
  ...overrides,
});

beforeEach(() => {
  vi.mocked(callClaude).mockReset();
});

describe("buildReferenceBundle", () => {
  it("happy path: returns reference-v2 section with 3 references", async () => {
    const mockRefs = [makeRef(), makeRef(), makeRef()];
    vi.mocked(callClaude).mockResolvedValue({ references: mockRefs });

    const [s] = await buildReferenceBundle(baseCtx);
    expect(s.key).toBe("reference-v2");
    if (!s.content) throw new Error("content missing");
    if (s.content.format !== "reference-v2") throw new Error("wrong format");
    expect(s.content.format).toBe("reference-v2");
    expect(s.content.references[0].clientName).toBe("Göteborgs Stad");
    expect(s.content.references.length).toBe(3);
  });

  it("content assembly: references pass through unchanged", async () => {
    const mockRefs = [makeRef(), makeRef(), makeRef()];
    vi.mocked(callClaude).mockResolvedValue({ references: mockRefs });

    const [s] = await buildReferenceBundle(baseCtx);
    if (!s.content) throw new Error("content missing");
    if (s.content.format !== "reference-v2") throw new Error("wrong format");
    expect(s.content.references).toEqual(mockRefs);
  });
});

describe("ReferenceBundleSchema", () => {
  const validRef = makeRef();

  it("accepts a single reference (relaxed from min 3 to min 1 to avoid forcing fabrication when CV data is sparse)", () => {
    expect(() =>
      ReferenceBundleSchema.parse({ references: [validRef] }),
    ).not.toThrow();
  });

  it("rejects empty references array", () => {
    expect(() =>
      ReferenceBundleSchema.parse({ references: [] }),
    ).toThrow(z.ZodError);
  });

  it("rejects more than 5 references (array of 6)", () => {
    const six = Array.from({ length: 6 }, () => validRef);
    expect(() =>
      ReferenceBundleSchema.parse({ references: six }),
    ).toThrow(z.ZodError);
  });

  it("rejects empty clientName", () => {
    expect(() =>
      ReferenceBundleSchema.parse({
        references: [makeRef({ clientName: "" }), validRef, validRef],
      }),
    ).toThrow(z.ZodError);
  });

  it("rejects empty contact.name", () => {
    expect(() =>
      ReferenceBundleSchema.parse({
        references: [
          makeRef({ contact: { name: "", titlePhoneEmail: "Titel · tel · e-post" } }),
          validRef,
          validRef,
        ],
      }),
    ).toThrow(z.ZodError);
  });

  it("accepts exactly 3 references (boundary sanity)", () => {
    expect(() =>
      ReferenceBundleSchema.parse({ references: [validRef, validRef, validRef] }),
    ).not.toThrow();
  });

  it("accepts exactly 5 references (boundary sanity)", () => {
    const five = Array.from({ length: 5 }, () => validRef);
    expect(() =>
      ReferenceBundleSchema.parse({ references: five }),
    ).not.toThrow();
  });

  it("silently strips LLM-emitted extras on reference (must not throw)", () => {
    const parsed = ReferenceBundleSchema.parse({
      references: [
        { ...validRef, projectId: "p1", sector: "public" },
        validRef,
        validRef,
      ],
    });
    expect(parsed.references[0]).toEqual(validRef);
    expect(parsed.references[0]).not.toHaveProperty("projectId");
    expect(parsed.references[0]).not.toHaveProperty("sector");
  });
});
