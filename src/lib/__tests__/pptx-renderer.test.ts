// @vitest-environment node
import { describe, it, expect } from "vitest";
import PptxGenJS from "pptxgenjs";
import { renderBidToPptx } from "../pptx-renderer";
import { BidSection, StyleGuide } from "../types";
import { renderCoverSlide } from "../pptx/cover";
import { renderSectionDividerSlide } from "../pptx/section-divider";
import { renderPlaceholderSlide } from "../pptx/placeholder";
import { renderProseSlide, renderBulletsSlide } from "../pptx/content-two-col";
import { renderThreeColumnSlide } from "../pptx/content-three-col";

const mockStyleGuide: StyleGuide = {
  colors: {
    primary: "#1A2B4A",
    primaryLight: "#2D4A7A",
    secondary: "#E8913A",
    secondaryLight: "#F4B76E",
    accent: "#2E8B57",
    dark: "#1A1A1A",
    light: "#F5F5F0",
    muted: "#6B7280",
  },
  font: "Calibri",
  logoUrl: "",
};

const mockSections: BidSection[] = [
  {
    type: "data",
    key: "cover",
    title: "Framsida",
    content: { format: "cover", title: "Test Proposal", client: "Test Client", date: "2026-04-07" },
    generatedAt: "2026-04-07",
  },
  {
    type: "ai",
    key: "understanding",
    title: "Uppdragsförståelse",
    content: { format: "prose", text: "Vi förstår att ni söker en partner för att stödja er digitala transformation." },
    generatedAt: "2026-04-07",
  },
  {
    type: "ai",
    key: "value-proposition",
    title: "Identifierat värde",
    content: { format: "bullets", items: ["Effektivisering av processer", "Ökad digital mognad"] },
    generatedAt: "2026-04-07",
  },
  {
    type: "ai",
    key: "execution-plan",
    title: "Genomförandeplan",
    content: {
      format: "phases",
      phases: [
        { name: "Fas 1: Analys", objective: "Kartlägg nuläge", activities: ["Intervjuer", "Dokumentanalys"], deliverables: ["Nulägesrapport"], duration: "2 veckor" },
      ],
    },
    generatedAt: "2026-04-07",
  },
  {
    type: "ai",
    key: "team",
    title: "Teamet",
    content: {
      format: "team",
      members: [
        { consultantId: "c1", name: "Anna Svensson", role: "Projektledare", relevantExperience: "10 års erfarenhet", keyCompetencies: ["PM", "Agile"] },
      ],
    },
    generatedAt: "2026-04-07",
  },
  {
    type: "data",
    key: "requirement-matrix",
    title: "Kravmatris",
    content: {
      format: "requirement-matrix",
      rows: [
        { requirement: "Projektledning", priority: "must", coverage: { c1: true } },
      ],
      consultantNames: { c1: "Anna Svensson" },
    },
    generatedAt: "2026-04-07",
  },
  {
    type: "ai",
    key: "references",
    title: "Referensuppdrag",
    content: {
      format: "references",
      references: [
        { title: "Digital transformation", client: "Region VGR", year: 2024, description: "Led project", relevance: "Same domain" },
      ],
    },
    generatedAt: "2026-04-07",
  },
  {
    type: "placeholder",
    key: "pricing",
    title: "Pris & omfattning",
    content: { format: "placeholder", instruction: "Fyll i er prisbild här." },
    generatedAt: "2026-04-07",
  },
];

describe("renderBidToPptx", () => {
  it("returns a Buffer containing valid PPTX data", async () => {
    const buffer = await renderBidToPptx(mockSections, mockStyleGuide);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
    // PPTX files are ZIP archives — start with PK header
    expect(buffer[0]).toBe(0x50); // 'P'
    expect(buffer[1]).toBe(0x4b); // 'K'
  });

  it("creates slides without throwing for all section types", async () => {
    const buffer = await renderBidToPptx(mockSections, mockStyleGuide);
    expect(buffer.length).toBeGreaterThan(1000);
  });
});

describe("individual slide renderers", () => {
  it("renders cover slide without throwing", () => {
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    expect(() =>
      renderCoverSlide(pptx, {
        title: "Test Bid",
        client: "Kund AB",
        date: "2026-04-09",
      }, mockStyleGuide)
    ).not.toThrow();
  });

  it("renders section-divider slide without throwing", () => {
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    expect(() =>
      renderSectionDividerSlide(pptx, {
        title: "Genomförandeplan",
        sectionNumber: 2,
        subtitle: "Arbetssätt och metod",
      }, mockStyleGuide, 3, 14)
    ).not.toThrow();
  });

  it("renders placeholder slide without throwing", () => {
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    expect(() =>
      renderPlaceholderSlide(pptx, {
        title: "Pris",
        instruction: "Fyll i prisbild",
      }, mockStyleGuide, 14, 14)
    ).not.toThrow();
  });
});

describe("content slide renderers", () => {
  it("renders prose slide without throwing", () => {
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    expect(() =>
      renderProseSlide(pptx, { title: "Uppdragsförståelse", text: "Vi förstår ert behov." }, mockStyleGuide, 4, 14)
    ).not.toThrow();
  });

  it("renders bullets slide without throwing", () => {
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    expect(() =>
      renderBulletsSlide(pptx, { title: "Värde", items: ["Punkt 1", "Punkt 2"] }, mockStyleGuide, 5, 14)
    ).not.toThrow();
  });

  it("renders three-column slide without throwing", () => {
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    expect(() =>
      renderThreeColumnSlide(pptx, {
        title: "Vår förståelse",
        columns: [
          { title: "Nuläge", icon: "N", body: "Text 1" },
          { title: "Vad vi ser", icon: "V", body: "Text 2" },
          { title: "Vårt uppdrag", icon: "U", body: "Text 3" },
        ],
      }, mockStyleGuide, 5, 14)
    ).not.toThrow();
  });
});
