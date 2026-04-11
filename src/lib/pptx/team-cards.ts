import PptxGenJS from "pptxgenjs";
import { TeamPresentation, StyleGuide } from "../types";
import { LAYOUT, hexToRgb, PHASE_BAR_COLORS } from "./constants";
import { addMasterElements } from "./master";

const MEMBERS_PER_SLIDE = 3;
const AVATAR_COLORS = [
  PHASE_BAR_COLORS[2], // blue
  PHASE_BAR_COLORS[1], // green
  PHASE_BAR_COLORS[0], // orange
];

function getInitials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

export function renderTeamSlides(
  pptx: PptxGenJS,
  members: TeamPresentation[],
  style: StyleGuide,
  startSlideNumber: number,
  totalSlides: number
): number {
  const chunks: TeamPresentation[][] = [];
  for (let i = 0; i < members.length; i += MEMBERS_PER_SLIDE) {
    chunks.push(members.slice(i, i + MEMBERS_PER_SLIDE));
  }

  chunks.forEach((chunk, ci) => {
    const slide = pptx.addSlide();
    addMasterElements(slide, {
      title: "Projektteam",
      style,
      slideNumber: startSlideNumber + ci,
      totalSlides,
    });

    const c = style.colors;
    const cardW = (LAYOUT.contentW - 0.3) / 3;
    const cardH = LAYOUT.contentH;

    chunk.forEach((member, mi) => {
      const x = LAYOUT.contentX + mi * (cardW + 0.15);
      const y = LAYOUT.contentY;

      // Card background
      slide.addShape("rect", {
        x, y, w: cardW, h: cardH,
        fill: { color: hexToRgb(c.light) },
        rectRadius: 0.05,
      });

      // Avatar circle
      const avatarColor = AVATAR_COLORS[mi % AVATAR_COLORS.length];
      const avatarX = x + (cardW - 0.5) / 2;
      slide.addShape("ellipse", {
        x: avatarX, y: y + 0.25,
        w: 0.5, h: 0.5,
        fill: { color: avatarColor },
        shadow: { type: "outer", blur: 3, offset: 2, color: "000000", opacity: 0.12 },
      });
      slide.addText(getInitials(member.name), {
        x: avatarX, y: y + 0.25,
        w: 0.5, h: 0.5,
        fontSize: 14, fontFace: style.font,
        color: "FFFFFF", bold: true,
        align: "center", valign: "middle",
      });

      // Name
      slide.addText(member.name, {
        x: x + 0.1, y: y + 0.85,
        w: cardW - 0.2, h: 0.3,
        fontSize: 11, fontFace: style.font,
        color: hexToRgb(c.primary), bold: true,
        align: "center",
      });

      // Role
      slide.addText(member.role, {
        x: x + 0.1, y: y + 1.15,
        w: cardW - 0.2, h: 0.25,
        fontSize: 9, fontFace: style.font,
        color: hexToRgb(c.secondary), bold: true,
        align: "center",
      });

      // Divider
      slide.addShape("line", {
        x: x + cardW * 0.35, y: y + 1.5,
        w: cardW * 0.3, h: 0,
        line: { color: "E0E0E0", width: 0.5 },
      });

      // Experience
      slide.addText(member.relevantExperience, {
        x: x + 0.1, y: y + 1.65,
        w: cardW - 0.2, h: 1.5,
        fontSize: 8, fontFace: style.font,
        color: hexToRgb(c.muted),
        align: "center", valign: "top", lineSpacingMultiple: 1.4,
      });

      // Competency tags
      const tagY = y + cardH - 0.6;
      const tagStr = member.keyCompetencies.join("  |  ");
      slide.addText(tagStr, {
        x: x + 0.1, y: tagY,
        w: cardW - 0.2, h: 0.4,
        fontSize: 7, fontFace: style.font,
        color: hexToRgb(c.primary),
        align: "center", valign: "middle",
      });
    });
  });

  return chunks.length;
}
