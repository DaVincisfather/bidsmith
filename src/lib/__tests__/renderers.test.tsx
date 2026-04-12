// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { SectionRenderer } from "@/components/bid-editor/renderers";
import { BidSection, StyleGuide } from "@/lib/types";

const testStyle: StyleGuide = {
  colors: {
    primary: "#1F5E63",
    primaryLight: "#2D7A7F",
    secondary: "#8FAF9A",
    secondaryLight: "#B3CABA",
    accent: "#1F5E63",
    dark: "#1A1A1A",
    light: "#E8E6DF",
    muted: "#6B7280",
  },
  font: "Calibri",
  logoUrl: "",
};

describe("SectionRenderer", () => {
  it("renders cover format", () => {
    const section: BidSection = {
      type: "data",
      key: "cover",
      title: "Framsida",
      content: { format: "cover", title: "Test Bid", client: "Kund AB", date: "2026-04-12" },
      generatedAt: "2026-04-12",
    };
    render(<SectionRenderer section={section} style={testStyle} />);
    expect(screen.getByText("Test Bid")).toBeDefined();
    expect(screen.getByText("Kund AB")).toBeDefined();
    expect(screen.getByText("ANBUD")).toBeDefined();
  });

  it("renders prose format", () => {
    const section: BidSection = {
      type: "ai",
      key: "understanding",
      title: "Uppdragsförståelse",
      content: { format: "prose", text: "Vi förstår ert behov." },
      generatedAt: "2026-04-12",
    };
    render(<SectionRenderer section={section} style={testStyle} />);
    expect(screen.getByText("Uppdragsförståelse")).toBeDefined();
    expect(screen.getByText("Vi förstår ert behov.")).toBeDefined();
  });

  it("renders bullets format", () => {
    const section: BidSection = {
      type: "ai",
      key: "value",
      title: "Värde",
      content: { format: "bullets", items: ["Punkt 1", "Punkt 2", "Punkt 3"] },
      generatedAt: "2026-04-12",
    };
    render(<SectionRenderer section={section} style={testStyle} />);
    expect(screen.getByText("Punkt 1")).toBeDefined();
    expect(screen.getByText("Punkt 3")).toBeDefined();
  });

  it("renders team format", () => {
    const section: BidSection = {
      type: "ai",
      key: "team",
      title: "Team",
      content: {
        format: "team",
        members: [
          {
            consultantId: "c1",
            name: "Anna Svensson",
            role: "Projektledare",
            relevantExperience: "12 år",
            keyCompetencies: ["PM", "Agil"],
          },
        ],
      },
      generatedAt: "2026-04-12",
    };
    render(<SectionRenderer section={section} style={testStyle} />);
    expect(screen.getByText("Anna Svensson")).toBeDefined();
    expect(screen.getByText("Projektledare")).toBeDefined();
    expect(screen.getByText("PM")).toBeDefined();
  });

  it("renders placeholder format", () => {
    const section: BidSection = {
      type: "placeholder",
      key: "pricing",
      title: "Pris",
      content: { format: "placeholder", instruction: "Fyll i pris." },
      generatedAt: "2026-04-12",
    };
    render(<SectionRenderer section={section} style={testStyle} />);
    expect(screen.getByText("Pris")).toBeDefined();
    expect(screen.getByText("Fyll i pris.")).toBeDefined();
  });

  it("renders section-divider format", () => {
    const section: BidSection = {
      type: "data",
      key: "divider-1",
      title: "Genomförande",
      content: { format: "section-divider", sectionNumber: 2, subtitle: "Metod och plan" },
      generatedAt: "2026-04-12",
    };
    render(<SectionRenderer section={section} style={testStyle} />);
    expect(screen.getByText("02")).toBeDefined();
    expect(screen.getByText("Metod och plan")).toBeDefined();
  });

  it("renders requirement-matrix format", () => {
    const section: BidSection = {
      type: "data",
      key: "req",
      title: "Krav",
      content: {
        format: "requirement-matrix",
        rows: [
          { requirement: "Erfarenhet", priority: "must", coverage: { c1: true } },
        ],
        consultantNames: { c1: "Anna" },
      },
      generatedAt: "2026-04-12",
    };
    render(<SectionRenderer section={section} style={testStyle} />);
    expect(screen.getByText("Erfarenhet")).toBeDefined();
    expect(screen.getByText("Anna")).toBeDefined();
  });
});
