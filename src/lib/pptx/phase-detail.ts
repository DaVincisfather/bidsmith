import PptxGenJS from "pptxgenjs";
import { ExecutionPhase, StyleGuide } from "../types";
import { LAYOUT, hexToRgb, deriveColors, PHASE_BAR_COLORS } from "./constants";

export function renderPhaseDetailSlides(
  pptx: PptxGenJS,
  phases: ExecutionPhase[],
  style: StyleGuide,
  startSlideNumber: number,
  totalSlides: number
): void {
  const c = style.colors;
  const derived = deriveColors(c);

  phases.forEach((phase, idx) => {
    const slide = pptx.addSlide();
    const slideNum = startSlideNumber + idx;

    // Sidebar
    slide.addShape("rect", {
      x: 0, y: 0, w: LAYOUT.sidebarW, h: LAYOUT.slideH,
      fill: { color: hexToRgb(c.primary) },
    });

    // Header band
    slide.addShape("rect", {
      x: 0, y: 0, w: LAYOUT.slideW, h: LAYOUT.headerH,
      fill: { color: derived.headerBg },
    });

    // Phase number circle
    const circleColor = PHASE_BAR_COLORS[idx % PHASE_BAR_COLORS.length];
    slide.addShape("ellipse", {
      x: 0.35, y: (LAYOUT.headerH - 0.45) / 2,
      w: 0.45, h: 0.45,
      fill: { color: circleColor },
      shadow: { type: "outer", blur: 3, offset: 2, color: "000000", opacity: 0.15 },
    });
    slide.addText(String(idx + 1), {
      x: 0.35, y: (LAYOUT.headerH - 0.45) / 2,
      w: 0.45, h: 0.45,
      fontSize: 18, fontFace: style.font,
      color: "FFFFFF", bold: true,
      align: "center", valign: "middle",
    });

    // Phase title
    slide.addText(phase.name, {
      x: 0.9, y: 0, w: 7, h: LAYOUT.headerH,
      fontSize: 16, fontFace: style.font,
      color: hexToRgb(c.primary), bold: true, valign: "middle",
    });

    // Period (right)
    if (phase.period) {
      slide.addText(phase.period, {
        x: LAYOUT.slideW - 3.5, y: 0.1,
        w: 1.5, h: 0.4,
        fontSize: 10, fontFace: style.font,
        color: hexToRgb(c.muted), align: "right",
      });
    }

    // Hours badge
    if (phase.hoursEstimate) {
      slide.addShape("roundRect", {
        x: LAYOUT.slideW - 1.8, y: (LAYOUT.headerH - 0.35) / 2,
        w: 1.0, h: 0.35,
        rectRadius: 0.15,
        fill: { color: hexToRgb(c.light) },
        line: { color: hexToRgb(c.secondaryLight), width: 1 },
      });
      slide.addText(`~${phase.hoursEstimate} h`, {
        x: LAYOUT.slideW - 1.8, y: (LAYOUT.headerH - 0.35) / 2,
        w: 1.0, h: 0.35,
        fontSize: 10, fontFace: style.font,
        color: hexToRgb(c.secondary), bold: true,
        align: "center", valign: "middle",
      });
    }

    // Accent line
    slide.addShape("rect", {
      x: 0, y: LAYOUT.headerH,
      w: LAYOUT.slideW * 0.6, h: LAYOUT.accentLineH,
      fill: { color: hexToRgb(c.secondary) },
    });

    const contentY = LAYOUT.contentY;
    const rightX = LAYOUT.contentX + LAYOUT.contentW * 0.62;
    const rightW = LAYOUT.contentW * 0.35;
    const leftW = LAYOUT.contentW * 0.58;

    // Activities (left)
    slide.addText("Aktiviteter", {
      x: LAYOUT.contentX, y: contentY,
      w: leftW, h: 0.35,
      fontSize: 11, fontFace: style.font,
      color: hexToRgb(c.primary), bold: true,
    });

    const actRows = phase.activities.map((a, i) => ({
      text: `${String(i + 1).padStart(2, "0")}  ${a}`,
      options: {
        fontSize: 10, fontFace: style.font,
        color: hexToRgb(c.dark),
        paraSpaceAfter: 6,
        lineSpacingMultiple: 1.3,
      },
    }));
    slide.addText(actRows, {
      x: LAYOUT.contentX, y: contentY + 0.4,
      w: leftW, h: LAYOUT.contentH - 1.2,
      valign: "top",
    });

    // Deliverables panel (right top)
    const panelH = LAYOUT.contentH * 0.55;
    slide.addShape("rect", {
      x: rightX, y: contentY,
      w: rightW, h: panelH,
      fill: { color: hexToRgb(c.light) },
      rectRadius: 0.05,
    });

    slide.addText("Leverabler", {
      x: rightX + 0.15, y: contentY + 0.1,
      w: rightW - 0.3, h: 0.3,
      fontSize: 11, fontFace: style.font,
      color: hexToRgb(c.primary), bold: true,
    });

    const delRows = phase.deliverables.map((d) => ({
      text: d,
      options: {
        fontSize: 9, fontFace: style.font,
        color: hexToRgb(c.dark),
        bullet: { code: "2022" },
        paraSpaceAfter: 4,
      },
    }));
    slide.addText(delRows, {
      x: rightX + 0.15, y: contentY + 0.45,
      w: rightW - 0.3, h: panelH - 0.6,
      valign: "top",
    });

    // Risk panel (right bottom)
    if (phase.risks && phase.risks.length > 0) {
      const riskY = contentY + panelH + 0.1;
      const riskH = LAYOUT.contentH - panelH - 0.6;

      // Left accent border
      slide.addShape("rect", {
        x: rightX, y: riskY,
        w: 0.04, h: riskH,
        fill: { color: hexToRgb(c.secondary) },
      });

      slide.addShape("rect", {
        x: rightX + 0.04, y: riskY,
        w: rightW - 0.04, h: riskH,
        fill: { color: "FEF9F3" },
      });

      slide.addText("Risk", {
        x: rightX + 0.2, y: riskY + 0.05,
        w: rightW - 0.35, h: 0.25,
        fontSize: 9, fontFace: style.font,
        color: hexToRgb(c.secondary), bold: true,
      });

      slide.addText(phase.risks.join(". "), {
        x: rightX + 0.2, y: riskY + 0.3,
        w: rightW - 0.35, h: riskH - 0.4,
        fontSize: 8, fontFace: style.font,
        color: "7A5A2E", valign: "top", lineSpacingMultiple: 1.3,
      });
    }

    // Progress indicator (bottom)
    const dotY = LAYOUT.slideH - LAYOUT.footerH - 0.5;
    const dotSize = 0.25;
    const totalDots = phases.length;
    const totalDotsW = totalDots * dotSize + (totalDots - 1) * 0.35;
    const startX = (LAYOUT.slideW - totalDotsW) / 2;

    phases.forEach((_, di) => {
      const dx = startX + di * (dotSize + 0.35);
      const isActive = di === idx;
      const dotColor = isActive ? circleColor : "E0E0E0";

      slide.addShape("ellipse", {
        x: dx, y: dotY, w: dotSize, h: dotSize,
        fill: { color: dotColor },
      });
      slide.addText(String(di + 1), {
        x: dx, y: dotY, w: dotSize, h: dotSize,
        fontSize: 9, fontFace: style.font,
        color: isActive ? "FFFFFF" : "AAAAAA",
        align: "center", valign: "middle", bold: true,
      });

      // Connecting line
      if (di < totalDots - 1) {
        slide.addShape("line", {
          x: dx + dotSize, y: dotY + dotSize / 2,
          w: 0.35, h: 0,
          line: { color: "E0E0E0", width: 1 },
        });
      }
    });

    // Footer
    const footerY = LAYOUT.slideH - LAYOUT.footerH;
    slide.addShape("line", {
      x: 0, y: footerY, w: LAYOUT.slideW, h: 0,
      line: { color: "E0E0E0", width: 0.5 },
    });
    slide.addText("Konfidentiellt", {
      x: LAYOUT.contentX, y: footerY, w: 3, h: LAYOUT.footerH,
      fontSize: 7, fontFace: style.font, color: hexToRgb(c.muted), valign: "middle",
    });
    slide.addText(`${slideNum} / ${totalSlides}`, {
      x: LAYOUT.slideW - 1.5, y: footerY, w: 1.2, h: LAYOUT.footerH,
      fontSize: 7, fontFace: style.font, color: hexToRgb(c.muted),
      align: "right", valign: "middle",
    });
  });
}
