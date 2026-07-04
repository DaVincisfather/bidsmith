// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BidSection } from "@/lib/types";
import type { TemplateProfile, SlideProfile } from "@/lib/pptx-template/template-profile";
import type { BidContext } from "../context";

// buildGenericProseSection is the paid Sonnet call — mocked so the generator is
// tested offline. The mock tracks peak in-flight calls so chunked concurrency is
// observable, and records which placeholders it was asked to generate.
const buildGenericProseSection = vi.fn();
vi.mock("../bundles/generic-prose", () => ({
  buildGenericProseSection: (...args: unknown[]) => buildGenericProseSection(...args),
}));

import { generateSectionsFromProfile } from "../generate-from-profile";

const ctx = {} as BidContext;

function section(placeholder: string): BidSection {
  return {
    type: "ai",
    key: `generic-prose:${placeholder}`,
    title: placeholder,
    content: { format: "generic-prose", placeholder, text: `text ${placeholder}` },
    generatedAt: "2026-07-04",
  };
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
  buildGenericProseSection.mockReset();
});

describe("generateSectionsFromProfile", () => {
  it("generates one section per generic-prose slot and passes slot fields through", async () => {
    buildGenericProseSection.mockImplementation(async (slot: { placeholder: string }) =>
      section(slot.placeholder),
    );
    const profile = profileWith([
      {
        source: 1,
        capability: "generic-prose",
        slots: [
          { ...genericSlot("{A}"), budgetChars: 500 },
          genericSlot("{B}"),
        ],
      },
    ]);

    const { sections, failedSections } = await generateSectionsFromProfile(profile, ctx);

    expect(sections.map((s) => s.content && s.content.format === "generic-prose" && s.content.placeholder)).toEqual([
      "{A}",
      "{B}",
    ]);
    expect(failedSections).toEqual([]);
    // budgetChars carried through when present, omitted otherwise.
    expect(buildGenericProseSection).toHaveBeenCalledWith(
      { placeholder: "{A}", intent: "intent {A}", budgetChars: 500 },
      ctx,
    );
    expect(buildGenericProseSection).toHaveBeenCalledWith(
      { placeholder: "{B}", intent: "intent {B}" },
      ctx,
    );
  });

  it("skips static slides and skip-status slots (produces nothing for them)", async () => {
    buildGenericProseSection.mockImplementation(async (slot: { placeholder: string }) =>
      section(slot.placeholder),
    );
    const profile = profileWith([
      { source: 1, capability: "static", slots: [] },
      {
        source: 2,
        capability: "generic-prose",
        slots: [genericSlot("{Keep}"), genericSlot("{Drop}", "skip")],
      },
    ]);

    const { sections } = await generateSectionsFromProfile(profile, ctx);

    expect(buildGenericProseSection).toHaveBeenCalledTimes(1);
    expect(sections).toHaveLength(1);
    const only = sections[0].content;
    expect(only && only.format === "generic-prose" && only.placeholder).toBe("{Keep}");
  });

  it("caps concurrency at 4 (chunked, not unbounded Promise.all)", async () => {
    let inFlight = 0;
    let peak = 0;
    buildGenericProseSection.mockImplementation(async (slot: { placeholder: string }) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 0));
      inFlight--;
      return section(slot.placeholder);
    });
    // 10 slots across two slides → would be 10 in-flight under Promise.all.
    const slots = Array.from({ length: 10 }, (_, i) => genericSlot(`{S${i}}`));
    const profile = profileWith([
      { source: 1, capability: "generic-prose", slots: slots.slice(0, 6) },
      { source: 2, capability: "generic-prose", slots: slots.slice(6) },
    ]);

    const { sections } = await generateSectionsFromProfile(profile, ctx);

    expect(sections).toHaveLength(10);
    expect(peak).toBe(4);
    expect(buildGenericProseSection).toHaveBeenCalledTimes(10);
  });

  it("returns successes + failedSections on partial failure (one bad slot doesn't discard the paid ones)", async () => {
    buildGenericProseSection.mockImplementation(async (slot: { placeholder: string }) => {
      if (slot.placeholder === "{Bad}") throw new Error("boom");
      return section(slot.placeholder);
    });
    const profile = profileWith([
      {
        source: 1,
        capability: "generic-prose",
        slots: [genericSlot("{Good1}"), genericSlot("{Bad}"), genericSlot("{Good2}")],
      },
    ]);

    const { sections, failedSections } = await generateSectionsFromProfile(profile, ctx);

    expect(sections).toHaveLength(2);
    expect(failedSections).toEqual([{ placeholder: "{Bad}", error: "boom" }]);
  });

  it("invokes onSectionComplete once per produced section (skips/failures excluded)", async () => {
    buildGenericProseSection.mockImplementation(async (slot: { placeholder: string }) => {
      if (slot.placeholder === "{Bad}") throw new Error("boom");
      return section(slot.placeholder);
    });
    const seen: string[] = [];
    const profile = profileWith([
      {
        source: 1,
        capability: "generic-prose",
        slots: [genericSlot("{Good}"), genericSlot("{Bad}"), genericSlot("{Skip}", "skip")],
      },
    ]);

    await generateSectionsFromProfile(profile, ctx, async (s) => {
      const c = s.content;
      if (c && c.format === "generic-prose") seen.push(c.placeholder);
    });

    expect(seen).toEqual(["{Good}"]);
  });
});
