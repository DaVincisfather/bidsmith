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

  // (f) a key missing from the response (truncation past the schema) fails only
  // that slot — the rest of the slide survives.
  it("fails only the missing slot when the response drops a key (not the whole slide)", async () => {
    callClaudeMock.mockImplementation(async (opts: SlideCall) => {
      const out: Record<string, string> = {};
      for (const key of Object.keys(opts.schema.shape)) {
        if (key === "{Missing}") continue; // dropped by truncation
        out[key] = `text ${key}`;
      }
      return out;
    });
    const profile = profileWith([
      {
        source: 1,
        capability: "generic-prose",
        slots: [genericSlot("{Present}"), genericSlot("{Missing}"), genericSlot("{Also}")],
      },
    ]);

    const { sections, failedSections } = await generateSectionsFromProfile(profile, ctx);

    expect(sections.map((s) => s.key)).toEqual(["generic-prose:{Present}", "generic-prose:{Also}"]);
    expect(failedSections).toEqual([
      { placeholder: "{Missing}", error: "saknas i AI-svaret (trunkerat)" },
    ]);
  });

  // Bounds in-flight SLIDES (not one giant Promise.all over every slide).
  it("caps concurrency at 3 slides (chunked, not unbounded)", async () => {
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
      Array.from({ length: 7 }, (_, i): SlideProfile => ({
        source: i + 1,
        capability: "generic-prose",
        slots: [genericSlot(`{S${i}}`)],
      })),
    );

    const { sections } = await generateSectionsFromProfile(profile, ctx);

    expect(sections).toHaveLength(7);
    expect(callClaudeMock).toHaveBeenCalledTimes(7);
    expect(peak).toBe(3);
  });
});
