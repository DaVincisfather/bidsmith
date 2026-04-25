import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BidContext } from "../context";
import type { RfpAnalysis } from "@/lib/types";

vi.mock("@/lib/ai-client", () => ({ callClaude: vi.fn() }));
import { callClaude } from "@/lib/ai-client";
import { buildTeamBundle, TeamBundleSchema } from "../bundles/team";
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

beforeEach(() => {
  vi.mocked(callClaude).mockReset();
});

describe("buildTeamBundle", () => {
  it("forces timpris and total to null on every member", async () => {
    vi.mocked(callClaude).mockResolvedValue({
      members: [
        {
          name: "Anna",
          role: "Projektledare",
          omfattningPct: 50,
          timmar: 240,
        },
      ],
    });

    const [s] = await buildTeamBundle(baseCtx);
    expect(s.key).toBe("team-pricing");
    if (!s.content) throw new Error("content missing");
    if (s.content.format !== "team-pricing") throw new Error();
    expect(s.content.members[0].timpris).toBeNull();
    expect(s.content.members[0].total).toBeNull();
    expect(s.content.members[0].timmar).toBe(240);
    expect(s.content.summary?.totalPris).toBeNull();
  });

  it("computes summary.totalTimmar as sum across members", async () => {
    vi.mocked(callClaude).mockResolvedValue({
      members: [
        { name: "Anna", role: "PL", omfattningPct: 50, timmar: 240 },
        { name: "Bo", role: "Arch", omfattningPct: 100, timmar: 480 },
      ],
    });
    const [s] = await buildTeamBundle(baseCtx);
    if (!s.content) throw new Error("content missing");
    if (s.content.format !== "team-pricing") throw new Error();
    expect(s.content.summary?.totalTimmar).toBe(720);
  });
});

describe("TeamBundleSchema", () => {
  const validMember = { name: "A", role: "R", omfattningPct: 50, timmar: 100 };

  it("rejects empty members array", () => {
    expect(() => TeamBundleSchema.parse({ members: [] })).toThrow(z.ZodError);
  });

  it("rejects >5 members", () => {
    const six = Array.from({ length: 6 }, () => validMember);
    expect(() => TeamBundleSchema.parse({ members: six })).toThrow(z.ZodError);
  });

  it("rejects empty name", () => {
    expect(() =>
      TeamBundleSchema.parse({ members: [{ ...validMember, name: "" }] }),
    ).toThrow(z.ZodError);
  });

  it("rejects omfattningPct above 100", () => {
    expect(() =>
      TeamBundleSchema.parse({
        members: [{ ...validMember, omfattningPct: 150 }],
      }),
    ).toThrow(z.ZodError);
  });

  it("rejects omfattningPct at zero", () => {
    expect(() =>
      TeamBundleSchema.parse({
        members: [{ ...validMember, omfattningPct: 0 }],
      }),
    ).toThrow(z.ZodError);
  });

  it("rejects non-integer timmar", () => {
    expect(() =>
      TeamBundleSchema.parse({ members: [{ ...validMember, timmar: 1.5 }] }),
    ).toThrow(z.ZodError);
  });

  it("rejects timmar at zero", () => {
    expect(() =>
      TeamBundleSchema.parse({ members: [{ ...validMember, timmar: 0 }] }),
    ).toThrow(z.ZodError);
  });

  it("silently strips LLM-emitted timpris/total (must not throw)", () => {
    const parsed = TeamBundleSchema.parse({
      members: [{ ...validMember, timpris: 1500, total: 360000 }],
    });
    expect(parsed.members[0]).toEqual(validMember);
    expect(parsed.members[0]).not.toHaveProperty("timpris");
    expect(parsed.members[0]).not.toHaveProperty("total");
  });
});
