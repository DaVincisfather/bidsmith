import PptxGenJS from "pptxgenjs";
import { ExecutionPhase, StyleGuide } from "../types";
import { LAYOUT, hexToRgb, PHASE_BAR_COLORS } from "./constants";
import { addMasterElements } from "./master";

interface GanttData {
  phases: ExecutionPhase[];
  milestones?: { label: string; afterPhase: number }[];
}

// Parse duration like "4 veckor", "2 månader" into approximate months
function durationToMonths(duration: string): number {
  const lower = duration.toLowerCase();
  const num = parseFloat(lower) || 1;
  if (lower.includes("vecka") || lower.includes("veckor")) return num / 4;
  if (lower.includes("månad") || lower.includes("månader")) return num;
  if (lower.includes("dag") || lower.includes("dagar")) return num / 30;
  return num / 4; // default: assume weeks
}

export function renderGanttSlide(
  pptx: PptxGenJS,
  data: GanttData,
  style: StyleGuide,
  slideNumber: number,
  totalSlides: number
): void {
  const slide = pptx.addSlide();
  const c = style.colors;

  addMasterElements(slide, {
    title: "Tidplan med hållpunkter",
    style, slideNumber, totalSlides,
  });

  const { phases } = data;
  const totalMonths = phases.reduce((sum, p) => sum + durationToMonths(p.duration), 0);
  const monthCount = Math.max(Math.ceil(totalMonths), 4);

  // Gantt area
  const ganttX = LAYOUT.contentX + 2.2; // label area = 2.2"
  const ganttW = LAYOUT.contentW - 2.2;
  const ganttY = LAYOUT.contentY + 0.5;
  const rowH = 0.4;
  const monthW = ganttW / monthCount;

  // Month headers
  for (let m = 0; m < monthCount; m++) {
    slide.addShape("rect", {
      x: ganttX + m * monthW, y: ganttY - 0.35,
      w: monthW - 0.02, h: 0.3,
      fill: { color: hexToRgb(c.primaryLight) },
      rectRadius: 0.03,
    });
    slide.addText(`M${m + 1}`, {
      x: ganttX + m * monthW, y: ganttY - 0.35,
      w: monthW - 0.02, h: 0.3,
      fontSize: 8, fontFace: style.font,
      color: "FFFFFF", bold: true,
      align: "center", valign: "middle",
    });
  }

  // Phase rows
  let monthOffset = 0;
  phases.forEach((phase, i) => {
    const y = ganttY + i * (rowH + 0.12);
    const dur = durationToMonths(phase.duration);
    const barW = dur * monthW;
    const barX = ganttX + monthOffset * monthW;
    const barColor = PHASE_BAR_COLORS[i % PHASE_BAR_COLORS.length];

    // Phase label
    slide.addText(phase.name, {
      x: LAYOUT.contentX, y,
      w: 2.1, h: rowH,
      fontSize: 9, fontFace: style.font,
      color: hexToRgb(c.primary), bold: true,
      align: "right", valign: "middle",
    });

    // Bar background (light)
    slide.addShape("rect", {
      x: ganttX, y,
      w: ganttW, h: rowH,
      fill: { color: "FAFAFA" },
      rectRadius: 0.03,
    });

    // Phase bar
    slide.addShape("rect", {
      x: barX, y: y + 0.04,
      w: Math.max(barW, monthW * 0.5), h: rowH - 0.08,
      fill: { color: barColor },
      rectRadius: 0.03,
      shadow: { type: "outer", blur: 2, offset: 1, color: "000000", opacity: 0.12 },
    });

    // Hours label in bar
    if (phase.hoursEstimate) {
      slide.addText(`${phase.hoursEstimate}h`, {
        x: barX, y: y + 0.04,
        w: Math.max(barW, monthW * 0.5), h: rowH - 0.08,
        fontSize: 7, fontFace: style.font,
        color: "FFFFFF", bold: true,
        align: "center", valign: "middle",
      });
    }

    monthOffset += dur;
  });

  // Milestones
  if (data.milestones) {
    for (const ms of data.milestones) {
      let msOffset = 0;
      for (let i = 0; i < ms.afterPhase && i < phases.length; i++) {
        msOffset += durationToMonths(phases[i].duration);
      }
      const msX = ganttX + msOffset * monthW;
      const msY = ganttY + phases.length * (rowH + 0.12) + 0.1;

      slide.addShape("diamond", {
        x: msX - 0.1, y: msY,
        w: 0.2, h: 0.2,
        fill: { color: hexToRgb(c.secondary) },
      });

      slide.addText(ms.label, {
        x: msX - 0.6, y: msY + 0.25,
        w: 1.2, h: 0.2,
        fontSize: 7, fontFace: style.font,
        color: hexToRgb(c.secondary), bold: true,
        align: "center",
      });
    }
  }
}
