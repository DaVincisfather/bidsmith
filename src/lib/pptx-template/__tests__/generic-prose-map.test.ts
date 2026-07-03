import { describe, it, expect } from "vitest";
import { buildGenericProseMap } from "../applicators/generic-prose";
import type { ApplicatorContext, MasterContext } from "../types";
import type { SlideProfile } from "../template-profile";
import type { BidSection } from "../../types";

const master: MasterContext = {
  companyName: "Testbolaget AB",
  clientName: "TestKund",
  diaryNumber: "TK-1",
  bidName: "Bid",
  bidDate: "2026-07-03",
};

function ctxWith(sections: BidSection[]): ApplicatorContext {
  return { sections, master, slideNum: 1, totalSlides: 1, sourceSlide: 1 };
}

function proseSection(placeholder: string, text: string): BidSection {
  return {
    type: "ai",
    key: `generic-prose:${placeholder}`,
    title: placeholder,
    generatedAt: "2026-07-03",
    content: { format: "generic-prose", placeholder, text },
  };
}

const slide: SlideProfile = {
  source: 1,
  capability: "generic-prose",
  slots: [
    { placeholder: "{A}", capability: "generic-prose", format: "prose", intent: "", status: "generic" },
    { placeholder: "{B}", capability: "generic-prose", format: "prose", intent: "", status: "generic" },
  ],
};

describe("buildGenericProseMap", () => {
  it("maps each generic-prose slot to the text of its matching placeholder section", () => {
    const ctx = ctxWith([
      proseSection("{A}", "text A"),
      proseSection("{B}", "text B"),
    ]);
    expect(buildGenericProseMap(ctx, slide)).toEqual({ "{A}": "text A", "{B}": "text B" });
  });

  it("leaves a slot out of the map when no section matches (placeholder stays visible)", () => {
    const ctx = ctxWith([proseSection("{A}", "text A")]);
    // {B} has no section → omitted, not blanked.
    expect(buildGenericProseMap(ctx, slide)).toEqual({ "{A}": "text A" });
  });

  it("matches sections to slots by exact placeholder (no cross-fill)", () => {
    const ctx = ctxWith([proseSection("{OTHER}", "wrong")]);
    expect(buildGenericProseMap(ctx, slide)).toEqual({});
  });

  it("ignores slots whose capability is not generic-prose", () => {
    const mixed: SlideProfile = {
      source: 2,
      slots: [
        { placeholder: "{A}", capability: "generic-prose", format: "prose", intent: "", status: "generic" },
        { placeholder: "{X}", capability: "understanding", format: "prose", intent: "", status: "mapped" },
      ],
    };
    const ctx = ctxWith([proseSection("{A}", "a"), proseSection("{X}", "should be ignored")]);
    expect(buildGenericProseMap(ctx, mixed)).toEqual({ "{A}": "a" });
  });
});
