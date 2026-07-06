// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import type { RfpAnalysis } from "@/lib/types";
import type { TemplateProfile, SlideProfile } from "@/lib/pptx-template/template-profile";
import type { BidContext } from "../context";

// callClaude is the paid Sonnet call — mocked so the generator runs offline
// while the REAL buildGenericProseSlideSections executes. The mock reads the
// per-CALL schema it was handed and echoes one string per placeholder, so we can
// assert call count (one per CHUNK — a slide ≤MAX_KEYS_PER_CALL slots is one
// chunk, so small slides are still one call each), schema keys (= that chunk's
// placeholders) and how the response maps back to sections.
const callClaudeMock = vi.fn();
vi.mock("@/lib/ai-client", () => ({
  callClaude: (...args: unknown[]) => callClaudeMock(...args),
}));

import { generateSectionsFromProfile } from "../generate-from-profile";

// formatContext runs for real (it builds cachedContext), so ctx must be a valid
// BidContext, not a bare {}.
const baseAnalysis: RfpAnalysis = {
  title: "t", client: "c", deadline: null, summary: "s",
  requirements: [], evaluationCriteria: [], requiredCompetencies: [],
  estimatedScope: "", redFlags: [], domain: "",
  oslReference: null, secrecyRows: [],
};
const ctx: BidContext = {
  analysis: baseAnalysis,
  teamConsultants: [],
  scoredConsultants: [],
  goNoGoResult: {
    mustRequirements: [], winProbability: 50, winProbabilityReasoning: "",
    strengths: [], gaps: [], improvements: [], recommendation: "go", reasoning: "",
  },
};

// The schema handed to callClaude, keyed by the slide's placeholders.
type SlideCall = { schema: z.ZodObject<z.ZodRawShape> };
function callSchemaKeys(call: number): string[] {
  const arg = callClaudeMock.mock.calls[call][0] as SlideCall;
  return Object.keys(arg.schema.shape);
}

// Default happy path: echo one string per placeholder the schema asked for.
function echoAllKeys() {
  callClaudeMock.mockImplementation(async (opts: SlideCall) => {
    const out: Record<string, string> = {};
    for (const key of Object.keys(opts.schema.shape)) out[key] = `text ${key}`;
    return out;
  });
}

// Wave-1 slide calls carry label "generic-prose slide bundle"; the batched
// re-ask carries "generic-prose re-ask" — this is how the mock and the schema-key
// assertions tell the two waves apart.
const REASK_LABEL = "generic-prose re-ask";
function isReask(opts: { label?: string }) {
  return opts.label === REASK_LABEL;
}

// Mock that leaves `emptyOnWave1` blank on the first (per-slide) pass, then on
// the re-ask leaves only `stillEmpty` blank (default: fills everything).
function mockWaveThenReask(emptyOnWave1: string[], stillEmpty: string[] = []) {
  callClaudeMock.mockImplementation(async (opts: SlideCall & { label?: string }) => {
    const reask = isReask(opts);
    const out: Record<string, string> = {};
    for (const key of Object.keys(opts.schema.shape)) {
      const blank = reask ? stillEmpty.includes(key) : emptyOnWave1.includes(key);
      out[key] = blank ? "" : `text ${key}`;
    }
    return out;
  });
}

// Index of the single re-ask call (the one labelled REASK_LABEL).
function reaskCallIndex(): number {
  return callClaudeMock.mock.calls.findIndex((c) => isReask(c[0] as { label?: string }));
}

function genericSlot(placeholder: string, status: "generic" | "skip" = "generic") {
  return {
    placeholder,
    capability: "generic-prose" as const,
    format: "prose" as const,
    intent: `intent ${placeholder}`,
    status,
  };
}

function profileWith(slides: SlideProfile[]): TemplateProfile {
  return { profileVersion: 1, templateId: "tpl-foreign", name: "kundmall", version: 1, slides };
}

beforeEach(() => {
  callClaudeMock.mockReset();
});

describe("generateSectionsFromProfile", () => {
  // (a) one call per slide; schema keys = that slide's placeholders.
  it("fires exactly one call per slide with the slide's placeholders as schema keys", async () => {
    echoAllKeys();
    const profile = profileWith([
      {
        source: 1,
        capability: "generic-prose",
        slots: [
          { ...genericSlot("{A1}"), budgetChars: 500 },
          genericSlot("{A2}"),
          genericSlot("{A3}"),
        ],
      },
      {
        source: 2,
        capability: "generic-prose",
        slots: [genericSlot("{B1}"), genericSlot("{B2}")],
      },
    ]);

    await generateSectionsFromProfile(profile, ctx);

    expect(callClaudeMock).toHaveBeenCalledTimes(2);
    expect(callSchemaKeys(0)).toEqual(["{A1}", "{A2}", "{A3}"]);
    expect(callSchemaKeys(1)).toEqual(["{B1}", "{B2}"]);
  });

  // (b) response maps to one BidSection per slot with the right placeholder/key.
  it("maps the slide response to one section per slot (placeholder + key preserved)", async () => {
    echoAllKeys();
    const profile = profileWith([
      {
        source: 1,
        capability: "generic-prose",
        slots: [genericSlot("{A1}"), genericSlot("{A2}"), genericSlot("{A3}")],
      },
      {
        source: 2,
        capability: "generic-prose",
        slots: [genericSlot("{B1}"), genericSlot("{B2}")],
      },
    ]);

    const { sections, failedSections } = await generateSectionsFromProfile(profile, ctx);

    expect(sections).toHaveLength(5);
    expect(sections.map((s) => s.key)).toEqual([
      "generic-prose:{A1}", "generic-prose:{A2}", "generic-prose:{A3}",
      "generic-prose:{B1}", "generic-prose:{B2}",
    ]);
    expect(
      sections.map((s) => s.content && s.content.format === "generic-prose" && s.content.placeholder),
    ).toEqual(["{A1}", "{A2}", "{A3}", "{B1}", "{B2}"]);
    expect(failedSections).toEqual([]);
  });

  // (c) one slide's call rejecting fails only that slide's slots; other slide survives.
  it("isolates a slide failure — its slots fail, other slides' sections survive", async () => {
    callClaudeMock.mockImplementation(async (opts: SlideCall) => {
      const keys = Object.keys(opts.schema.shape);
      if (keys.includes("{B1}")) throw new Error("boom");
      const out: Record<string, string> = {};
      for (const key of keys) out[key] = `text ${key}`;
      return out;
    });
    const profile = profileWith([
      { source: 1, capability: "generic-prose", slots: [genericSlot("{A1}"), genericSlot("{A2}")] },
      { source: 2, capability: "generic-prose", slots: [genericSlot("{B1}"), genericSlot("{B2}")] },
    ]);

    const { sections, failedSections } = await generateSectionsFromProfile(profile, ctx);

    expect(sections.map((s) => s.key)).toEqual(["generic-prose:{A1}", "generic-prose:{A2}"]);
    expect(failedSections).toEqual([
      { placeholder: "{B1}", error: "boom" },
      { placeholder: "{B2}", error: "boom" },
    ]);
  });

  // (d) onSectionComplete runs once per produced section, in order.
  it("invokes onSectionComplete sequentially over the produced sections", async () => {
    echoAllKeys();
    const seen: string[] = [];
    const profile = profileWith([
      { source: 1, capability: "generic-prose", slots: [genericSlot("{A1}"), genericSlot("{A2}")] },
      { source: 2, capability: "generic-prose", slots: [genericSlot("{B1}")] },
    ]);

    await generateSectionsFromProfile(profile, ctx, async (s) => {
      const c = s.content;
      if (c && c.format === "generic-prose") seen.push(c.placeholder);
    });

    expect(seen).toEqual(["{A1}", "{A2}", "{B1}"]);
  });

  // (e) a slide with no generic-prose slots produces no call at all.
  it("makes no call for slides without generic-prose slots (static / all-skip)", async () => {
    echoAllKeys();
    const profile = profileWith([
      { source: 1, capability: "static", slots: [] },
      { source: 2, capability: "generic-prose", slots: [genericSlot("{Drop}", "skip")] },
      { source: 3, capability: "generic-prose", slots: [genericSlot("{Keep}")] },
    ]);

    const { sections } = await generateSectionsFromProfile(profile, ctx);

    expect(callClaudeMock).toHaveBeenCalledTimes(1);
    expect(callSchemaKeys(0)).toEqual(["{Keep}"]);
    expect(sections.map((s) => s.key)).toEqual(["generic-prose:{Keep}"]);
  });

  // The schema itself must accept both a blank AND a dropped key — a required
  // z.string() (or a .min(1)) fails Zod client-side and, after paid retries,
  // sinks the whole slide when the model answers "" or omits a slot. The keys
  // stay present in the shape (so the response still maps back per placeholder)
  // but are optional, so a missing key degrades to a per-slot re-ask.
  it("builds the slide schema with optional keys (empty string AND a missing key both parse)", async () => {
    echoAllKeys();
    const profile = profileWith([
      { source: 1, capability: "generic-prose", slots: [genericSlot("{A}"), genericSlot("{B}")] },
    ]);

    await generateSectionsFromProfile(profile, ctx);

    const arg = callClaudeMock.mock.calls[0][0] as SlideCall;
    // Keys are present in the schema shape (one per placeholder)...
    expect(Object.keys(arg.schema.shape)).toEqual(["{A}", "{B}"]);
    // ...but optional: "" parses (no min-gate) and a DROPPED key parses too.
    expect(arg.schema.safeParse({ "{A}": "", "{B}": "" }).success).toBe(true);
    expect(arg.schema.safeParse({ "{A}": "text {A}" }).success).toBe(true); // {B} omitted
  });

  // Bounds in-flight SLIDES (not one giant Promise.all over every slide). F5
  // measured 345 s at concurrency 6 (green run) → raised to 12 so a typical
  // template's whole first wave flies at once; 15 slides peak at 12, not 15.
  it("caps concurrency at 12 slides (chunked, not unbounded)", async () => {
    let inFlight = 0;
    let peak = 0;
    callClaudeMock.mockImplementation(async (opts: SlideCall) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 0));
      inFlight--;
      const out: Record<string, string> = {};
      for (const key of Object.keys(opts.schema.shape)) out[key] = `text ${key}`;
      return out;
    });
    const profile = profileWith(
      Array.from({ length: 15 }, (_, i): SlideProfile => ({
        source: i + 1,
        capability: "generic-prose",
        slots: [genericSlot(`{S${i}}`)],
      })),
    );

    const { sections } = await generateSectionsFromProfile(profile, ctx);

    expect(sections).toHaveLength(15);
    expect(callClaudeMock).toHaveBeenCalledTimes(15);
    expect(peak).toBe(12);
  });
});

// F6 — batched re-ask for empty slots (pattern precedent: evidence-guard's one
// batched re-quote). A per-slide call with many required keys leaves some blank
// nondeterministically; empties across ALL slides are gathered into ONE re-ask.
describe("generateSectionsFromProfile — batched re-ask (F6)", () => {
  // (a) empty keys in wave 1 → EXACTLY one re-ask, its schema keys = just the
  // empties (across slides), and no others.
  it("fires exactly one re-ask over only the empty placeholders", async () => {
    mockWaveThenReask(["{A2}", "{B1}"]);
    const profile = profileWith([
      { source: 1, capability: "generic-prose", slots: [genericSlot("{A1}"), genericSlot("{A2}"), genericSlot("{A3}")] },
      { source: 2, capability: "generic-prose", slots: [genericSlot("{B1}"), genericSlot("{B2}")] },
    ]);

    await generateSectionsFromProfile(profile, ctx);

    // 2 slide calls + 1 re-ask.
    expect(callClaudeMock).toHaveBeenCalledTimes(3);
    const idx = reaskCallIndex();
    expect(idx).toBe(2);
    expect(callSchemaKeys(idx)).toEqual(["{A2}", "{B1}"]);
  });

  // Whitespace-only is as blank on the slide as "" — it must hit the re-ask,
  // not slip through as a "filled" section (reviewer minor on the F6 pass).
  it("re-asks a slot the model answered whitespace-only for", async () => {
    callClaudeMock.mockImplementation(async (opts: SlideCall & { label?: string }) => {
      const out: Record<string, string> = {};
      for (const key of Object.keys(opts.schema.shape)) {
        out[key] = !isReask(opts) && key === "{Blank}" ? "\n  " : `text ${key}`;
      }
      return out;
    });
    const profile = profileWith([
      { source: 1, capability: "generic-prose", slots: [genericSlot("{A1}"), genericSlot("{Blank}")] },
    ]);

    const { sections, failedSections } = await generateSectionsFromProfile(profile, ctx);

    const idx = reaskCallIndex();
    expect(idx).toBeGreaterThan(-1);
    expect(callSchemaKeys(idx)).toEqual(["{Blank}"]);
    expect(failedSections).toEqual([]);
    const refilled = sections.find((s) => s.key === "generic-prose:{Blank}");
    expect(refilled?.content && refilled.content.format === "generic-prose" && refilled.content.text).toBe("text {Blank}");
  });

  // (b) re-ask fills every empty → all sections present, failedSections empty.
  it("completes every section when the re-ask fills the empties", async () => {
    mockWaveThenReask(["{A2}", "{B1}"]);
    const profile = profileWith([
      { source: 1, capability: "generic-prose", slots: [genericSlot("{A1}"), genericSlot("{A2}"), genericSlot("{A3}")] },
      { source: 2, capability: "generic-prose", slots: [genericSlot("{B1}"), genericSlot("{B2}")] },
    ]);

    const { sections, failedSections } = await generateSectionsFromProfile(profile, ctx);

    expect(failedSections).toEqual([]);
    expect(sections.map((s) => s.key).sort()).toEqual([
      "generic-prose:{A1}", "generic-prose:{A2}", "generic-prose:{A3}",
      "generic-prose:{B1}", "generic-prose:{B2}",
    ]);
    // The re-filled slots carry the same placeholder mapping as any other.
    const refilled = sections.find((s) => s.key === "generic-prose:{A2}");
    expect(refilled?.content && refilled.content.format === "generic-prose" && refilled.content.placeholder).toBe("{A2}");
  });

  // (c) a slot still empty after the re-ask → only that one to failedSections.
  it("fails only the slot that stays empty after the re-ask", async () => {
    mockWaveThenReask(["{A2}", "{A3}"], ["{A3}"]);
    const profile = profileWith([
      { source: 1, capability: "generic-prose", slots: [genericSlot("{A1}"), genericSlot("{A2}"), genericSlot("{A3}")] },
    ]);

    const { sections, failedSections } = await generateSectionsFromProfile(profile, ctx);

    expect(sections.map((s) => s.key).sort()).toEqual(["generic-prose:{A1}", "generic-prose:{A2}"]);
    expect(failedSections).toEqual([
      { placeholder: "{A3}", error: "tomt eller saknat även efter re-ask" },
    ]);
  });

  // (d) the re-ask call rejecting → all re-ask slots to failedSections, wave-1
  // sections untouched. The re-ask must never fell a slot that already succeeded.
  it("sends only re-ask slots to failedSections when the re-ask rejects", async () => {
    callClaudeMock.mockImplementation(async (opts: SlideCall & { label?: string }) => {
      if (isReask(opts)) throw new Error("reask boom");
      const out: Record<string, string> = {};
      for (const key of Object.keys(opts.schema.shape)) out[key] = key === "{A2}" ? "" : `text ${key}`;
      return out;
    });
    const profile = profileWith([
      { source: 1, capability: "generic-prose", slots: [genericSlot("{A1}"), genericSlot("{A2}")] },
      { source: 2, capability: "generic-prose", slots: [genericSlot("{B1}")] },
    ]);

    const { sections, failedSections } = await generateSectionsFromProfile(profile, ctx);

    expect(sections.map((s) => s.key).sort()).toEqual(["generic-prose:{A1}", "generic-prose:{B1}"]);
    expect(failedSections).toEqual([{ placeholder: "{A2}", error: "reask boom" }]);
  });

  // (e) no empties in wave 1 → no re-ask call at all.
  it("makes no re-ask call when wave 1 leaves nothing empty", async () => {
    echoAllKeys();
    const profile = profileWith([
      { source: 1, capability: "generic-prose", slots: [genericSlot("{A1}"), genericSlot("{A2}")] },
      { source: 2, capability: "generic-prose", slots: [genericSlot("{B1}")] },
    ]);

    const { failedSections } = await generateSectionsFromProfile(profile, ctx);

    expect(callClaudeMock).toHaveBeenCalledTimes(2);
    expect(reaskCallIndex()).toBe(-1);
    expect(failedSections).toEqual([]);
  });

  // A rejected SLIDE (not an empty slot) is not re-asked — re-asking a call that
  // couldn't parse buys nothing; its slots fail directly, and if that's the only
  // failure no re-ask fires.
  it("does not re-ask a rejected slide's slots", async () => {
    callClaudeMock.mockImplementation(async (opts: SlideCall & { label?: string }) => {
      const keys = Object.keys(opts.schema.shape);
      if (keys.includes("{B1}")) throw new Error("boom");
      const out: Record<string, string> = {};
      for (const key of keys) out[key] = `text ${key}`;
      return out;
    });
    const profile = profileWith([
      { source: 1, capability: "generic-prose", slots: [genericSlot("{A1}")] },
      { source: 2, capability: "generic-prose", slots: [genericSlot("{B1}"), genericSlot("{B2}")] },
    ]);

    const { sections, failedSections } = await generateSectionsFromProfile(profile, ctx);

    expect(reaskCallIndex()).toBe(-1);
    expect(sections.map((s) => s.key)).toEqual(["generic-prose:{A1}"]);
    expect(failedSections).toEqual([
      { placeholder: "{B1}", error: "boom" },
      { placeholder: "{B2}", error: "boom" },
    ]);
  });

  // A wave-1 response that OMITS a key entirely (undefined, not "") must degrade
  // exactly like a blank one: the missing slot goes to the re-ask, the slide's
  // other sections survive. This is the real-mall failure the optional schema
  // fixes — a required z.string() would have rejected the whole slide instead.
  it("re-asks a slot the wave-1 response omits entirely (undefined), other sections survive", async () => {
    callClaudeMock.mockImplementation(async (opts: SlideCall & { label?: string }) => {
      const out: Record<string, string> = {};
      for (const key of Object.keys(opts.schema.shape)) {
        if (!isReask(opts) && key === "{A2}") continue; // drop the key entirely on wave 1
        out[key] = `text ${key}`;
      }
      return out;
    });
    const profile = profileWith([
      { source: 1, capability: "generic-prose", slots: [genericSlot("{A1}"), genericSlot("{A2}"), genericSlot("{A3}")] },
      { source: 2, capability: "generic-prose", slots: [genericSlot("{B1}")] },
    ]);

    const { sections, failedSections } = await generateSectionsFromProfile(profile, ctx);

    const idx = reaskCallIndex();
    expect(idx).toBeGreaterThan(-1);
    expect(callSchemaKeys(idx)).toEqual(["{A2}"]);
    expect(failedSections).toEqual([]);
    expect(sections.map((s) => s.key).sort()).toEqual([
      "generic-prose:{A1}", "generic-prose:{A2}", "generic-prose:{A3}", "generic-prose:{B1}",
    ]);
  });

  // A re-ask response that OMITS a key (undefined, not "") degrades per slot too:
  // only that placeholder lands in failedSections, wave-1 sections untouched.
  it("fails only the slot the re-ask response omits (undefined), wave-1 sections untouched", async () => {
    callClaudeMock.mockImplementation(async (opts: SlideCall & { label?: string }) => {
      const out: Record<string, string> = {};
      for (const key of Object.keys(opts.schema.shape)) {
        if (key === "{A2}") continue; // wave 1 drops it, re-ask drops it again
        out[key] = `text ${key}`;
      }
      return out;
    });
    const profile = profileWith([
      { source: 1, capability: "generic-prose", slots: [genericSlot("{A1}"), genericSlot("{A2}")] },
    ]);

    const { sections, failedSections } = await generateSectionsFromProfile(profile, ctx);

    expect(sections.map((s) => s.key)).toEqual(["generic-prose:{A1}"]);
    expect(failedSections).toEqual([
      { placeholder: "{A2}", error: "tomt eller saknat även efter re-ask" },
    ]);
  });

  // The re-ask schema, like the slide schema, must be optional so a partial
  // re-ask response degrades per slot instead of rejecting the whole re-ask.
  it("builds the re-ask schema with optional keys (a missing key parses)", async () => {
    mockWaveThenReask(["{A2}"]);
    const profile = profileWith([
      { source: 1, capability: "generic-prose", slots: [genericSlot("{A1}"), genericSlot("{A2}")] },
    ]);

    await generateSectionsFromProfile(profile, ctx);

    const idx = reaskCallIndex();
    expect(idx).toBeGreaterThan(-1);
    const arg = callClaudeMock.mock.calls[idx][0] as SlideCall;
    expect(Object.keys(arg.schema.shape)).toEqual(["{A2}"]);
    expect(arg.schema.safeParse({}).success).toBe(true); // dropped key parses
  });
});

// Key-chunking (≤MAX_KEYS_PER_CALL=12 per call): the live structured-outputs API
// rejects large optional schemas with NON-retryable 400s ("too many optional
// parameters (25", "Schema is too complex", "Grammar compilation timed out"), so
// a slide with 20–30 slots must split across calls instead of firing one wide one.
describe("generateSectionsFromProfile — key-chunking (≤12 per call)", () => {
  // Builds N generic-prose slots {S0}..{S(N-1)} on one slide.
  function slideWithSlots(source: number, n: number): SlideProfile {
    return {
      source,
      capability: "generic-prose",
      slots: Array.from({ length: n }, (_, i) => genericSlot(`{S${i}}`)),
    };
  }
  const reaskCallCount = () =>
    callClaudeMock.mock.calls.filter((c) => isReask(c[0] as { label?: string })).length;

  // (a) 30 slots → ⌈30/12⌉ = 3 calls; schema keys disjoint and together = all 30.
  it("splits a 30-slot slide into 3 calls whose schema keys are disjoint and cover every slot", async () => {
    echoAllKeys();
    const all = Array.from({ length: 30 }, (_, i) => `{S${i}}`);
    const profile = profileWith([slideWithSlots(1, 30)]);

    const { sections, failedSections } = await generateSectionsFromProfile(profile, ctx);

    expect(callClaudeMock).toHaveBeenCalledTimes(3);
    const keySets = [callSchemaKeys(0), callSchemaKeys(1), callSchemaKeys(2)];
    expect(keySets.map((k) => k.length)).toEqual([12, 12, 6]); // ≤12 each
    // Disjoint: no placeholder appears in two calls.
    const flat = keySets.flat();
    expect(new Set(flat).size).toBe(flat.length);
    // Union = every one of the slide's placeholders.
    expect([...flat].sort()).toEqual([...all].sort());
    // All 30 map back to sections, none failed.
    expect(sections).toHaveLength(30);
    expect(failedSections).toEqual([]);
  });

  // A chunk's prompt names the slide's OTHER slots as coherence context (not as
  // schema keys) so a split slide still reads as one whole (#2 of the fix). Each
  // sibling carries its INTENT — a bare placeholder name gives the coherence
  // instruction nothing to work with (routine polish finding).
  it("names sibling placeholders with their intent as context in a chunked slide's prompt", async () => {
    echoAllKeys();
    const profile = profileWith([slideWithSlots(1, 30)]);

    await generateSectionsFromProfile(profile, ctx);

    const call0 = callClaudeMock.mock.calls[0][0] as SlideCall & { system: string };
    // {S29} lives in call 2's schema, so on call 0 it can only be a context sibling.
    expect(callSchemaKeys(0)).not.toContain("{S29}");
    expect(call0.system).toContain("Övriga sektioner på samma slide");
    // Placeholder AND its intent, on the "- {P}: intent" line form.
    expect(call0.system).toContain(`- "{S29}": intent {S29}`);
  });

  // (b) one CHUNK rejecting fails only that chunk's slots; the slide's other
  // chunk survives (chunk-level isolation, not slide-level).
  it("isolates a chunk failure — its slots fail, the slide's other chunk survives", async () => {
    // 15 slots → chunk1 {S0}..{S11}, chunk2 {S12},{S13},{S14}. Reject chunk2.
    callClaudeMock.mockImplementation(async (opts: SlideCall) => {
      const keys = Object.keys(opts.schema.shape);
      if (keys.includes("{S12}")) throw new Error("boom");
      const out: Record<string, string> = {};
      for (const key of keys) out[key] = `text ${key}`;
      return out;
    });
    const profile = profileWith([slideWithSlots(1, 15)]);

    const { sections, failedSections } = await generateSectionsFromProfile(profile, ctx);

    // chunk1's 12 slots survive...
    expect(sections.map((s) => s.key)).toEqual(
      Array.from({ length: 12 }, (_, i) => `generic-prose:{S${i}}`),
    );
    // ...only chunk2's 3 slots fail. No re-ask (a reject is not re-asked).
    expect(failedSections).toEqual([
      { placeholder: "{S12}", error: "boom" },
      { placeholder: "{S13}", error: "boom" },
      { placeholder: "{S14}", error: "boom" },
    ]);
    expect(reaskCallCount()).toBe(0);
  });

  // (c) a re-ask that gathers >12 targets is itself chunked ≤12 → multiple re-ask
  // calls, and every re-filled slot merges back into sections.
  it("chunks the re-ask when >12 slots come back empty (multiple re-ask calls, correct merge)", async () => {
    // Leave {S0}..{S12} (13 keys) empty on wave 1 → 13 re-ask targets → 2 re-ask
    // calls (12 + 1). The re-ask fills them all.
    const emptyOnWave1 = Array.from({ length: 13 }, (_, i) => `{S${i}}`);
    mockWaveThenReask(emptyOnWave1);
    const profile = profileWith([slideWithSlots(1, 30)]);

    const { sections, failedSections } = await generateSectionsFromProfile(profile, ctx);

    // 3 wave-1 chunk calls + 2 re-ask chunk calls.
    expect(callClaudeMock).toHaveBeenCalledTimes(5);
    expect(reaskCallCount()).toBe(2);
    const reaskCalls = callClaudeMock.mock.calls
      .map((c) => c[0] as SlideCall & { label?: string })
      .filter((o) => isReask(o));
    expect(reaskCalls.map((o) => Object.keys(o.schema.shape).length)).toEqual([12, 1]);
    // Re-ask key union = exactly the 13 empties, disjoint across the 2 calls.
    const reaskKeys = reaskCalls.flatMap((o) => Object.keys(o.schema.shape));
    expect(new Set(reaskKeys).size).toBe(reaskKeys.length);
    expect([...reaskKeys].sort()).toEqual([...emptyOnWave1].sort());
    // Every slot filled in the end — nothing failed, all 30 sections present.
    expect(failedSections).toEqual([]);
    expect(sections).toHaveLength(30);
  });
});
