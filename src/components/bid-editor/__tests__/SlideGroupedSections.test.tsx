import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SlideGroupedSections } from "../SlideGroupedSections";
import { groupSectionsBySlide, type SlotMeta } from "@/lib/bid-editor/slot-meta";
import type { BidSection, StyleGuide } from "@/lib/types";

const style = { colors: {}, font: "Calibri", logoUrl: "" } as unknown as StyleGuide;
const meta: SlotMeta = {
  "{Metod}": { slide: 2, shortField: false, intent: "Beskriv metoden", budgetChars: 540 },
  "{Dnr}": { slide: 2, shortField: true, intent: "Diarienummer", budgetChars: 40 },
};

function proseSection(key: string, placeholder: string): BidSection {
  return {
    type: "ai", key, title: key, generatedAt: "",
    content: { format: "generic-prose", placeholder, text: "x" },
  } as BidSection;
}

describe("SlideGroupedSections", () => {
  it("renderar sliderubrik, döljer kortfält, visar okända under Övriga rutor", () => {
    const sections = [
      proseSection("s-metod", "{Metod}"),
      proseSection("s-dnr", "{Dnr}"),
      proseSection("s-okand", "{Okänd}"),
    ];
    const grouped = groupSectionsBySlide(sections, meta);
    render(
      <SlideGroupedSections grouped={grouped} slotMeta={meta} style={style}
        onSectionChange={vi.fn()} registerSlideRef={vi.fn()} onActivate={vi.fn()} />,
    );
    expect(screen.getByText(/slide 2 · 1 ruta/i)).toBeInTheDocument();
    expect(screen.getByText("Beskriv metoden")).toBeInTheDocument();
    expect(screen.queryByText("Diarienummer")).not.toBeInTheDocument();
    expect(screen.getByText(/övriga rutor · 1/i)).toBeInTheDocument();
    expect(screen.getByText("{Okänd}")).toBeInTheDocument();
  });
});
