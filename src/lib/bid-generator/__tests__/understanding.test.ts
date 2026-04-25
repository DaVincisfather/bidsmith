import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BidContext } from "../context";
import type { RfpAnalysis } from "@/lib/types";

vi.mock("@/lib/ai-client", () => ({
  callClaude: vi.fn(),
}));

import { callClaude } from "@/lib/ai-client";
import { buildUnderstandingBundle, UnderstandingBundleSchema } from "../bundles/understanding";

const baseAnalysis: RfpAnalysis = {
  title: "t", client: "c", deadline: null, summary: "s",
  requirements: [], evaluationCriteria: [], requiredCompetencies: [],
  estimatedScope: "", redFlags: [], domain: "",
  oslReference: null, secrecyRows: [],
};

const baseCtx: BidContext = {
  analysis: baseAnalysis,
  teamConsultants: [],
  scoredConsultants: [],
  goNoGoResult: {
    mustRequirements: [], winProbability: 50, winProbabilityReasoning: "",
    strengths: [], gaps: [], improvements: [], recommendation: "go", reasoning: "",
  },
};

beforeEach(() => {
  vi.mocked(callClaude).mockReset();
});

describe("buildUnderstandingBundle", () => {
  it("returns 3 sections: current / assignment / vision", async () => {
    vi.mocked(callClaude).mockResolvedValue({
      current: { organisation: "Org", system: "Sys", processer: "Proc", smärtpunkter: ["A"] },
      assignment: { stycken: ["P1", "P2", "P3"] },
      vision: { utmaningar: ["U1"], värden: ["V1"] },
    });

    const sections = await buildUnderstandingBundle(baseCtx);
    expect(sections).toHaveLength(3);
    expect(sections[0].key).toBe("understanding-current");
    expect(sections[1].key).toBe("understanding-assignment");
    expect(sections[2].key).toBe("understanding-vision");
    if (!sections[0].content) throw new Error("content missing");
    if (sections[0].content.format !== "understanding-current") throw new Error();
    expect(sections[0].content.smärtpunkter).toEqual(["A"]);
  });

  it("propagates validation errors (no silent fallback)", async () => {
    vi.mocked(callClaude).mockRejectedValue(new Error("Invalid response"));
    await expect(buildUnderstandingBundle(baseCtx)).rejects.toThrow("Invalid response");
  });
});

describe("UnderstandingBundleSchema", () => {
  const validPayload = {
    current: { organisation: "Org", system: "Sys", processer: "Proc", smärtpunkter: ["A"] },
    assignment: { stycken: ["P1", "P2", "P3"] },
    vision: { utmaningar: ["U1"], värden: ["V1"] },
  };

  it("rejects smärtpunkter exceeding 4", () => {
    expect(() =>
      UnderstandingBundleSchema.parse({
        ...validPayload,
        current: { ...validPayload.current, smärtpunkter: ["a", "b", "c", "d", "e"] },
      }),
    ).toThrow();
  });

  it("rejects empty smärtpunkter", () => {
    expect(() =>
      UnderstandingBundleSchema.parse({
        ...validPayload,
        current: { ...validPayload.current, smärtpunkter: [] },
      }),
    ).toThrow();
  });

  it("rejects stycken with wrong length", () => {
    expect(() =>
      UnderstandingBundleSchema.parse({
        ...validPayload,
        assignment: { stycken: ["only one"] },
      }),
    ).toThrow();
    expect(() =>
      UnderstandingBundleSchema.parse({
        ...validPayload,
        assignment: { stycken: ["a", "b", "c", "d"] },
      }),
    ).toThrow();
  });
});
