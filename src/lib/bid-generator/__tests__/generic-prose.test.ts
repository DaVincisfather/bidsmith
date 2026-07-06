import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
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

// The batch calls hand callClaude a FIXED sections-array schema (constant grammar
// complexity — the dynamic per-placeholder keys blew the live grammar compiler),
// and the client maps the array back to one section per requested slot.
describe("fixed sections-array schema + mapping", () => {
  const schemaShapeKeys = (call: number) =>
    Object.keys(
      (vi.mocked(callClaude).mock.calls[call][0].schema as z.ZodObject<z.ZodRawShape>).shape,
    );

  it("hands callClaude the fixed schema (one `sections` key, no dynamic placeholder keys)", async () => {
    vi.mocked(callClaude).mockResolvedValue({ sections: [] });
    await buildGenericProseSlideSections(
      [{ placeholder: "{Upphandlande organisation}", intent: "i" }],
      baseCtx,
    );
    expect(schemaShapeKeys(0)).toEqual(["sections"]);
    expect(schemaShapeKeys(0)).not.toContain("{Upphandlande organisation}");
  });

  it("maps the sections array back to one section per slot (placeholder + key preserved)", async () => {
    vi.mocked(callClaude).mockResolvedValue({
      sections: [
        { placeholder: "{A}", text: "text A" },
        { placeholder: "{B}", text: "text B" },
      ],
    });
    const out = await buildGenericProseSlideSections(
      [{ placeholder: "{A}", intent: "ia" }, { placeholder: "{B}", intent: "ib" }],
      baseCtx,
    );
    expect(out.map((s) => s.key)).toEqual(["generic-prose:{A}", "generic-prose:{B}"]);
    const c = out[0].content;
    expect(c && c.format === "generic-prose" && c.placeholder).toBe("{A}");
    expect(c && c.format === "generic-prose" && c.text).toBe("text A");
  });

  it("drops an unknown placeholder the model invents (no section, no throw)", async () => {
    vi.mocked(callClaude).mockResolvedValue({
      sections: [
        { placeholder: "{A}", text: "text A" },
        { placeholder: "{HALLUCINATED}", text: "junk the model made up" },
      ],
    });
    const out = await buildGenericProseSlideSections([{ placeholder: "{A}", intent: "ia" }], baseCtx);
    expect(out.map((s) => s.key)).toEqual(["generic-prose:{A}"]);
  });

  it("keeps the FIRST element when the model repeats a placeholder (first wins)", async () => {
    vi.mocked(callClaude).mockResolvedValue({
      sections: [
        { placeholder: "{A}", text: "first" },
        { placeholder: "{A}", text: "second" },
      ],
    });
    const out = await buildGenericProseSlideSections([{ placeholder: "{A}", intent: "ia" }], baseCtx);
    expect(out).toHaveLength(1);
    const c = out[0].content;
    expect(c && c.format === "generic-prose" && c.text).toBe("first");
  });

  it("produces no section for a requested placeholder the response omits (→ orchestrator re-ask)", async () => {
    vi.mocked(callClaude).mockResolvedValue({
      sections: [{ placeholder: "{A}", text: "text A" }],
    });
    const out = await buildGenericProseSlideSections(
      [{ placeholder: "{A}", intent: "ia" }, { placeholder: "{Missing}", intent: "im" }],
      baseCtx,
    );
    expect(out.map((s) => s.key)).toEqual(["generic-prose:{A}"]);
  });

  it("produces no section for a blank/whitespace-only answer (→ orchestrator re-ask)", async () => {
    vi.mocked(callClaude).mockResolvedValue({
      sections: [
        { placeholder: "{A}", text: "text A" },
        { placeholder: "{Blank}", text: "\n  " },
      ],
    });
    const out = await buildGenericProseSlideSections(
      [{ placeholder: "{A}", intent: "ia" }, { placeholder: "{Blank}", intent: "ib" }],
      baseCtx,
    );
    expect(out.map((s) => s.key)).toEqual(["generic-prose:{A}"]);
  });

  it("re-ask uses the SAME fixed schema and mapping (unknowns dropped, first wins)", async () => {
    vi.mocked(callClaude).mockResolvedValue({
      sections: [
        { placeholder: "{A}", text: "reasked A" },
        { placeholder: "{A}", text: "dup ignored" },
        { placeholder: "{X}", text: "unknown dropped" },
      ],
    });
    const out = await buildGenericProseReaskSections(
      [{ slot: { placeholder: "{A}", intent: "ia" }, slideSource: 1 }],
      baseCtx,
    );
    expect(schemaShapeKeys(0)).toEqual(["sections"]);
    expect(out.map((s) => s.key)).toEqual(["generic-prose:{A}"]);
    const c = out[0].content;
    expect(c && c.format === "generic-prose" && c.text).toBe("reasked A");
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
    vi.mocked(callClaude).mockResolvedValue({ sections: [] });
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
    vi.mocked(callClaude).mockResolvedValue({ sections: [] });
    const targets = slotsOf(MAX_KEYS_PER_CALL).map((slot) => ({ slot, slideSource: 1 }));
    await expect(buildGenericProseReaskSections(targets, baseCtx)).resolves.toEqual([]);
    expect(vi.mocked(callClaude)).toHaveBeenCalledTimes(1);
  });
});

// Sibling intents are coherence context — long intents are truncated (~80 chars)
// so the sibling block never outgrows the actual work list.
describe("sibling context", () => {
  it("includes sibling intent, truncated with an ellipsis when long", async () => {
    vi.mocked(callClaude).mockResolvedValue({ sections: [{ placeholder: "{A}", text: "x" }] });
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
