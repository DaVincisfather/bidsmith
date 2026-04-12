// @vitest-environment node
import { describe, it, expect } from "vitest";
import PptxGenJS from "pptxgenjs";
import { renderTeamSlides } from "../pptx/team-cards";
import { renderReferencesSlides } from "../pptx/references";
import { StyleGuide } from "../types";

const mockStyleGuide: StyleGuide = {
  colors: {
    primary: "#1F5E63", primaryLight: "#2D7A7F",
    secondary: "#8FAF9A", secondaryLight: "#B3CABA",
    accent: "#1F5E63", dark: "#1A1A1A",
    light: "#E8E6DF", muted: "#6B7280",
  },
  font: "Calibri", logoUrl: "",
};

describe("team-cards pagination", () => {
  it("renders 5 members across 2 slides (3 + 2)", () => {
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    const members = Array.from({ length: 5 }, (_, i) => ({
      consultantId: `c${i}`,
      name: `Konsult ${i + 1}`,
      role: "Konsult",
      relevantExperience: "Erfarenhet",
      keyCompetencies: ["Kompetens"],
    }));
    const slidesCreated = renderTeamSlides(pptx, members, mockStyleGuide, 10, 14);
    expect(slidesCreated).toBe(2);
  });
});

describe("references pagination", () => {
  it("renders 5 references across 2 slides (3 + 2)", () => {
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    const refs = Array.from({ length: 5 }, (_, i) => ({
      title: `Ref ${i + 1}`, client: "Kund", year: 2024,
      description: "Beskrivning", relevance: "Relevant",
    }));
    const slidesCreated = renderReferencesSlides(pptx, refs, mockStyleGuide, 12, 14);
    expect(slidesCreated).toBe(2);
  });
});
