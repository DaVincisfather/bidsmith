import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BidContext } from "../context";
import type { RfpAnalysis } from "@/lib/types";

vi.mock("@/lib/ai-client", () => ({
  callClaude: vi.fn(),
}));

import { callClaude } from "@/lib/ai-client";
import {
  MAX_KEYS_PER_CALL,
  buildGenericProseSection,
  buildGenericProseSlideSections,
  buildGenericProseReaskSections,
  GenericProseBundleSchema,
  type GenericProseSlot,
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

// The key ceiling is enforced IN the bundle functions, not only by the
// orchestrator's chunking — a future call site that skips the chunking must fail
// loudly BEFORE the paid call, not reintroduce the API's non-retryable 400
// ("too many optional parameters") silently.
describe("MAX_KEYS_PER_CALL guard", () => {
  const slotsOf = (n: number): GenericProseSlot[] =>
    Array.from({ length: n }, (_, i) => ({ placeholder: `{S${i}}`, intent: `i${i}` }));

  it("buildGenericProseSlideSections throws on >MAX_KEYS_PER_CALL slots without calling the API", async () => {
    await expect(
      buildGenericProseSlideSections(slotsOf(MAX_KEYS_PER_CALL + 1), baseCtx),
    ).rejects.toThrow(/MAX_KEYS_PER_CALL/);
    expect(vi.mocked(callClaude)).not.toHaveBeenCalled();
  });

  it("buildGenericProseSlideSections accepts exactly MAX_KEYS_PER_CALL slots", async () => {
    vi.mocked(callClaude).mockResolvedValue({});
    await expect(
      buildGenericProseSlideSections(slotsOf(MAX_KEYS_PER_CALL), baseCtx),
    ).resolves.toEqual([]);
    expect(vi.mocked(callClaude)).toHaveBeenCalledTimes(1);
  });

  it("buildGenericProseReaskSections throws on >MAX_KEYS_PER_CALL targets without calling the API", async () => {
    const targets = slotsOf(MAX_KEYS_PER_CALL + 1).map((slot) => ({ slot, slideSource: 1 }));
    await expect(buildGenericProseReaskSections(targets, baseCtx)).rejects.toThrow(
      /MAX_KEYS_PER_CALL/,
    );
    expect(vi.mocked(callClaude)).not.toHaveBeenCalled();
  });

  it("buildGenericProseReaskSections accepts exactly MAX_KEYS_PER_CALL targets", async () => {
    vi.mocked(callClaude).mockResolvedValue({});
    const targets = slotsOf(MAX_KEYS_PER_CALL).map((slot) => ({ slot, slideSource: 1 }));
    await expect(buildGenericProseReaskSections(targets, baseCtx)).resolves.toEqual([]);
    expect(vi.mocked(callClaude)).toHaveBeenCalledTimes(1);
  });
});

// Sibling intents are coherence context — long intents are truncated (~80 chars)
// so the sibling block never outgrows the actual work list.
describe("sibling context", () => {
  it("includes sibling intent, truncated with an ellipsis when long", async () => {
    vi.mocked(callClaude).mockResolvedValue({ "{A}": "x" });
    const longIntent = "x".repeat(120);
    await buildGenericProseSlideSections(
      [{ placeholder: "{A}", intent: "a" }],
      baseCtx,
      [
        { placeholder: "{Kort}", intent: "kort syfte" },
        { placeholder: "{Lång}", intent: longIntent },
      ],
    );

    const system = vi.mocked(callClaude).mock.calls[0][0].system;
    expect(system).toContain(`- "{Kort}": kort syfte`);
    expect(system).toContain(`- "{Lång}": ${"x".repeat(80)}…`);
    expect(system).not.toContain("x".repeat(81));
  });
});
