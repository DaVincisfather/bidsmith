import { describe, it, expect } from "vitest";
import {
  packRows,
  BOTTOM_MARGIN_EMU,
  type TablePageParams,
  type WrapCell,
} from "../foreign-table-pagination";

// Explicit, geometry-only params (no fixture, no XML) so the packing math is
// tested in isolation. 16:9 slide, a table starting ~1M EMU down, one header
// row, ~0.4M EMU template rows, at the default 18pt.
const BASE: TablePageParams = {
  slideHeightEmu: 6858000,
  tableTopEmu: 1000000,
  headerHeightsEmu: [400000],
  templateRowHeightEmu: 400000,
  fontSizePt: null,
  bottomMarginEmu: BOTTOM_MARGIN_EMU,
};

const KRAV_W = 4000000;
const NARROW_W = 1000000;

/** A single-content-column (krav) row of the given text. */
function kravRow(text: string): WrapCell[] {
  return [{ text, colWidthEmu: KRAV_W }];
}
const short = kravRow("kort krav");
const long = kravRow("x".repeat(200));

/** Flattened indices across all pages, in order. */
function flat(pages: number[][]): number[] {
  return pages.flat();
}

describe("packRows — coverage invariants", () => {
  it("covers every row index exactly once, in order (nothing dropped)", () => {
    const rows = Array.from({ length: 13 }, (_, i) => kravRow(`k${i}`));
    const pages = packRows(rows, BASE);
    expect(flat(pages)).toEqual(Array.from({ length: 13 }, (_, i) => i));
  });

  it("never emits a page with zero rows when there are rows", () => {
    const pages = packRows(Array.from({ length: 9 }, () => long), BASE);
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
    expect(flat(longPages)).toHaveLength(12);
  });

  it("gives a single over-tall row its own page rather than dropping it", () => {
    const pages = packRows([kravRow("y".repeat(5000))], BASE);
    expect(pages).toEqual([[0]]);
  });
});

describe("packRows — row height is the MAX wrap across mapped columns", () => {
  it("a verbose cell in a NARROW column makes the row tall even with a short krav", () => {
    // Short krav, but a long string in a narrow second column: the row must be
    // estimated by the tallest-wrapping column, not the krav column alone. This
    // is the regression the live scan caught (verbose referens in a narrow col).
    const tallByOtherCol: WrapCell[] = [
      { text: "kort", colWidthEmu: KRAV_W },
      { text: "z".repeat(200), colWidthEmu: NARROW_W },
    ];
    const shortOnly: WrapCell[] = [{ text: "kort", colWidthEmu: KRAV_W }];

    const tallPages = packRows(Array.from({ length: 12 }, () => tallByOtherCol), BASE);
    const shortPages = packRows(Array.from({ length: 12 }, () => shortOnly), BASE);
    expect(Math.max(...tallPages.map((p) => p.length))).toBeLessThan(
      Math.max(...shortPages.map((p) => p.length)),
    );
    expect(flat(tallPages)).toHaveLength(12);
  });

  it("short CV pointers page far denser than the old verbose referens string", () => {
    // The fix's payoff: uppfyllnad/referens now carry SHORT pointers instead of
    // the bundle's ~140-char referens, so many more rows fit per page in the same
    // narrow columns (the verbose string wrapped to ~12 lines and overflowed).
    const VERBOSE =
      "Uppfylls, se Karl Svensson – Organisationsdesign post-merger, Industrikoncern (2022); Anna Berg – Förändringsledning offentlig sektor (2021)";
    const shortRows = Array.from({ length: 12 }, (_, i) => [
      { text: `Krav ${i}`, colWidthEmu: KRAV_W },
      { text: "Ja — se CV: Anna", colWidthEmu: 1500000 },
      { text: "Anna Berg", colWidthEmu: 1800000 },
    ]);
    const verboseRows = Array.from({ length: 12 }, (_, i) => [
      { text: `Krav ${i}`, colWidthEmu: KRAV_W },
      { text: VERBOSE, colWidthEmu: 1500000 },
      { text: VERBOSE, colWidthEmu: 1800000 },
    ]);
    const maxShort = Math.max(...packRows(shortRows, BASE).map((p) => p.length));
    const maxVerbose = Math.max(...packRows(verboseRows, BASE).map((p) => p.length));
    expect(maxShort).toBeGreaterThan(maxVerbose);
  });
});
