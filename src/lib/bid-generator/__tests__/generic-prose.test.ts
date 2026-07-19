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
  buildGenericProseShortenSections,
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

  it("buildGenericProseShortenSections throws on >MAX_KEYS_PER_CALL targets without calling the API", async () => {
    const targets = slotsOf(MAX_KEYS_PER_CALL + 1).map((slot) => ({ slot, currentText: "x" }));
    await expect(buildGenericProseShortenSections(targets, baseCtx)).rejects.toThrow(
      /MAX_KEYS_PER_CALL/,
    );
    expect(vi.mocked(callClaude)).not.toHaveBeenCalled();
  });

  it("buildGenericProseShortenSections accepts exactly MAX_KEYS_PER_CALL targets", async () => {
    vi.mocked(callClaude).mockResolvedValue({ sections: [] });
    const targets = slotsOf(MAX_KEYS_PER_CALL).map((slot) => ({ slot, currentText: "x" }));
    await expect(buildGenericProseShortenSections(targets, baseCtx)).resolves.toEqual([]);
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

// Short-field rule (design doc 2026-07-14): a slot with budgetChars <=
// SHORT_FIELD_MAX_CHARS is a VALUE (a name, a date, a diary number), not prose —
// routine-fynd 2026-07-07 showed {Diarienummer} came back with a 130-char
// apology paragraph instead of a value-or-blank. The slide prompt, the re-ask
// prompt, and the empty-answer handling all carry this rule.
describe("short-field rule", () => {
  it("marks slots at or under SHORT_FIELD_MAX_CHARS as KORTFÄLT in the slide prompt", async () => {
    vi.mocked(callClaude).mockResolvedValue({ sections: [] });
    await buildGenericProseSlideSections(
      [{ placeholder: "{Diarienummer}", intent: "ärendets diarienummer", budgetChars: 60 }],
      baseCtx,
    );

    const system = vi.mocked(callClaude).mock.calls[0][0].system;
    expect(system).toContain("KORTFÄLT");
    expect(system).toContain("ENDAST värdet");
    expect(system).not.toContain("håll dig inom ca 60 tecken");
  });

  it("adds the sibling-division block when a slide has 2+ slots", async () => {
    vi.mocked(callClaude).mockResolvedValue({ sections: [] });
    await buildGenericProseSlideSections(
      [{ placeholder: "{A}", intent: "a" }, { placeholder: "{B}", intent: "b" }],
      baseCtx,
    );
    const system = vi.mocked(callClaude).mock.calls[0][0].system;
    expect(system).toContain("EGEN tydlig vinkel");
    expect(system).toContain("upprepa ingen mening");

    vi.mocked(callClaude).mockClear();
    await buildGenericProseSlideSections([{ placeholder: "{A}", intent: "a" }], baseCtx);
    const single = vi.mocked(callClaude).mock.calls[0][0].system;
    expect(single).not.toContain("EGEN tydlig vinkel");
  });

  it("emits an empty section for a short field answered blank, drops a blank prose slot", async () => {
    vi.mocked(callClaude).mockResolvedValue({
      sections: [
        { placeholder: "{Diarienummer}", text: "" },
        { placeholder: "{Om oss}", text: "" },
      ],
    });
    const out = await buildGenericProseSlideSections(
      [
        { placeholder: "{Diarienummer}", intent: "diarienummer", budgetChars: 60 },
        { placeholder: "{Om oss}", intent: "om oss", budgetChars: 400 },
      ],
      baseCtx,
    );

    expect(out.map((s) => s.key)).toEqual(["generic-prose:{Diarienummer}"]);
    const c = out[0].content;
    expect(c && c.format === "generic-prose" && c.text).toBe("");
  });

  it("marks single-line prose slots with the hard EN RAD cap instead of the soft ca-budget", async () => {
    vi.mocked(callClaude).mockResolvedValue({ sections: [] });
    await buildGenericProseSlideSections(
      [{ placeholder: "{Kicker}", intent: "sammanfattande kicker", budgetChars: 110, singleLine: true }],
      baseCtx,
    );

    const system = vi.mocked(callClaude).mock.calls[0][0].system;
    expect(system).toContain("EN RAD");
    expect(system).toContain("max 110 tecken");
    expect(system).not.toContain("håll dig inom ca 110");
  });

  it("keeps the soft ca-budget for multi-line prose and KORTFÄLT for short single-line slots", async () => {
    vi.mocked(callClaude).mockResolvedValue({ sections: [] });
    await buildGenericProseSlideSections(
      [
        { placeholder: "{Prosa}", intent: "p", budgetChars: 110 },
        { placeholder: "{Chip}", intent: "c", budgetChars: 60, singleLine: true },
      ],
      baseCtx,
    );

    const system = vi.mocked(callClaude).mock.calls[0][0].system;
    const proseLine = system.split("\n").find((l) => l.includes("{Prosa}"))!;
    const chipLine = system.split("\n").find((l) => l.includes("{Chip}"))!;
    expect(proseLine).toContain("håll dig inom ca 110 tecken");
    expect(proseLine).not.toContain("EN RAD");
    // A short single-line slot is a chip — the value-or-empty rule already
    // covers it; the EN RAD phrasing is for wide prose-classed kickers only.
    expect(chipLine).toContain("KORTFÄLT");
    expect(chipLine).not.toContain("EN RAD");
  });

  it("re-ask prompt carries the value-or-empty rule for short fields", async () => {
    vi.mocked(callClaude).mockResolvedValue({ sections: [] });
    await buildGenericProseReaskSections(
      [
        {
          slot: { placeholder: "{Diarienummer}", intent: "diarienummer", budgetChars: 60 },
          slideSource: 1,
        },
      ],
      baseCtx,
    );

    const system = vi.mocked(callClaude).mock.calls[0][0].system;
    expect(system).toContain("KORTFÄLT");
    expect(system).toContain("lämna tomt");
    // The intro still demands substantial content for prose targets.
    expect(system).toContain("skriv VARJE fält");
  });

  it("re-ask prompt for an all-prose batch omits the KORTFÄLT exception (byte-identical to the pre-branch prompt)", async () => {
    vi.mocked(callClaude).mockResolvedValue({ sections: [] });
    await buildGenericProseReaskSections(
      [{ slot: { placeholder: "{Om oss}", intent: "om oss" }, slideSource: 1 }],
      baseCtx,
    );

    const system = vi.mocked(callClaude).mock.calls[0][0].system;
    expect(system).not.toContain("KORTFÄLT");
    expect(system).not.toContain("Undantag:");
  });

  it("re-ask prompt for a mixed batch gates the exception per-slot but keeps the every-field demand", async () => {
    vi.mocked(callClaude).mockResolvedValue({ sections: [] });
    await buildGenericProseReaskSections(
      [
        { slot: { placeholder: "{Om oss}", intent: "om oss" }, slideSource: 1 },
        {
          slot: { placeholder: "{Diarienummer}", intent: "diarienummer", budgetChars: 60 },
          slideSource: 2,
        },
      ],
      baseCtx,
    );

    const system = vi.mocked(callClaude).mock.calls[0][0].system;
    const proseLine = system.split("\n").find((l) => l.includes("{Om oss}"))!;
    const shortLine = system.split("\n").find((l) => l.includes("{Diarienummer}"))!;
    expect(proseLine).not.toContain("KORTFÄLT");
    expect(shortLine).toContain("KORTFÄLT");
    expect(system).toContain("skriv VARJE fält");
    expect(system).toContain("Undantag: rader märkta KORTFÄLT får lämnas tomma");
  });
});
