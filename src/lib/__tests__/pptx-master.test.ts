// @vitest-environment node
import { describe, it, expect } from "vitest";
import PptxGenJS from "pptxgenjs";
import { addMasterElements } from "../pptx/master";
import { StyleGuide } from "../types";

const style: StyleGuide = {
  colors: {
    primary: "#1A2B4A", primaryLight: "#2D4A7A",
    secondary: "#E8913A", secondaryLight: "#F4B76E",
    accent: "#2E8B57", dark: "#1A1A1A",
    light: "#F5F5F0", muted: "#6B7280",
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
