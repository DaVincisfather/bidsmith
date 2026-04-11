import PptxGenJS from "pptxgenjs";
import { BidSection, StyleGuide } from "../types";
import { renderCoverSlide } from "./cover";
import { renderSectionDividerSlide } from "./section-divider";
import { renderProseSlide, renderBulletsSlide } from "./content-two-col";
import { renderThreeColumnSlide } from "./content-three-col";
import { renderPhaseDetailSlides } from "./phase-detail";
import { renderGanttSlide } from "./gantt";
import { renderTeamSlides } from "./team-cards";
import { renderRequirementMatrixSlide } from "./requirement-matrix";
import { renderReferencesSlides } from "./references";
import { renderPlaceholderSlide } from "./placeholder";

export async function renderBidToPptx(
  sections: BidSection[],
  styleGuide: StyleGuide
): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Agentic Dealflow";

  const totalSlides = sections.length; // approximate
  let slideNum = 1;

  for (const section of sections) {
    const content = section.content;

    switch (content.format) {
      case "cover":
        renderCoverSlide(pptx, { title: content.title, client: content.client, date: content.date }, styleGuide);
        break;

      case "section-divider":
        renderSectionDividerSlide(pptx, {
          title: section.title,
          sectionNumber: content.sectionNumber,
          subtitle: content.subtitle,
        }, styleGuide, slideNum, totalSlides);
        break;

      case "prose":
        renderProseSlide(pptx, { title: section.title, text: content.text }, styleGuide, slideNum, totalSlides);
        break;

      case "bullets":
        renderBulletsSlide(pptx, { title: section.title, items: content.items }, styleGuide, slideNum, totalSlides);
        break;

      case "three-column":
        renderThreeColumnSlide(pptx, { title: section.title, columns: content.columns }, styleGuide, slideNum, totalSlides);
        break;

      case "phases":
        renderPhaseDetailSlides(pptx, content.phases, styleGuide, slideNum, totalSlides);
        slideNum += content.phases.length - 1; // extra slides
        break;

      case "gantt":
        renderGanttSlide(pptx, { phases: content.phases, milestones: content.milestones }, styleGuide, slideNum, totalSlides);
        break;

      case "team": {
        const teamSlides = renderTeamSlides(pptx, content.members, styleGuide, slideNum, totalSlides);
        slideNum += teamSlides - 1;
        break;
      }

      case "requirement-matrix":
        renderRequirementMatrixSlide(pptx, { rows: content.rows, consultantNames: content.consultantNames }, styleGuide, slideNum, totalSlides);
        break;

      case "references": {
        const refSlides = renderReferencesSlides(pptx, content.references, styleGuide, slideNum, totalSlides);
        slideNum += refSlides - 1;
        break;
      }

      case "placeholder":
        renderPlaceholderSlide(pptx, { title: section.title, instruction: content.instruction }, styleGuide, slideNum, totalSlides);
        break;
    }

    slideNum++;
  }

  const output = await pptx.write({ outputType: "nodebuffer" });
  return output as Buffer;
}
