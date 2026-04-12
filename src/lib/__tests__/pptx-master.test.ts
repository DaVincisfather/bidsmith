// @vitest-environment node
import { describe, it, expect } from "vitest";
import PptxGenJS from "pptxgenjs";
import { addMasterElements } from "../pptx/master";
import { StyleGuide } from "../types";

const style: StyleGuide = {
  colors: {
    primary: "#1F5E63", primaryLight: "#2D7A7F",
    secondary: "#8FAF9A", secondaryLight: "#B3CABA",
    accent: "#1F5E63", dark: "#1A1A1A",
    light: "#E8E6DF", muted: "#6B7280",
  },
  font: "Calibri",
  logoUrl: "",
};

describe("addMasterElements", () => {
  it("adds sidebar, header, accent line, and footer without throwing", () => {
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    const slide = pptx.addSlide();
    expect(() =>
      addMasterElements(slide, {
        title: "Uppdragsförståelse",
        style,
        slideNumber: 4,
        totalSlides: 14,
      })
    ).not.toThrow();
  });
});
