import PptxGenJS from "pptxgenjs";
import { StyleGuide } from "../types";
import { LAYOUT, hexToRgb, deriveColors } from "./constants";

interface SectionDividerData {
  title: string;
  sectionNumber: number;
  subtitle: string;
}

export function renderSectionDividerSlide(
  pptx: PptxGenJS,
  data: SectionDividerData,
  style: StyleGuide,
  slideNumber: number,
  totalSlides: number
): void {
  const slide = pptx.addSlide();
  const c = style.colors;
  const derived = deriveColors(c);

  slide.background = { color: hexToRgb(c.light) };

  // Left sidebar
  slide.addShape("rect", {
    x: 0, y: 0,
    w: LAYOUT.sidebarW, h: LAYOUT.slideH,
    fill: { color: hexToRgb(c.primary) },
  });

  // Large faded number
  const numStr = String(data.sectionNumber).padStart(2, "0");
  slide.addText(numStr, {
    x: 8, y: 1.5,
    w: 5, h: 4.5,
    fontSize: 140, fontFace: style.font,
    color: derived.headerBgLight, bold: true,
    align: "right", valign: "middle",
  });

  // "Avsnitt 02" label
  slide.addShape("rect", {
    x: 0.8, y: 3.0,
    w: 0.4, h: 0.04,
    fill: { color: hexToRgb(c.secondary) },
  });

  slide.addText(`AVSNITT ${numStr}`, {
    x: 1.35, y: 2.88,
    w: 3, h: 0.3,
    fontSize: 9, fontFace: style.font,
    color: hexToRgb(c.secondary),
    bold: true, charSpacing: 3,
  });

  // Title
  slide.addText(data.title, {
    x: 0.8, y: 3.3,
    w: 8, h: 0.7,
    fontSize: 28, fontFace: style.font,
    color: hexToRgb(c.primary), bold: true,
  });

  // Subtitle
  slide.addText(data.subtitle, {
    x: 0.8, y: 4.05,
    w: 8, h: 0.4,
    fontSize: 13, fontFace: style.font,
    color: hexToRgb(c.muted),
  });

  // Footer
  slide.addText(`${slideNumber} / ${totalSlides}`, {
    x: LAYOUT.slideW - 1.5, y: LAYOUT.slideH - LAYOUT.footerH,
    w: 1.2, h: LAYOUT.footerH,
    fontSize: 7, fontFace: style.font,
    color: hexToRgb(c.muted), align: "right", valign: "middle",
  });

  // Bottom accent bar
  slide.addShape("rect", {
    x: 0, y: LAYOUT.slideH - 0.05,
    w: LAYOUT.slideW * 0.4, h: 0.05,
    fill: { color: hexToRgb(c.primary) },
  });
}
