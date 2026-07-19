import { describe, it, expect } from "vitest";
import {
  packRows,
  BOTTOM_MARGIN_EMU,
  type TablePageParams,
} from "../foreign-table-pagination";

// Explicit, geometry-only params (no fixture, no XML) so the packing math is
// tested in isolation. 16:9 slide, a table starting ~1M EMU down, one header
// row, ~0.4M EMU template rows, a wide krav column at the default 18pt.
const BASE: TablePageParams = {
  slideHeightEmu: 6858000,
  tableTopEmu: 1000000,
  headerHeightsEmu: [400000],
  templateRowHeightEmu: 400000,
  kravColWidthEmu: 4000000,
  fontSizePt: null,
  bottomMarginEmu: BOTTOM_MARGIN_EMU,
};

const short = { kravText: "kort krav" };
const long = { kravText: "x".repeat(200) };

/** Flattened indices across all pages, in order. */
function flat(pages: number[][]): number[] {
  return pages.flat();
}

describe("packRows — coverage invariants", () => {
  it("covers every row index exactly once, in order (nothing dropped)", () => {
    const rows = Array.from({ length: 13 }, (_, i) => ({ kravText: `k${i}` }));
    const pages = packRows(rows, BASE);
    expect(flat(pages)).toEqual(Array.from({ length: 13 }, (_, i) => i));
  });

  it("never emits a page with zero rows when there are rows", () => {
    const rows = Array.from({ length: 9 }, () => long);
    const pages = packRows(rows, BASE);
    expect(pages.every((p) => p.length >= 1)).toBe(true);
  });

  it("returns a single empty page for no rows (slide still renders once)", () => {
    expect(packRows([], BASE)).toEqual([[]]);
  });
});

describe("packRows — geometry drives rows per page", () => {
  it("packs many short rows per page", () => {
    // band = 6858000 - 1000000 - 400000 - 457200 = 5000800; row = 400000 ⇒ 12/pg.
    const pages = packRows(Array.from({ length: 12 }, () => short), BASE);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toHaveLength(12);
  });

  it("spills to a new page once the band is full", () => {
    const pages = packRows(Array.from({ length: 13 }, () => short), BASE);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toHaveLength(12);
    expect(pages[1]).toHaveLength(1);
  });

  it("puts fewer tall (wrapping) rows per page than short rows", () => {
    const shortPages = packRows(Array.from({ length: 12 }, () => short), BASE);
    const longPages = packRows(Array.from({ length: 12 }, () => long), BASE);
    const maxShort = Math.max(...shortPages.map((p) => p.length));
    const maxLong = Math.max(...longPages.map((p) => p.length));
    expect(maxLong).toBeLessThan(maxShort);
    // Still every row placed.
    expect(flat(longPages)).toHaveLength(12);
  });

  it("gives a single over-tall row its own page rather than dropping it", () => {
    const huge = { kravText: "y".repeat(5000) };
    const pages = packRows([huge], BASE);
    expect(pages).toEqual([[0]]);
  });

  it("a wider krav column fits more characters per line ⇒ fewer wrapped pages", () => {
    const rows = Array.from({ length: 6 }, () => ({ kravText: "z".repeat(120) }));
    const narrow = packRows(rows, { ...BASE, kravColWidthEmu: 1500000 });
    const wide = packRows(rows, { ...BASE, kravColWidthEmu: 6000000 });
    expect(wide.length).toBeLessThanOrEqual(narrow.length);
  });
});
