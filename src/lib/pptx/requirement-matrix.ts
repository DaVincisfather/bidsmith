import PptxGenJS from "pptxgenjs";
import { RequirementRow, StyleGuide } from "../types";
import { LAYOUT, hexToRgb } from "./constants";
import { addMasterElements } from "./master";

interface MatrixData {
  rows: RequirementRow[];
  consultantNames: Record<string, string>;
}

export function renderRequirementMatrixSlide(
  pptx: PptxGenJS,
  data: MatrixData,
  style: StyleGuide,
  slideNumber: number,
  totalSlides: number
): void {
  const slide = pptx.addSlide();
  addMasterElements(slide, { title: "Kravuppfyllnad", style, slideNumber, totalSlides });

  const { rows, consultantNames } = data;
  if (rows.length === 0) return;

  const c = style.colors;
  const consultantIds = Object.keys(rows[0].coverage);

  const tableRows: PptxGenJS.TableRow[] = [];

  // Header
  const headerCells: PptxGenJS.TableCell[] = [
    { text: "Krav", options: { bold: true, fontSize: 9, fontFace: style.font, color: "FFFFFF", fill: { color: hexToRgb(c.primary) } } },
    { text: "Prio", options: { bold: true, fontSize: 9, fontFace: style.font, color: "FFFFFF", fill: { color: hexToRgb(c.primary) }, align: "center" } },
    ...consultantIds.map((id) => ({
      text: consultantNames[id] ?? id.slice(0, 8),
      options: { bold: true, fontSize: 9, fontFace: style.font, color: "FFFFFF", fill: { color: hexToRgb(c.primary) }, align: "center" as const },
    })),
  ];
  tableRows.push(headerCells);

  // Data rows with zebra striping
  rows.forEach((row, ri) => {
    const bgColor = ri % 2 === 0 ? hexToRgb(c.light) : "FFFFFF";
    const prioColor = row.priority === "must" ? hexToRgb(c.primary) : hexToRgb(c.muted);
    const prioLabel = row.priority === "must" ? "Ska" : row.priority === "should" ? "Bör" : "Önskvärt";

    const cells: PptxGenJS.TableCell[] = [
      { text: row.requirement, options: { fontSize: 9, fontFace: style.font, fill: { color: bgColor } } },
      { text: prioLabel, options: { fontSize: 9, fontFace: style.font, align: "center", color: prioColor, bold: row.priority === "must", fill: { color: bgColor } } },
      ...consultantIds.map((id) => ({
        text: row.coverage[id] ? "\u2713" : "\u2717",
        options: {
          fontSize: 13, fontFace: style.font, align: "center" as const,
          color: row.coverage[id] ? hexToRgb(c.accent) : "CC3333",
          fill: { color: bgColor },
        },
      })),
    ];
    tableRows.push(cells);
  });

  const colW = [3.5, 0.8, ...consultantIds.map(() => (LAYOUT.contentW - 4.3) / consultantIds.length)];

  slide.addTable(tableRows, {
    x: LAYOUT.contentX, y: LAYOUT.contentY,
    w: LAYOUT.contentW, colW,
    fontSize: 9,
    border: { type: "solid", pt: 0.5, color: "E0E0E0" },
  });
}
