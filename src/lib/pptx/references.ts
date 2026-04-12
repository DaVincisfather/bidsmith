import PptxGenJS from "pptxgenjs";
import { BidReference, StyleGuide } from "../types";
import { LAYOUT, hexToRgb } from "./constants";
import { addMasterElements } from "./master";

const REFS_PER_SLIDE = 3;

export function renderReferencesSlides(
  pptx: PptxGenJS,
  references: BidReference[],
  style: StyleGuide,
  startSlideNumber: number,
  totalSlides: number
): number {
  const chunks: BidReference[][] = [];
  for (let i = 0; i < references.length; i += REFS_PER_SLIDE) {
    chunks.push(references.slice(i, i + REFS_PER_SLIDE));
  }

  const c = style.colors;

  chunks.forEach((chunk, ci) => {
    const slide = pptx.addSlide();
    addMasterElements(slide, {
      title: "Referensuppdrag",
      style,
      slideNumber: startSlideNumber + ci,
      totalSlides,
    });

    chunk.forEach((ref, ri) => {
      const y = LAYOUT.contentY + ri * 1.7;

      slide.addText(`${ref.title} — ${ref.client} (${ref.year})`, {
        x: LAYOUT.contentX, y,
        w: LAYOUT.contentW, h: 0.35,
        fontSize: 12, fontFace: style.font,
        color: hexToRgb(c.primary), bold: true,
      });

      slide.addText(ref.description, {
        x: LAYOUT.contentX, y: y + 0.35,
        w: LAYOUT.contentW, h: 0.35,
        fontSize: 10, fontFace: style.font,
        color: hexToRgb(c.dark),
        lineSpacingMultiple: 1.3,
      });

      slide.addText(`Relevans: ${ref.relevance}`, {
        x: LAYOUT.contentX, y: y + 0.7,
        w: LAYOUT.contentW, h: 0.25,
        fontSize: 9, fontFace: style.font,
        color: hexToRgb(c.accent), italic: true,
      });

      // Separator line (except last)
      if (ri < chunk.length - 1) {
        slide.addShape("line", {
          x: LAYOUT.contentX, y: y + 1.1,
          w: LAYOUT.contentW, h: 0,
          line: { color: "EEEEEE", width: 0.5 },
        });
      }
    });
  });

  return chunks.length;
}
