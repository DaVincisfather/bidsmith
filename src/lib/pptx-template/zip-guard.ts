import type JSZip from "jszip";

/**
 * Decompression-bomb guard for user-uploaded zip containers (pptx/docx/xlsx).
 * The 20 MB per-file upload cap (document-parser) bounds the COMPRESSED body;
 * it does not bound what a malicious DEFLATE stream inflates to — a ≤20 MB
 * archive can decompress to multiple GB and OOM-kill the function. JSZip
 * populates each entry's DECLARED uncompressed size on `_data` at loadAsync
 * (before any `.async(...)` inflation), and this checks that declared total +
 * entry count.
 *
 * LIMITATION (see ROADMAP follow-up): the declared size comes from the zip's
 * own central directory, so a crafted archive can under-report it and still
 * inflate large — pako does not cap inflation at the declared value. This guard
 * therefore stops accidental/breadth bombs and honestly-sized bombs, NOT a
 * forged-metadata bomb; robustly bounding that needs streaming-with-a-byte-cap
 * (a different unzip lib). The surface is auth-gated and serverless-isolated,
 * so the residual is a per-invocation OOM, not a full outage.
 */

export const MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024; // 200 MB total inflated
export const MAX_ZIP_ENTRIES = 5000;

/** Minimal shape of what JSZip populates per entry after loadAsync. */
interface EntryWithSize {
  _data?: { uncompressedSize?: number };
}

/** Total declared uncompressed size + entry count for a loaded zip. */
export function zipInflationStats(zip: Pick<JSZip, "files">): {
  totalUncompressed: number;
  entryCount: number;
} {
  let totalUncompressed = 0;
  let entryCount = 0;
  for (const name of Object.keys(zip.files)) {
    const entry = zip.files[name] as unknown as EntryWithSize;
    entryCount++;
    totalUncompressed += entry._data?.uncompressedSize ?? 0;
  }
  return { totalUncompressed, entryCount };
}

/** Throws if a loaded zip declares a decompression bomb. Call right after
 *  JSZip.loadAsync on any user-uploaded archive, before reading entries. */
export function assertZipWithinLimits(zip: Pick<JSZip, "files">, label = "arkiv"): void {
  const { totalUncompressed, entryCount } = zipInflationStats(zip);
  if (entryCount > MAX_ZIP_ENTRIES) {
    throw new Error(
      `${label}: för många filer i zip:en (${entryCount} > ${MAX_ZIP_ENTRIES}) — avvisas som möjlig zip-bomb`,
    );
  }
  if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) {
    throw new Error(
      `${label}: uppackad storlek ${Math.round(totalUncompressed / 1024 / 1024)} MB överstiger taket ${MAX_UNCOMPRESSED_BYTES / 1024 / 1024} MB — avvisas som möjlig zip-bomb`,
    );
  }
}
