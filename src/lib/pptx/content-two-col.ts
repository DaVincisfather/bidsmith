import PptxGenJS from "pptxgenjs";
import { StyleGuide } from "../types";
import { LAYOUT, hexToRgb } from "./constants";
import { addMasterElements } from "./master";

export function renderProseSlide(
  pptx: PptxGenJS,
  data: { title: string; text: string },
  style: StyleGuide,
  slideNumber: number,
  totalSlides: number
): void {
  const slide = pptx.addSlide();
  addMasterElements(slide, { title: data.title, style, slideNumber, totalSlides });

  slide.addText(data.text, {
    x: LAYOUT.contentX, y: LAYOUT.contentY,
    w: LAYOUT.contentW, h: LAYOUT.contentH,
    fontSize: 12, fontFace: style.font,
    color: hexToRgb(style.colors.dark),
    valign: "top", lineSpacingMultiple: 1.4,
  });
}

export function renderBulletsSlide(
  pptx: PptxGenJS,
  data: { title: string; items: string[] },
  style: StyleGuide,
  slideNumber: number,
  totalSlides: number
): void {
  const slide = pptx.addSlide();
  addMasterElements(slide, { title: data.title, style, slideNumber, totalSlides });

  const bulletRows = data.items.map((item) => ({
    text: item,
    options: {
      fontSize: 12,
      fontFace: style.font,
      color: hexToRgb(style.colors.dark),
      bullet: { type: "number" as const },
      paraSpaceAfter: 10,
      lineSpacingMultiple: 1.3,
    },
  }));

  slide.addText(bulletRows, {
    x: LAYOUT.contentX, y: LAYOUT.contentY,
    w: LAYOUT.contentW, h: LAYOUT.contentH,
    valign: "top",
  });
}
