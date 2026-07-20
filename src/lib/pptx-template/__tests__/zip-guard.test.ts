import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  MAX_UNCOMPRESSED_BYTES,
  MAX_ZIP_ENTRIES,
  assertZipWithinLimits,
  zipInflationStats,
} from "../zip-guard";

/** Builds a fake loaded-zip shape with the `_data.uncompressedSize` fields
 *  JSZip populates after loadAsync — lets us assert the guard without inflating
 *  a real multi-GB bomb. */
function fakeZip(sizes: number[]): { files: Record<string, unknown> } {
  const files: Record<string, unknown> = {};
  sizes.forEach((size, i) => {
    files[`entry-${i}`] = { _data: { uncompressedSize: size } };
  });
  return { files };
}

describe("zip-guard", () => {
  it("sums declared uncompressed sizes and counts entries", () => {
    const stats = zipInflationStats(fakeZip([100, 200, 300]) as never);
    expect(stats.totalUncompressed).toBe(600);
    expect(stats.entryCount).toBe(3);
  });

  it("passes a normal archive", () => {
    expect(() => assertZipWithinLimits(fakeZip([1_000_000, 2_000_000]) as never)).not.toThrow();
  });

  it("rejects a decompression bomb by total inflated size", () => {
    const bomb = fakeZip([MAX_UNCOMPRESSED_BYTES + 1]);
    expect(() => assertZipWithinLimits(bomb as never, "pptx")).toThrow(/zip-bomb/);
  });

  it("rejects a breadth bomb by entry count", () => {
    const many = fakeZip(new Array(MAX_ZIP_ENTRIES + 1).fill(1));
    expect(() => assertZipWithinLimits(many as never)).toThrow(/för många filer/);
  });

  it("tolerates entries without _data (directories)", () => {
    const zip = { files: { dir: {}, file: { _data: { uncompressedSize: 10 } } } };
    expect(zipInflationStats(zip as never).totalUncompressed).toBe(10);
  });

  it("accepts a REAL small JSZip end-to-end", async () => {
    const zip = new JSZip();
    zip.file("ppt/presentation.xml", "<xml/>");
    const buf = await zip.generateAsync({ type: "nodebuffer" });
    const loaded = await JSZip.loadAsync(buf);
    expect(() => assertZipWithinLimits(loaded)).not.toThrow();
    expect(zipInflationStats(loaded).entryCount).toBeGreaterThanOrEqual(1);
  });
});
