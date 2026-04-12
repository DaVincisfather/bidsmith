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
import { renderPhaseDetailSlides } from "../pptx/phase-detail";
import { renderGanttSlide } from "../pptx/gantt";

const mockStyleGuide: StyleGuide = {
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

const testPhases = [
  {
    name: "Fas 1: Uppstart",
    objective: "Kartlägg nuläge",
    activities: ["Uppstartsmöte", "Intervjuer", "Materialinventering"],
    deliverables: ["Projektplan", "Intervjulista"],
    duration: "4 veckor",
    risks: ["Underlag kan fördröjas"],
    hoursEstimate: 100,
    period: "Mars 2026",
  },
  {
    name: "Fas 2: Analys",
    objective: "Analysera data",
    activities: ["Dataanalys", "Benchmarking"],
    deliverables: ["Analysrapport"],
    duration: "6 veckor",
    hoursEstimate: 120,
    period: "April–Maj 2026",
  },
];

describe("phase and gantt renderers", () => {
  it("renders phase detail slides (one per phase)", () => {
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    expect(() =>
      renderPhaseDetailSlides(pptx, testPhases, mockStyleGuide, 7, 14)
    ).not.toThrow();
  });

  it("renders gantt slide without throwing", () => {
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    expect(() =>
      renderGanttSlide(pptx, {
        phases: testPhases,
        milestones: [{ label: "Rapport klar", afterPhase: 1 }],
      }, mockStyleGuide, 6, 14)
    ).not.toThrow();
  });
});

const fullMockSections: BidSection[] = [
  mockSections[0], // cover
  {
    type: "data",
    key: "divider-1",
    title: "Uppdragsförståelse",
    content: { format: "section-divider", sectionNumber: 1, subtitle: "Vår förståelse" },
    generatedAt: "2026-04-09",
  },
  mockSections[1], // prose (understanding)
  mockSections[2], // bullets (value-proposition)
  {
    type: "data",
    key: "three-col-1",
    title: "Tre perspektiv",
    content: {
      format: "three-column",
      columns: [
        { title: "Nuläge", icon: "N", body: "Text A" },
        { title: "Vad vi ser", icon: "V", body: "Text B" },
        { title: "Vårt uppdrag", icon: "U", body: "Text C" },
      ],
    },
    generatedAt: "2026-04-09",
  },
  {
    type: "data",
    key: "divider-2",
    title: "Genomförandeplan",
    content: { format: "section-divider", sectionNumber: 2, subtitle: "Metod och tidplan" },
    generatedAt: "2026-04-09",
  },
  {
    type: "data",
    key: "gantt",
    title: "Tidplan",
    content: {
      format: "gantt",
      phases: testPhases,
      milestones: [{ label: "Rapport klar", afterPhase: 1 }],
    },
    generatedAt: "2026-04-09",
  },
  {
    type: "ai",
    key: "execution-plan",
    title: "Genomförandeplan",
    content: { format: "phases", phases: testPhases },
    generatedAt: "2026-04-09",
  },
  {
    type: "data",
    key: "divider-3",
    title: "Team & Referenser",
    content: { format: "section-divider", sectionNumber: 3, subtitle: "Vårt team" },
    generatedAt: "2026-04-09",
  },
  mockSections[4], // team
  mockSections[5], // requirement-matrix
  mockSections[6], // references
  mockSections[7], // placeholder (pricing)
];

describe("full v2 render", () => {
  it("renders all section types into a valid PPTX", async () => {
    const buffer = await renderBidToPptx(fullMockSections, mockStyleGuide);
    expect(buffer).toBeInstanceOf(Buffer);
    // PPTX files are ZIP archives — start with PK header
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
    expect(buffer.length).toBeGreaterThan(5000);
  });
});
