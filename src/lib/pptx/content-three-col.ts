import PptxGenJS from "pptxgenjs";
import { StyleGuide } from "../types";
import { LAYOUT, hexToRgb, PHASE_BAR_COLORS } from "./constants";
import { addMasterElements } from "./master";

interface ThreeColumnData {
  title: string;
  columns: { title: string; icon: string; body: string }[];
}

const COLUMN_COLORS = [
  PHASE_BAR_COLORS[0], // orange
  PHASE_BAR_COLORS[1], // green
  PHASE_BAR_COLORS[2], // blue
];

export function renderThreeColumnSlide(
  pptx: PptxGenJS,
  data: ThreeColumnData,
  style: StyleGuide,
  slideNumber: number,
  totalSlides: number
): void {
  const slide = pptx.addSlide();
  addMasterElements(slide, { title: data.title, style, slideNumber, totalSlides });

  const cols = data.columns.slice(0, 3); // max 3
  const colW = (LAYOUT.contentW - 0.3) / 3; // 0.15 gap × 2
  const colH = LAYOUT.contentH;

  cols.forEach((col, i) => {
    const x = LAYOUT.contentX + i * (colW + 0.15);
    const y = LAYOUT.contentY;
    const barColor = COLUMN_COLORS[i % COLUMN_COLORS.length];

    // Card background
    slide.addShape("rect", {
      x, y, w: colW, h: colH,
      fill: { color: hexToRgb(style.colors.light) },
      rectRadius: 0.05,
    });

    // Top accent bar
    slide.addShape("rect", {
      x, y, w: colW, h: 0.06,
      fill: { color: barColor },
    });

    // Icon circle
    slide.addShape("ellipse", {
      x: x + 0.15, y: y + 0.2,
      w: 0.3, h: 0.3,
      fill: { color: barColor },
    });

    slide.addText(col.icon, {
      x: x + 0.15, y: y + 0.2,
      w: 0.3, h: 0.3,
      fontSize: 12, fontFace: style.font,
      color: "FFFFFF", bold: true,
      align: "center", valign: "middle",
    });

    // Column title
    slide.addText(col.title, {
      x: x + 0.55, y: y + 0.2,
      w: colW - 0.7, h: 0.3,
      fontSize: 11, fontFace: style.font,
      color: hexToRgb(style.colors.primary), bold: true,
      valign: "middle",
    });

    // Body text
    slide.addText(col.body, {
      x: x + 0.15, y: y + 0.65,
      w: colW - 0.3, h: colH - 0.8,
      fontSize: 9, fontFace: style.font,
      color: hexToRgb(style.colors.dark),
      valign: "top", lineSpacingMultiple: 1.5,
    });
  });
}
