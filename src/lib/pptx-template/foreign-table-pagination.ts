import { charsPerLineForWidth } from "./introspect/compute-budgets";

/**
 * Foreign-table pagination (foreign-table-matrix design 2026-07-19, "Rendering —
 * radmotorn"). PURE math — no XML. The row engine clones a customer table's
 * template row once per requirement and paginates by cloning the whole slide, so
 * we need the row count that fits ONE page out of the CUSTOMER'S geometry (never
 * our own constants): available height = slide height − table top − header rows
 * − bottom margin; each requirement's row height = the template row's a:tr@h
 * scaled by the krav text's wrap estimate (formulaic answers keep every other
 * column single-line, so the krav column is the only wrapper).
 *
 * Mirrors paginateMatrixRows' greedy packing, but driven by the mapped table's
 * measured geometry instead of our slide-13 constants. Loader and applicator
 * both consume the same packRows output so their page counts and row windows
 * stay in lockstep.
 */

/** Safe margin below the table before the slide edge (EMU). ~0.5" — a modest,
 *  geometry-independent gutter so the last row never sits on the slide edge. */
export const BOTTOM_MARGIN_EMU = 457200;

export interface TablePageParams {
  /** Slide height (presentation.xml sldSz@cy), EMU. */
  slideHeightEmu: number;
  /** Table frame top (graphicFrame xfrm off@y), EMU. */
  tableTopEmu: number;
  /** Header rows' a:tr@h, EMU — left untouched, so they eat into the band. */
  headerHeightsEmu: number[];
  /** Template row's a:tr@h (EMU) — the minimum height of a generated row. */
  templateRowHeightEmu: number;
  /** Krav column's a:gridCol@w (EMU) — the wrap width for the requirement text. */
  kravColWidthEmu: number;
  /** Template row's krav-cell font size (pt); null → the shared default. */
  fontSizePt: number | null;
  bottomMarginEmu: number;
}

/** Vertical band available for generated rows on one page (EMU). */
function availableBandEmu(p: TablePageParams): number {
  const headers = p.headerHeightsEmu.reduce((sum, h) => sum + h, 0);
  return p.slideHeightEmu - p.tableTopEmu - headers - p.bottomMarginEmu;
}

/** Estimated height (EMU) of the generated row for one requirement: the template
 *  row height scaled by how many lines the krav text wraps to at the krav-column
 *  width. Other columns hold formulaic (single-line) answers, so the krav text
 *  is the only wrapper. */
function rowHeightEmu(kravText: string, p: TablePageParams): number {
  const perLine = charsPerLineForWidth(p.kravColWidthEmu, p.fontSizePt);
  const lines = Math.max(1, Math.ceil(kravText.length / perLine));
  return p.templateRowHeightEmu * lines;
}

/**
 * Packs requirement rows into pages by the customer's geometry: index-chunks,
 * one inner array per page, together covering every row index in order (all
 * requirements are always placed — coverage is the product's moat). A page never
 * holds zero rows: a single row taller than the band still gets its own page
 * rather than being dropped. No rows → a single empty page so the table slide
 * still renders once.
 */
export function packRows(
  rows: { kravText: string }[],
  p: TablePageParams,
): number[][] {
  const band = availableBandEmu(p);
  const pages: number[][] = [];
  let current: number[] = [];
  let usedEmu = 0;
  for (let i = 0; i < rows.length; i++) {
    const h = rowHeightEmu(rows[i].kravText, p);
    if (current.length > 0 && usedEmu + h > band) {
      pages.push(current);
      current = [];
      usedEmu = 0;
    }
    current.push(i);
    usedEmu += h;
  }
  if (current.length > 0) pages.push(current);
  return pages.length > 0 ? pages : [[]];
}
