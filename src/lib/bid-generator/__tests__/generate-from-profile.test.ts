// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import type { RfpAnalysis } from "@/lib/types";
import type { TemplateProfile, SlideProfile } from "@/lib/pptx-template/template-profile";
import type { BidContext } from "../context";

// callClaude is the paid Sonnet call — mocked so the generator runs offline
// while the REAL buildGenericProseSlideSections executes. The mock reads the
// per-slide schema it was handed and echoes one string per placeholder, so we
// can assert call count (one per slide), schema keys (= slide placeholders) and
// how the response maps back to sections.
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

  // The empty-string path requires the schema itself to accept "" — a .min(1)
  // would instead fail Zod client-side and (after paid retries) sink the slide.
  it("builds the slide schema without a min-length gate (empty string parses)", async () => {
    echoAllKeys();
    const profile = profileWith([
      { source: 1, capability: "generic-prose", slots: [genericSlot("{A}")] },
    ]);

    await generateSectionsFromProfile(profile, ctx);

    const arg = callClaudeMock.mock.calls[0][0] as SlideCall;
    expect(arg.schema.safeParse({ "{A}": "" }).success).toBe(true);
  });

  // Bounds in-flight SLIDES (not one giant Promise.all over every slide). F5
  // raised SLIDE_CONCURRENCY 3→6 to keep 12 slides under Vercel's 300 s ceiling,
  // so 9 slides now peak at 6 (chunk 1 = 6 in flight), not 3.
  it("caps concurrency at 6 slides (chunked, not unbounded)", async () => {
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
      Array.from({ length: 9 }, (_, i): SlideProfile => ({
        source: i + 1,
        capability: "generic-prose",
        slots: [genericSlot(`{S${i}}`)],
      })),
    );

    const { sections } = await generateSectionsFromProfile(profile, ctx);

    expect(sections).toHaveLength(9);
    expect(callClaudeMock).toHaveBeenCalledTimes(9);
    expect(peak).toBe(6);
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
});
