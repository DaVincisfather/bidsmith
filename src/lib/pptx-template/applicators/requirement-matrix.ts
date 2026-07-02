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
 * "JA" stays static (v1 assumes met). TODO: override with NEJ/DELVIS on met===false.
 *
 * Replacement-order: row 1 uses long-form placeholders, rows 2–6 short-form;
 * insert LONGEST keys first so long-form is consumed before any shorter variant.
 */
export const MATRIX_ROWS_PER_SLIDE = 6;

const A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const EMU_PER_CM = 360000;

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
    const row = BAND_EDGES.findIndex(
      (edge, j) => j < 6 && yCm >= edge && yCm < BAND_EDGES[j + 1],
    );
    if (row < 0 || row > 5) continue;

    const xfrm = off.parentNode as Element | null;
    const ext = xfrm?.getElementsByTagNameNS(A_NS, "ext")[0];
    const cyCm = ext ? Number(ext.getAttribute("cy")) / EMU_PER_CM : 1;

    let newYCm: number;
    if (rowLines[row] === 0) {
      // Unused row → push the whole group off-canvas so the black UPPFYLLT
      // cell background and the divider rule don't linger as artifacts.
      newYCm = OFFSCREEN_CM;
    } else if (cyCm <= DIVIDER_MAX_CY_CM) {
      // Divider rule → sit at this row's bottom (next row's top).
      newYCm = tops[row + 1] - cyCm;
    } else {
      // Content/number/JA cell → shift by the row-top delta.
      newYCm = yCm + (tops[row] - OLD_ROW_TOPS[row]);
    }
    off.setAttribute("y", String(Math.round(newYCm * EMU_PER_CM)));
  }
}

export function requirementMatrixApplicator(ctx: ApplicatorContext) {
  const footer = applyFooter(ctx);

  return (slide: ISlide) => {
    const { contentMap, numberMap, jaValues, rowLines } =
      buildRequirementMatrixMaps(ctx);
    slide.modify((doc: XMLDocument) => {
      // Row numbers first, exact-match, while content cells still hold their
      // {placeholder} text (so the digit remap can't hit real content).
      replaceExactTextNodes(numberMap)(doc);
      // The "UPPFYLLT" column is a static "JA" per row — identical text, so it
      // needs occurrence-based (not value-based) blanking for unused slots.
      // Run it before the content pass so no filled requirement text with a
      // "JA" substring is matched.
      replaceNthOccurrence("JA", jaValues)(doc);
      // Paragraph-level first — catches any split-run placeholders
      replaceParagraphTextNodes(contentMap)(doc);
      // Node-level for all remaining single-run placeholders (incl. table cells)
      replaceAllTextNodes(contentMap)(doc);
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
  /** Per-slot "UPPFYLLT" values in row order — "JA" for a filled slot, "" to
   *  blank the static cell on an unused row. */
  jaValues: string[];
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
  const jaValues: string[] = [];
  const rowLines: number[] = [];

  for (let i = 1; i <= MATRIX_ROWS_PER_SLIDE; i++) {
    const row = window[i - 1]; // undefined if this page has fewer rows

    // Continuous NR column: page 2 slot 1 → "07". Blank an unused slot so the
    // final page shows empty rows without a stray number.
    numberMap[pad2(i)] = row ? pad2(base + i) : "";
    // Static "JA" cell — keep on a filled row, blank on an unused one.
    jaValues.push(row ? "JA" : "");
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

  return { contentMap, numberMap, jaValues, rowLines };
}
