import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionRenderer } from "../renderers";
import type { BidSection, StyleGuide } from "@/lib/types";

const style = { colors: {}, font: "Calibri", logoUrl: "" } as unknown as StyleGuide;

function section(text: string): BidSection {
  return {
    type: "ai", key: "k", title: "t", generatedAt: "",
    content: { format: "generic-prose", placeholder: "{Metod}", text },
  } as BidSection;
}

describe("SectionRenderer generic-prose med meta", () => {
  it("visar intent som etikett och räknare mot budgeten", () => {
    render(
      <SectionRenderer section={section("abc")} style={style}
        meta={{ intent: "Beskriv metoden", budgetChars: 540 }} />,
    );
    expect(screen.getByText("Beskriv metoden")).toBeInTheDocument();
    expect(screen.getByText("3/540")).toBeInTheDocument();
  });

  it("markerar överskriden budget", () => {
    render(
      <SectionRenderer section={section("abcdef")} style={style}
        meta={{ intent: "Kort", budgetChars: 5 }} />,
    );
    expect(screen.getByText("6/5")).toHaveClass("text-red-600");
  });

  it("utan meta: placeholder som etikett, ingen räknare (dagens beteende)", () => {
    render(<SectionRenderer section={section("abc")} style={style} />);
    expect(screen.getByText("{Metod}")).toBeInTheDocument();
    expect(screen.queryByText(/\/\d+$/)).not.toBeInTheDocument();
  });

  it("tom intent faller tillbaka till placeholder", () => {
    render(
      <SectionRenderer section={section("abc")} style={style}
        meta={{ intent: "  " }} />,
    );
    expect(screen.getByText("{Metod}")).toBeInTheDocument();
  });
});
