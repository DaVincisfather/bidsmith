import PptxGenJS from "pptxgenjs";
import { StyleGuide } from "../types";
import { hexToRgb } from "./constants";
import { addMasterElements } from "./master";

interface PlaceholderData {
  title: string;
  instruction: string;
}

export function renderPlaceholderSlide(
  pptx: PptxGenJS,
  data: PlaceholderData,
  style: StyleGuide,
  slideNumber: number,
  totalSlides: number
): void {
  const slide = pptx.addSlide();
  addMasterElements(slide, {
    title: data.title,
    style,
    slideNumber,
    totalSlides,
  });

  slide.addText(data.instruction, {
    x: 2, y: 2.5,
    w: 9, h: 2.5,
    fontSize: 16, fontFace: style.font,
    color: hexToRgb(style.colors.muted),
    align: "center", valign: "middle", italic: true,
  });
}
