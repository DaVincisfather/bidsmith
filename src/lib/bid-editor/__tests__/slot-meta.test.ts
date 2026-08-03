import { describe, it, expect } from "vitest";
import { buildSlotMeta, groupSectionsBySlide } from "../slot-meta";
import { parseTemplateProfile } from "@/lib/pptx-template/template-profile";
import type { BidSection } from "@/lib/types";

const profile = parseTemplateProfile({
  profileVersion: 1,
  templateId: "11111111-1111-1111-1111-111111111111",
  name: "kundmall",
  version: 1,
  slides: [
    {
      source: 2,
      capability: "generic-prose",
      slots: [
        { placeholder: "{Metod}", capability: "generic-prose", format: "prose", intent: "Beskriv metoden", status: "generic", budgetChars: 540 },
        { placeholder: "{Diarienummer}", capability: "generic-prose", format: "prose", intent: "Diarienummer", status: "generic", budgetChars: 40 },
      ],
    },
    {
      source: 5,
      capability: "generic-prose",
      slots: [
        { placeholder: "{Vision}", capability: "generic-prose", format: "prose", intent: "", status: "generic" },
      ],
    },
    { source: 7, capability: "static", slots: [] },
  ],
});

function proseSection(key: string, placeholder: string, text = "x"): BidSection {
  return {
    type: "ai", key, title: key, generatedAt: "2026-07-15T00:00:00Z",
    content: { format: "generic-prose", placeholder, text },
  } as BidSection;
}

describe("buildSlotMeta", () => {
  it("mappar placeholder → slide/shortField/intent/budget", () => {
    const meta = buildSlotMeta(profile);
    expect(meta["{Metod}"]).toEqual({ slide: 2, shortField: false, intent: "Beskriv metoden", budgetChars: 540 });
    expect(meta["{Diarienummer}"].shortField).toBe(true);
    expect(meta["{Vision}"]).toEqual({ slide: 5, shortField: false, intent: "" });
  });
});

describe("groupSectionsBySlide", () => {
  it("grupperar per slide i stigande ordning, döljer kortfält, okänd placeholder → other", () => {
    const sections = [
      proseSection("s-vision", "{Vision}"),
      proseSection("s-metod", "{Metod}"),
      proseSection("s-dnr", "{Diarienummer}"),
      proseSection("s-okand", "{Gammal ruta}"),
    ];
    const grouped = groupSectionsBySlide(sections, buildSlotMeta(profile));
    expect(grouped.slides.map((g) => g.source)).toEqual([2, 5]);
    expect(grouped.slides[0].sections.map((s) => s.key)).toEqual(["s-metod"]);
    expect(grouped.hiddenShortFields).toBe(1);
    expect(grouped.other.map((s) => s.key)).toEqual(["s-okand"]);
  });

  it("icke-generic-format och sektion utan content → other (inget döljs tyst)", () => {
    const weird = { type: "ai", key: "s-x", title: "x", generatedAt: "" } as BidSection;
    const grouped = groupSectionsBySlide([weird], buildSlotMeta(profile));
    expect(grouped.other.map((s) => s.key)).toEqual(["s-x"]);
  });

  it("slide vars enda rutor är kortfält får ingen grupp", () => {
    const grouped = groupSectionsBySlide([proseSection("s-dnr", "{Diarienummer}")], buildSlotMeta(profile));
    expect(grouped.slides).toEqual([]);
    expect(grouped.hiddenShortFields).toBe(1);
  });
});
