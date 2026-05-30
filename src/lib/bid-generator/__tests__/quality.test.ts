import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BidContext } from "../context";
import type { RfpAnalysis } from "@/lib/types";

vi.mock("@/lib/ai-client", () => ({ callClaude: vi.fn() }));
import { callClaude } from "@/lib/ai-client";
import { buildQualityBundle, QualityBundleSchema } from "../bundles/quality";
import { z } from "zod";

const baseAnalysis: RfpAnalysis = {
  title: "t", client: "c", deadline: null, summary: "s",
  requirements: [], evaluationCriteria: [], requiredCompetencies: [],
  estimatedScope: "", redFlags: [], domain: "",
  oslReference: null, secrecyRows: [],
};
const baseCtx: BidContext = {
  analysis: baseAnalysis,
  teamConsultants: [{
    id: "c1", name: "Anna", level: "senior",
    yearsExperience: 10, summary: null, rawCvText: null,
    competencies: [], references: [], createdAt: "", updatedAt: "",
  }],
  scoredConsultants: [],
  goNoGoResult: {
    mustRequirements: [], winProbability: 50, winProbabilityReasoning: "",
    strengths: [], gaps: [], improvements: [], recommendation: "go", reasoning: "",
  },
};

beforeEach(() => { vi.mocked(callClaude).mockReset(); });

describe("buildQualityBundle", () => {
  it("produces quality-assurance section with process, lead, escalation, checkpoints", async () => {
    vi.mocked(callClaude).mockResolvedValue({
      qaProcess: ["P1", "P2"],
      qualityLead: { name: "Anna", roleAndMandate: "Quality Lead", contact: "anna@x.se" },
      escalation: { process: "Veckovis", reporting: "Månadsrapport" },
      checkpoints: ["CP1", "CP2"],
    });
    const { sections, overflowFlags } = await buildQualityBundle(baseCtx, {}, { remaining: 5 });
    const [s] = sections;
    expect(s.key).toBe("quality-assurance");
    if (!s.content) throw new Error("content missing");
    if (s.content.format !== "quality-assurance") throw new Error();
    expect(s.content.qualityLead.name).toBe("Anna");
    expect(s.content.checkpoints).toEqual(["CP1", "CP2"]);
    expect(overflowFlags).toEqual([]);
  });
});

describe("QualityBundleSchema", () => {
  const validPayload = {
    qaProcess: ["P1"],
    qualityLead: { name: "A", roleAndMandate: "R", contact: "c" },
    escalation: { process: "Proc", reporting: "Rep" },
    checkpoints: ["CP1"],
  };

  it("rejects empty qaProcess", () => {
    expect(() =>
      QualityBundleSchema.parse({ ...validPayload, qaProcess: [] }),
    ).toThrow(z.ZodError);
  });

  it("rejects qaProcess with >2 entries", () => {
    expect(() =>
      QualityBundleSchema.parse({ ...validPayload, qaProcess: ["a", "b", "c"] }),
    ).toThrow(z.ZodError);
  });

  it("rejects empty checkpoints", () => {
    expect(() =>
      QualityBundleSchema.parse({ ...validPayload, checkpoints: [] }),
    ).toThrow(z.ZodError);
  });

  it("rejects checkpoints with >4 entries", () => {
    expect(() =>
      QualityBundleSchema.parse({ ...validPayload, checkpoints: ["a", "b", "c", "d", "e"] }),
    ).toThrow(z.ZodError);
  });

  it("rejects qualityLead.name empty string", () => {
    expect(() =>
      QualityBundleSchema.parse({
        ...validPayload,
        qualityLead: { name: "", roleAndMandate: "R", contact: "c" },
      }),
    ).toThrow(z.ZodError);
  });
});
