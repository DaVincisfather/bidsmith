import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BidContext } from "../context";
import type { RfpAnalysis } from "@/lib/types";

vi.mock("@/lib/ai-client", () => ({
  callClaude: vi.fn(),
}));

import { callClaude } from "@/lib/ai-client";
import {
  buildGenericProseSection,
  GenericProseBundleSchema,
} from "../bundles/generic-prose";

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

describe("buildGenericProseSection", () => {
  it("returns a generic-prose section carrying its placeholder + text", async () => {
    vi.mocked(callClaude).mockResolvedValue({ text: "Vårt hållbarhetsarbete utgår från..." });

    const section = await buildGenericProseSection(
      { placeholder: "{Hållbarhet}", intent: "beskriv hållbarhetsarbetet", budgetChars: 600 },
      baseCtx,
    );

    expect(section.type).toBe("ai");
    expect(section.key).toBe("generic-prose:{Hållbarhet}");
    if (section.content?.format !== "generic-prose") throw new Error("wrong format");
    expect(section.content.placeholder).toBe("{Hållbarhet}");
    expect(section.content.text).toBe("Vårt hållbarhetsarbete utgår från...");
  });

  it("feeds the slot intent into the system prompt", async () => {
    vi.mocked(callClaude).mockResolvedValue({ text: "x" });
    await buildGenericProseSection({ placeholder: "{P}", intent: "UNIQUE_INTENT_XYZ" }, baseCtx);
    expect(vi.mocked(callClaude).mock.calls[0][0].system).toContain("UNIQUE_INTENT_XYZ");
  });

  it("includes the char budget in the prompt only when provided", async () => {
    vi.mocked(callClaude).mockResolvedValue({ text: "x" });
    await buildGenericProseSection({ placeholder: "{P}", intent: "i", budgetChars: 750 }, baseCtx);
    expect(vi.mocked(callClaude).mock.calls[0][0].system).toContain("750");

    vi.mocked(callClaude).mockClear();
    await buildGenericProseSection({ placeholder: "{P}", intent: "i" }, baseCtx);
    expect(vi.mocked(callClaude).mock.calls[0][0].system).not.toContain("tecken");
  });

  it("propagates validation errors (no silent fallback)", async () => {
    vi.mocked(callClaude).mockRejectedValue(new Error("Invalid response"));
    await expect(
      buildGenericProseSection({ placeholder: "{P}", intent: "i" }, baseCtx),
    ).rejects.toThrow("Invalid response");
  });
});

describe("GenericProseBundleSchema", () => {
  it("rejects empty text", () => {
    expect(() => GenericProseBundleSchema.parse({ text: "" })).toThrow();
  });
});
