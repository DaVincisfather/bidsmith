import PptxGenJS from "pptxgenjs";
import { BidSection, StyleGuide } from "./types";

function hexToRgb(hex: string): string {
  return hex.replace("#", "");
}

function addCoverSlide(pptx: PptxGenJS, section: BidSection, style: StyleGuide) {
  if (section.content.format !== "cover") return;
  const slide = pptx.addSlide();
  slide.background = { color: hexToRgb(style.colors.primary) };

  slide.addText(section.content.title, {
    x: 0.5, y: 1.5, w: 9, h: 1.5,
    fontSize: 28, fontFace: style.font,
    color: hexToRgb(style.colors.light), bold: true, align: "center",
  });

  slide.addText(section.content.client, {
    x: 0.5, y: 3.2, w: 9, h: 0.6,
    fontSize: 18, fontFace: style.font,
    color: hexToRgb(style.colors.secondaryLight), align: "center",
  });

  slide.addText(section.content.date, {
    x: 0.5, y: 4.2, w: 9, h: 0.5,
    fontSize: 14, fontFace: style.font,
    color: hexToRgb(style.colors.muted), align: "center",
  });
}

function addProseSlide(pptx: PptxGenJS, section: BidSection, style: StyleGuide) {
  if (section.content.format !== "prose") return;
  const slide = pptx.addSlide();

  slide.addText(section.title, {
    x: 0.5, y: 0.3, w: 9, h: 0.6,
    fontSize: 22, fontFace: style.font,
    color: hexToRgb(style.colors.primary), bold: true,
  });

  slide.addText(section.content.text, {
    x: 0.5, y: 1.1, w: 9, h: 4.2,
    fontSize: 13, fontFace: style.font,
    color: hexToRgb(style.colors.dark), valign: "top", lineSpacingMultiple: 1.3,
  });
}

function addBulletsSlide(pptx: PptxGenJS, section: BidSection, style: StyleGuide) {
  if (section.content.format !== "bullets") return;
  const slide = pptx.addSlide();

  slide.addText(section.title, {
    x: 0.5, y: 0.3, w: 9, h: 0.6,
    fontSize: 22, fontFace: style.font,
    color: hexToRgb(style.colors.primary), bold: true,
  });

  const bulletRows = section.content.items.map((item) => ({
    text: item,
    options: {
      fontSize: 13, fontFace: style.font,
      color: hexToRgb(style.colors.dark),
      bullet: { code: "2022" },
      paraSpaceAfter: 8,
    },
  }));

  slide.addText(bulletRows, {
    x: 0.5, y: 1.1, w: 9, h: 4.2, valign: "top",
  });
}

function addPhasesSlides(pptx: PptxGenJS, section: BidSection, style: StyleGuide) {
  if (section.content.format !== "phases") return;

  for (const phase of section.content.phases) {
    const slide = pptx.addSlide();

    slide.addText(phase.name, {
      x: 0.5, y: 0.3, w: 9, h: 0.6,
      fontSize: 20, fontFace: style.font,
      color: hexToRgb(style.colors.primary), bold: true,
    });

    slide.addText(phase.objective, {
      x: 0.5, y: 1.0, w: 9, h: 0.5,
      fontSize: 14, fontFace: style.font,
      color: hexToRgb(style.colors.secondary), italic: true,
    });

    const activities = phase.activities.map((a) => ({
      text: a,
      options: { bullet: { code: "2022" }, fontSize: 12, fontFace: style.font, color: hexToRgb(style.colors.dark), paraSpaceAfter: 4 },
    }));
    slide.addText([
      { text: "Aktiviteter", options: { fontSize: 13, fontFace: style.font, color: hexToRgb(style.colors.primary), bold: true, paraSpaceAfter: 4 } },
      ...activities,
    ], { x: 0.5, y: 1.7, w: 4.2, h: 3.0, valign: "top" });

    const deliverables = phase.deliverables.map((d) => ({
      text: d,
      options: { bullet: { code: "2022" }, fontSize: 12, fontFace: style.font, color: hexToRgb(style.colors.dark), paraSpaceAfter: 4 },
    }));
    slide.addText([
      { text: "Leverabler", options: { fontSize: 13, fontFace: style.font, color: hexToRgb(style.colors.primary), bold: true, paraSpaceAfter: 4 } },
      ...deliverables,
    ], { x: 5.3, y: 1.7, w: 4.2, h: 3.0, valign: "top" });

    slide.addText(`Tidsåtgång: ${phase.duration}`, {
      x: 0.5, y: 4.9, w: 9, h: 0.4,
      fontSize: 11, fontFace: style.font, color: hexToRgb(style.colors.muted),
    });
  }
}

function addTeamSlide(pptx: PptxGenJS, section: BidSection, style: StyleGuide) {
  if (section.content.format !== "team") return;
  const slide = pptx.addSlide();

  slide.addText(section.title, {
    x: 0.5, y: 0.3, w: 9, h: 0.6,
    fontSize: 22, fontFace: style.font,
    color: hexToRgb(style.colors.primary), bold: true,
  });

  let yPos = 1.1;
  for (const member of section.content.members) {
    slide.addText(`${member.name} — ${member.role}`, {
      x: 0.5, y: yPos, w: 9, h: 0.4,
      fontSize: 14, fontFace: style.font,
      color: hexToRgb(style.colors.dark), bold: true,
    });
    slide.addText(member.relevantExperience, {
      x: 0.5, y: yPos + 0.4, w: 9, h: 0.3,
      fontSize: 11, fontFace: style.font, color: hexToRgb(style.colors.dark),
    });
    const comps = member.keyCompetencies.join("  |  ");
    slide.addText(comps, {
      x: 0.5, y: yPos + 0.7, w: 9, h: 0.3,
      fontSize: 10, fontFace: style.font, color: hexToRgb(style.colors.muted),
    });
    yPos += 1.2;
  }
}

function addRequirementMatrixSlide(pptx: PptxGenJS, section: BidSection, style: StyleGuide) {
  if (section.content.format !== "requirement-matrix") return;
  const slide = pptx.addSlide();

  slide.addText(section.title, {
    x: 0.5, y: 0.3, w: 9, h: 0.6,
    fontSize: 22, fontFace: style.font,
    color: hexToRgb(style.colors.primary), bold: true,
  });

  const { rows, consultantNames } = section.content;
  if (rows.length === 0) return;

  const consultantIds = Object.keys(rows[0].coverage);

  const tableRows: PptxGenJS.TableRow[] = [];

  // Header row
  const headerCells: PptxGenJS.TableCell[] = [
    { text: "Krav", options: { bold: true, fontSize: 10, fontFace: style.font, color: hexToRgb(style.colors.light), fill: { color: hexToRgb(style.colors.primary) } } },
    { text: "Prio", options: { bold: true, fontSize: 10, fontFace: style.font, color: hexToRgb(style.colors.light), fill: { color: hexToRgb(style.colors.primary) } } },
    ...consultantIds.map((id) => ({
      text: consultantNames?.[id] ?? id.substring(0, 8),
      options: { bold: true, fontSize: 10, fontFace: style.font, color: hexToRgb(style.colors.light), fill: { color: hexToRgb(style.colors.primary) }, align: "center" as const },
    })),
  ];
  tableRows.push(headerCells);

  // Data rows
  for (const row of rows) {
    const cells: PptxGenJS.TableCell[] = [
      { text: row.requirement, options: { fontSize: 9, fontFace: style.font } },
      { text: row.priority, options: { fontSize: 9, fontFace: style.font, align: "center" } },
      ...consultantIds.map((id) => ({
        text: row.coverage[id] ? "\u2713" : "\u2717",
        options: {
          fontSize: 12, fontFace: style.font, align: "center" as const,
          color: row.coverage[id] ? hexToRgb(style.colors.accent) : hexToRgb("#CC3333"),
        },
      })),
    ];
    tableRows.push(cells);
  }

  const colW = [3.5, 0.8, ...consultantIds.map(() => (9 - 4.3) / consultantIds.length)];

  slide.addTable(tableRows, {
    x: 0.5, y: 1.1, w: 9, colW,
    fontSize: 10,
    border: { type: "solid", pt: 0.5, color: hexToRgb(style.colors.muted) },
  });
}

function addReferencesSlide(pptx: PptxGenJS, section: BidSection, style: StyleGuide) {
  if (section.content.format !== "references") return;
  const slide = pptx.addSlide();

  slide.addText(section.title, {
    x: 0.5, y: 0.3, w: 9, h: 0.6,
    fontSize: 22, fontFace: style.font,
    color: hexToRgb(style.colors.primary), bold: true,
  });

  let yPos = 1.1;
  for (const ref of section.content.references) {
    slide.addText(`${ref.title} — ${ref.client} (${ref.year})`, {
      x: 0.5, y: yPos, w: 9, h: 0.35,
      fontSize: 13, fontFace: style.font,
      color: hexToRgb(style.colors.dark), bold: true,
    });
    slide.addText(ref.description, {
      x: 0.5, y: yPos + 0.35, w: 9, h: 0.3,
      fontSize: 11, fontFace: style.font, color: hexToRgb(style.colors.dark),
    });
    slide.addText(`Relevans: ${ref.relevance}`, {
      x: 0.5, y: yPos + 0.65, w: 9, h: 0.25,
      fontSize: 10, fontFace: style.font,
      color: hexToRgb(style.colors.accent), italic: true,
    });
    yPos += 1.1;
  }
}

function addPlaceholderSlide(pptx: PptxGenJS, section: BidSection, style: StyleGuide) {
  if (section.content.format !== "placeholder") return;
  const slide = pptx.addSlide();

  slide.addText(section.title, {
    x: 0.5, y: 0.3, w: 9, h: 0.6,
    fontSize: 22, fontFace: style.font,
    color: hexToRgb(style.colors.primary), bold: true,
  });

  slide.addText(section.content.instruction, {
    x: 1, y: 2, w: 8, h: 2,
    fontSize: 16, fontFace: style.font,
    color: hexToRgb(style.colors.muted),
    align: "center", valign: "middle", italic: true,
  });
}

const SLIDE_RENDERERS: Record<string, (pptx: PptxGenJS, section: BidSection, style: StyleGuide) => void> = {
  cover: addCoverSlide,
  prose: addProseSlide,
  bullets: addBulletsSlide,
  phases: addPhasesSlides,
  team: addTeamSlide,
  "requirement-matrix": addRequirementMatrixSlide,
  references: addReferencesSlide,
  placeholder: addPlaceholderSlide,
};

export async function renderBidToPptx(
  sections: BidSection[],
  styleGuide: StyleGuide
): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Agentic Dealflow";

  for (const section of sections) {
    const renderer = SLIDE_RENDERERS[section.content.format];
    if (renderer) {
      renderer(pptx, section, styleGuide);
    }
  }

  const output = await pptx.write({ outputType: "nodebuffer" });
  return output as Buffer;
}
