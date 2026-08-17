import { describe, it, expect } from "vitest";
import { buildSlotMeta } from "../slot-meta";
import { parseTemplateProfile } from "@/lib/pptx-template/template-profile";

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

describe("buildSlotMeta", () => {
  it("mappar placeholder → slide/shortField/intent/budget", () => {
    const meta = buildSlotMeta(profile);
    expect(meta["{Metod}"]).toEqual({ slide: 2, shortField: false, intent: "Beskriv metoden", budgetChars: 540 });
    expect(meta["{Diarienummer}"].shortField).toBe(true);
    expect(meta["{Vision}"]).toEqual({ slide: 5, shortField: false, intent: "" });
  });
});
