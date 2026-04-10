import PptxGenJS from "pptxgenjs";
import { StyleGuide } from "../types";
import { LAYOUT, hexToRgb, deriveColors } from "./constants";

interface MasterOptions {
  title: string;
  style: StyleGuide;
  slideNumber: number;
  totalSlides: number;
  rightHeaderText?: string; // e.g. period for phase slides
}

export function addMasterElements(
  slide: PptxGenJS.Slide,
  opts: MasterOptions
): void {
  const { style, title, slideNumber, totalSlides } = opts;
  const c = style.colors;
  const derived = deriveColors(c);

  // 1. Left sidebar
  slide.addShape("rect", {
    x: 0, y: 0,
    w: LAYOUT.sidebarW, h: LAYOUT.slideH,
    fill: { color: hexToRgb(c.primary) },
  });

  // 2. Header band
  slide.addShape("rect", {
    x: 0, y: 0,
    w: LAYOUT.slideW, h: LAYOUT.headerH,
    fill: { color: derived.headerBg },
  });

  // Accent bar next to title
  slide.addShape("rect", {
    x: LAYOUT.contentX - 0.15, y: (LAYOUT.headerH - 0.25) / 2,
    w: 0.04, h: 0.25,
    fill: { color: hexToRgb(c.secondary) },
  });

  // Title text
  slide.addText(title, {
    x: LAYOUT.contentX, y: 0,
    w: 9, h: LAYOUT.headerH,
    fontSize: 16, fontFace: style.font,
    color: hexToRgb(c.primary), bold: true,
    valign: "middle",
  });

  // Logo placeholder (right)
  slide.addText("LOGOTYP", {
    x: LAYOUT.slideW - 1.5, y: 0,
    w: 1.2, h: LAYOUT.headerH,
    fontSize: 8, fontFace: style.font,
    color: derived.headerBorder,
    align: "right", valign: "middle",
  });

  // Optional right text (e.g. period)
  if (opts.rightHeaderText) {
    slide.addText(opts.rightHeaderText, {
      x: LAYOUT.slideW - 3, y: 0,
      w: 1.3, h: LAYOUT.headerH,
      fontSize: 10, fontFace: style.font,
      color: hexToRgb(c.muted),
      align: "right", valign: "middle",
    });
  }

  // 3. Accent line below header
  slide.addShape("rect", {
    x: 0, y: LAYOUT.headerH,
    w: LAYOUT.slideW * 0.6, h: LAYOUT.accentLineH,
    fill: { color: hexToRgb(c.secondary) },
  });

  // 4. Footer
  const footerY = LAYOUT.slideH - LAYOUT.footerH;

  // Footer top border
  slide.addShape("line", {
    x: 0, y: footerY,
    w: LAYOUT.slideW, h: 0,
    line: { color: "E0E0E0", width: 0.5 },
  });

  slide.addText("Konfidentiellt", {
    x: LAYOUT.contentX, y: footerY,
    w: 3, h: LAYOUT.footerH,
    fontSize: 7, fontFace: style.font,
    color: hexToRgb(c.muted), valign: "middle",
  });

  slide.addText(`${slideNumber} / ${totalSlides}`, {
    x: LAYOUT.slideW - 1.5, y: footerY,
    w: 1.2, h: LAYOUT.footerH,
    fontSize: 7, fontFace: style.font,
    color: hexToRgb(c.muted), align: "right", valign: "middle",
  });
}
