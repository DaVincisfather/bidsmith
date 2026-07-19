import type { ISlide } from "pptx-automizer/dist/interfaces/islide";
import type { ApplicatorContext } from "../types";
import {
  applyFooter,
  replaceAllTextNodes,
  replaceExactTextNodes,
  replaceNthOccurrence,
  replaceParagraphTextNodes,
} from "./_footer";

/**
 * Requirement-matrix applicator (slide 13).
 *
 * Slide 13 has a PPTX table with 6 requirement row slots. The slide is a
 * cloneFrom: "requirement-matrix" slide — the loader clones it once per page of
 * MATRIX_ROWS_PER_SLIDE rows, so a bid with N requirements paginates across
 * ceil(N/6) slides instead of silently dropping rows 7+. Each clone renders its
 * own 6-row window selected by cloneIndex.
 *
 * Row numbers (01–06) are static in the template XML; we remap them to a
 * CONTINUOUS sequence per page (page 2 → 07–12) and blank the number for unused
 * slots on the final page. The remap uses exact-match replacement run BEFORE the
 * content pass — a substring remap would corrupt requirement text containing the
 * digits (e.g. "ISO 9001").
 *
 * Status text comes from rowStatus(coverage) (JA/DELVIS/NEJ), computed in the
 * content pass — not a static assumption.
 *
 * Replacement-order: row 1 uses long-form placeholders, rows 2–6 short-form;
 * insert LONGEST keys first so long-form is consumed before any shorter variant.
 */
export const MATRIX_ROWS_PER_SLIDE = 6;

const A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const P_NS = "http://schemas.openxmlformats.org/presentationml/2006/main";
const EMU_PER_CM = 360000;

// Left edge (cm) of the three body-text columns (SKA-KRAV, HUR, REFERENS).
const CONTENT_COL_X = [7.26, 25.93, 39.26];
// All body text is pinned to one size so per-box normAutofit shrink can't leave
// cells at different sizes. 15 pt = the template's smallest body size.
const BODY_FONT_SZ = "1500";

/**
 * Pins every body-text cell (the three content columns) to a single font size
 * and disables autofit, so long and short rows render at the same size instead
 * of each box shrinking its text by a different amount. Runs on the original
 * (pre-restack) geometry, identifying cells by column x + row band.
 */
function normalizeMatrixContentFont(doc: XMLDocument): void {
  const sps = Array.from(doc.getElementsByTagNameNS(P_NS, "sp"));
  for (const sp of sps) {
    const off = sp.getElementsByTagNameNS(A_NS, "off")[0];
    if (!off) continue;
    const xCm = Number(off.getAttribute("x")) / EMU_PER_CM;
    const yCm = Number(off.getAttribute("y")) / EMU_PER_CM;
    if (yCm < BAND_EDGES[0] || yCm >= BAND_EDGES[6]) continue;
    if (!CONTENT_COL_X.some((cx) => Math.abs(xCm - cx) < 0.5)) continue;

    for (const el of Array.from(sp.getElementsByTagName("*"))) {
      if (el.getAttribute("sz")) el.setAttribute("sz", BODY_FONT_SZ);
    }
    const bodyPr = sp.getElementsByTagNameNS(A_NS, "bodyPr")[0];
    if (bodyPr) {
      for (const tag of ["normAutofit", "spAutoFit", "noAutofit"]) {
        const el = bodyPr.getElementsByTagNameNS(A_NS, tag)[0];
        if (el) bodyPr.removeChild(el);
      }
      bodyPr.appendChild(doc.createElementNS(A_NS, "a:noAutofit"));
    }
  }
}

// Slide-13 geometry (cm), measured from the template. The 6 rows are packed at
// ~1.81 cm pitch into y=9.47–20.6, leaving ~5.7 cm of empty band down to the
// footer (y≈26.35). Multi-line requirement text overflows a 0.96 cm row box and
// collides with the next row. Restacking spreads the rows across the full band
// so each gets ~ROW_PITCH of vertical room.
const OLD_ROW_TOPS = [9.47, 12.08, 13.89, 15.7, 17.51, 19.32];
// A shape belongs to row i when its top y (cm) falls in [BAND_EDGES[i], [i+1]).
// Each band captures a row's number/text/JA cells plus the divider rule below it.
const BAND_EDGES = [9.3, 11.9, 13.7, 15.5, 17.3, 19.1, 26.0];
const ROWS_TOP = 9.47;
// Measured line box + row padding (cm) for content-aware row heights.
const LINE_CM = 0.66;
const ROW_PAD_CM = 1.2;
// Approx characters per line per column (col width / glyph advance), used to
// estimate how many lines a cell wraps to. The narrow REFERENS column wraps
// sooner than a naive width ratio suggests.
const CHARS_PER_LINE = { requirement: 47, hurUppfylls: 44, referens: 20 };
// A thin shape (ext cy below this) is a horizontal divider rule, positioned at
// the row's bottom rather than shifted with the row top.
const DIVIDER_MAX_CY_CM = 0.15;
// Unused rows are moved off the 28.6 cm-tall canvas so their static parts (the
// black "UPPFYLLT" cell background, the divider rule) don't show as artifacts.
const OFFSCREEN_CM = 40;

type RowStatus = "JA" | "NEJ" | "DELVIS";

// Softened compliance colours — muted hues plus fill transparency so the pills
// read calmer than pure green/amber/red while the white label stays legible.
const STATUS_COLOR: Record<RowStatus, string> = {
  JA: "4C8C5E", // muted green
  DELVIS: "C08A45", // muted amber
  NEJ: "C46A6A", // muted red
};
const STATUS_ALPHA = "82000"; // 82% opacity
// The template's UPPFYLLT pill (roundRect bg + separate text box). Each label
// gets a width wide enough to keep it on one line (a too-narrow box wraps and
// the second line is clipped by the pill height). Pills are centred in the
// UPPFYLLT column and the label is centred in the pill.
const PILL_X_CM = 21.48;
const PILL_TEXT_X_CM = 21.8;
const PILL_COLUMN_CENTER_CM = 23.28;
const PILL_W_CM: Record<RowStatus, number> = { JA: 1.21, NEJ: 1.45, DELVIS: 2.35 };

/**
 * Row-level UPPFYLLT status rolled up from the per-consultant coverage: met by
 * anyone → JA, else partially met by anyone → DELVIS, else NEJ.
 */
export function rowStatus(coverage: { status: RowStatus }[]): RowStatus {
  if (coverage.some((c) => c.status === "JA")) return "JA";
  if (coverage.some((c) => c.status === "DELVIS")) return "DELVIS";
  return "NEJ";
}

/**
 * Colours each row's UPPFYLLT pill by its status (muted green/amber/red +
 * transparency), sizes it to its label, and centres both the pill in the
 * column and the label in the pill. Runs on the original (pre-restack)
 * geometry, identifying the pill (roundRect) and its text box by column x + row
 * band. Unused rows are skipped (restack hides them).
 */
function styleStatusPills(doc: XMLDocument, statusValues: string[]): void {
  const emu = (cm: number) => String(Math.round(cm * EMU_PER_CM));
  for (const sp of Array.from(doc.getElementsByTagNameNS(P_NS, "sp"))) {
    const off = sp.getElementsByTagNameNS(A_NS, "off")[0];
    if (!off) continue;
    const xCm = Number(off.getAttribute("x")) / EMU_PER_CM;
    const yCm = Number(off.getAttribute("y")) / EMU_PER_CM;
    const row = BAND_EDGES.findIndex(
      (edge, j) => j < 6 && yCm >= edge && yCm < BAND_EDGES[j + 1],
    );
    if (row < 0 || row > 5) continue;
    const status = statusValues[row] as RowStatus | "";
    if (!status) continue;

    const width = PILL_W_CM[status];
    const leftCm = PILL_COLUMN_CENTER_CM - width / 2;
    const ext = (off.parentNode as Element | null)?.getElementsByTagNameNS(A_NS, "ext")[0];
    const prst = sp
      .getElementsByTagNameNS(A_NS, "prstGeom")[0]
      ?.getAttribute("prst");

    if (prst === "roundRect" && Math.abs(xCm - PILL_X_CM) < 0.2) {
      // Pill background: recolour (with transparency), size, centre in column.
      for (const clr of Array.from(sp.getElementsByTagNameNS(A_NS, "srgbClr"))) {
        if (clr.getAttribute("val") !== "000000") continue;
        clr.setAttribute("val", STATUS_COLOR[status]);
        const alpha =
          clr.getElementsByTagNameNS(A_NS, "alpha")[0] ??
          clr.appendChild(doc.createElementNS(A_NS, "a:alpha"));
        (alpha as Element).setAttribute("val", STATUS_ALPHA);
      }
      ext?.setAttribute("cx", emu(width));
      off.setAttribute("x", emu(leftCm));
    } else if (Math.abs(xCm - PILL_TEXT_X_CM) < 0.2) {
      // Label box: match the pill and centre the text within it.
      ext?.setAttribute("cx", emu(width));
      off.setAttribute("x", emu(leftCm));
      const para = sp.getElementsByTagNameNS(A_NS, "p")[0];
      if (para) {
        const pPr =
          para.getElementsByTagNameNS(A_NS, "pPr")[0] ??
          para.insertBefore(doc.createElementNS(A_NS, "a:pPr"), para.firstChild);
        (pPr as Element).setAttribute("algn", "ctr");
      }
      sp.getElementsByTagNameNS(A_NS, "bodyPr")[0]?.setAttribute("anchor", "ctr");
    }
  }
}

/** Lines a cell wraps to at the template column widths. */
function estimateLines(chars: number, perLine: number): number {
  return Math.max(1, Math.ceil(chars / perLine));
}

/** Per-row height (cm): tallest column's line count × line box + padding. An
 *  empty (blanked) row collapses to a thin strip so partial pages don't gap. */
function rowHeightCm(lines: number, filled: boolean): number {
  if (!filled) return 0.6;
  return lines * LINE_CM + ROW_PAD_CM;
}

// Vertical band available for rows: from the first row top down to a safe line
// above the footer. Pagination packs rows so a page's content never crosses it.
const FOOTER_SAFE_CM = 25.8;
const AVAILABLE_BAND_CM = FOOTER_SAFE_CM - ROWS_TOP;

interface MatrixRowText {
  requirement: string;
  hurUppfylls: string;
  referens: string;
}

/** Tallest column's wrapped line count for a row. */
function rowLineCount(row: MatrixRowText): number {
  return Math.max(
    estimateLines(row.requirement.length, CHARS_PER_LINE.requirement),
    estimateLines(row.hurUppfylls.length, CHARS_PER_LINE.hurUppfylls),
    estimateLines(row.referens.length, CHARS_PER_LINE.referens),
  );
}

/**
 * Content-aware pagination: greedily packs rows into pages so a page's total
 * content height never crosses the band, and never exceeds the 6 physical row
 * slots. Long requirements therefore spill to a fresh page instead of running
 * off the slide. Loader and applicator both call this so their page counts and
 * row windows stay in lockstep. Returns the row count per page (≥ one page).
 */
export function paginateMatrixRows(rows: MatrixRowText[]): number[] {
  const pages: number[] = [];
  let count = 0;
  let usedCm = 0;
  for (const row of rows) {
    const h = rowHeightCm(rowLineCount(row), true);
    if (
      count > 0 &&
      (count >= MATRIX_ROWS_PER_SLIDE || usedCm + h > AVAILABLE_BAND_CM)
    ) {
      pages.push(count);
      count = 0;
      usedCm = 0;
    }
    count++;
    usedCm += h;
  }
  if (count > 0) pages.push(count);
  return pages.length > 0 ? pages : [0];
}

/**
 * Re-stacks the 6 fixed-position row groups with content-aware heights so each
 * row is exactly as tall as its text needs and rows pack without overlap or
 * wasted gaps. Number/text/JA cells shift with their row's top; the divider
 * rule drops to the row's computed bottom. Header, title and footer (outside
 * the row bands) are left untouched.
 */
function restackMatrixRows(doc: XMLDocument, rowLines: number[]): void {
  // Cumulative row tops from content-aware heights.
  const tops: number[] = [ROWS_TOP];
  for (let i = 0; i < 6; i++) {
    const h = rowHeightCm(rowLines[i], rowLines[i] > 0);
    tops.push(tops[i] + h);
  }

  const offs = Array.from(doc.getElementsByTagNameNS(A_NS, "off"));
  for (const off of offs) {
    const yEmu = Number(off.getAttribute("y"));
    if (!Number.isFinite(yEmu)) continue;
    const yCm = yEmu / EMU_PER_CM;
    const xCm = Number(off.getAttribute("x")) / EMU_PER_CM;
    const row = BAND_EDGES.findIndex(
      (edge, j) => j < 6 && yCm >= edge && yCm < BAND_EDGES[j + 1],
    );
    if (row < 0 || row > 5) continue;

    const xfrm = off.parentNode as Element | null;
    const ext = xfrm?.getElementsByTagNameNS(A_NS, "ext")[0];
    const cyCm = ext ? Number(ext.getAttribute("cy")) / EMU_PER_CM : 1;
    // The single-line row markers — the NR number and the status pill/label —
    // are vertically centred in the row (multi-line body cells stay top-aligned).
    const isMarker =
      (xCm >= 3.0 && xCm <= 6.5) || (xCm >= 21.0 && xCm <= 24.5);

    let newYCm: number;
    if (rowLines[row] === 0) {
      // Unused row → push the whole group off-canvas so the black UPPFYLLT
      // cell background and the divider rule don't linger as artifacts.
      newYCm = OFFSCREEN_CM;
    } else if (cyCm <= DIVIDER_MAX_CY_CM) {
      // Divider rule → sit at this row's bottom (next row's top).
      newYCm = tops[row + 1] - cyCm;
    } else if (isMarker) {
      // Centre the marker box in the row, and centre its text within the box.
      newYCm = tops[row] + (tops[row + 1] - tops[row] - cyCm) / 2;
      const sp = xfrm?.parentNode?.parentNode as Element | null;
      sp?.getElementsByTagNameNS(A_NS, "bodyPr")[0]?.setAttribute("anchor", "ctr");
    } else {
      // Content cell → shift by the row-top delta (stays top-aligned).
      newYCm = yCm + (tops[row] - OLD_ROW_TOPS[row]);
    }
    off.setAttribute("y", String(Math.round(newYCm * EMU_PER_CM)));
  }
}

export function requirementMatrixApplicator(ctx: ApplicatorContext) {
  const footer = applyFooter(ctx);

  return (slide: ISlide) => {
    const { contentMap, numberMap, statusValues, rowLines } =
      buildRequirementMatrixMaps(ctx);
    slide.modify((doc: XMLDocument) => {
      // Row numbers first, exact-match, while content cells still hold their
      // {placeholder} text (so the digit remap can't hit real content).
      replaceExactTextNodes(numberMap)(doc);
      // The "UPPFYLLT" column is a static "JA" per row — identical text, so set
      // each row's actual status (JA/NEJ/DELVIS, or "" for unused) by occurrence.
      // Run it before the content pass so no filled requirement text with a
      // "JA" substring is matched.
      replaceNthOccurrence("JA", statusValues)(doc);
      // Paragraph-level first — catches any split-run placeholders
      replaceParagraphTextNodes(contentMap)(doc);
      // Node-level for all remaining single-run placeholders (incl. table cells)
      replaceAllTextNodes(contentMap)(doc);
      // Pin all body text to one size (before restack, while y is original).
      normalizeMatrixContentFont(doc);
      // Colour the status pills (before restack, while y is original).
      styleStatusPills(doc, statusValues);
      // Spread the rows with content-aware heights so multi-line text doesn't overlap.
      restackMatrixRows(doc, rowLines);
      // Footer last
      footer(doc);
    });
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function buildRequirementMatrixMaps(ctx: ApplicatorContext): {
  contentMap: Record<string, string>;
  numberMap: Record<string, string>;
  /** Per-slot "UPPFYLLT" status in row order — JA/NEJ/DELVIS for a filled slot,
   *  "" to blank the static cell on an unused row. */
  statusValues: string[];
  /** Estimated wrapped line count per slot (0 for an unused row) — drives the
   *  content-aware row heights in restackMatrixRows. */
  rowLines: number[];
} {
  const sec = ctx.sections.find(
    (s) => s.content?.format === "requirement-matrix-v2",
  );
  // Missing section → empty rows, so the loop below blanks every slot (numbers
  // included) rather than leaving the raw {placeholders} on the guaranteed
  // min-1 page.
  const rows =
    sec && sec.content?.format === "requirement-matrix-v2"
      ? sec.content.rows
      : [];

  // This page's window comes from content-aware pagination (same call the
  // loader uses), so a page holds as many rows as fit — not a fixed 6.
  const cloneIndex = ctx.cloneIndex ?? 0;
  const pageSizes = paginateMatrixRows(rows);
  const base = pageSizes.slice(0, cloneIndex).reduce((sum, n) => sum + n, 0);
  const window = rows.slice(base, base + (pageSizes[cloneIndex] ?? 0));

  const contentMap: Record<string, string> = {};
  const numberMap: Record<string, string> = {};
  const statusValues: string[] = [];
  const rowLines: number[] = [];

  for (let i = 1; i <= MATRIX_ROWS_PER_SLIDE; i++) {
    const row = window[i - 1]; // undefined if this page has fewer rows

    // Continuous NR column: page 2 slot 1 → "07". Blank an unused slot so the
    // final page shows empty rows without a stray number.
    numberMap[pad2(i)] = row ? pad2(base + i) : "";
    // UPPFYLLT status rolled up from coverage — blank on an unused row.
    statusValues.push(row ? rowStatus(row.coverage) : "");
    // Tallest column's wrapped line count → row height (0 for an unused row).
    rowLines.push(
      row
        ? Math.max(
            estimateLines(row.requirement.length, CHARS_PER_LINE.requirement),
            estimateLines(row.hurUppfylls.length, CHARS_PER_LINE.hurUppfylls),
            estimateLines(row.referens.length, CHARS_PER_LINE.referens),
          )
        : 0,
    );

    if (i === 1) {
      // Row 1: long-form placeholder keys
      const reqKey =
        "{Ska-krav 1 — formulering enligt upphandlingsunderlag}";
      const hurKey = "{Hur krav 1 uppfylls — konkret beskrivning}";
      const cvKey = "{CV/ref 1}";

      contentMap[reqKey] = row ? row.requirement : "";
      contentMap[hurKey] = row ? row.hurUppfylls : "";
      contentMap[cvKey] = row ? row.referens : "";
    } else {
      // Rows 2–6: short-form placeholder keys
      contentMap[`{Ska-krav ${i}}`] = row ? row.requirement : "";
      contentMap[`{Hur krav ${i} uppfylls}`] = row ? row.hurUppfylls : "";
      contentMap[`{CV/ref ${i}}`] = row ? row.referens : "";
    }
  }

  return { contentMap, numberMap, statusValues, rowLines };
}
