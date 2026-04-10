import PptxGenJS from "pptxgenjs";
import { StyleGuide } from "../types";
import { LAYOUT, hexToRgb, deriveColors } from "./constants";

interface CoverData {
  title: string;
  client: string;
  date: string;
}

export function renderCoverSlide(
  pptx: PptxGenJS,
  data: CoverData,
  style: StyleGuide
): void {
  const slide = pptx.addSlide();
  const c = style.colors;
  const derived = deriveColors(c);

  // Light gradient background (solid approximation)
  slide.background = { color: derived.headerBgLight };

  // Left sidebar accent
  slide.addShape("rect", {
    x: 0, y: 0,
    w: LAYOUT.sidebarW, h: LAYOUT.slideH,
    fill: { color: hexToRgb(c.primary) },
  });

  // Decorative diagonal shape (subtle)
  slide.addShape("rect", {
    x: 7, y: 0,
    w: 6.5, h: LAYOUT.slideH,
    fill: { color: derived.headerBg },
    rotate: -5,
  });

  // "ANBUD" label with accent line
  slide.addShape("rect", {
    x: 0.8, y: 2.8,
    w: 0.5, h: 0.04,
    fill: { color: hexToRgb(c.secondary) },
  });

  slide.addText("ANBUD", {
    x: 1.45, y: 2.68,
    w: 2, h: 0.3,
    fontSize: 9, fontFace: style.font,
    color: hexToRgb(c.secondary),
    bold: true, charSpacing: 3,
  });

  // Title
  slide.addText(data.title, {
    x: 0.8, y: 3.1,
    w: 6, h: 1.4,
    fontSize: 22, fontFace: style.font,
    color: hexToRgb(c.primary), bold: true,
    valign: "top", lineSpacingMultiple: 1.2,
  });

  // Divider line
  slide.addShape("rect", {
    x: 0.8, y: 4.6,
    w: 0.8, h: 0.01,
    fill: { color: hexToRgb(c.muted) },
  });

  // Client
  slide.addText(data.client, {
    x: 0.8, y: 4.75,
    w: 5, h: 0.35,
    fontSize: 13, fontFace: style.font,
    color: hexToRgb(c.muted),
  });

  // Date
  slide.addText(data.date, {
    x: 0.8, y: 5.1,
    w: 5, h: 0.3,
    fontSize: 11, fontFace: style.font,
    color: derived.headerBorder,
  });

  // Logo placeholder bottom right
  slide.addText("LOGOTYP", {
    x: LAYOUT.slideW - 2, y: LAYOUT.slideH - 0.7,
    w: 1.5, h: 0.3,
    fontSize: 9, fontFace: style.font,
    color: derived.headerBorder,
    align: "right",
  });

  // Bottom accent bar
  slide.addShape("rect", {
    x: 0, y: LAYOUT.slideH - 0.05,
    w: LAYOUT.slideW * 0.5, h: 0.05,
    fill: { color: hexToRgb(c.primary) },
  });
}
