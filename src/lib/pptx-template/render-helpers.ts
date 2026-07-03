import type { BidSection } from "../types";
import type { LoadedTemplate } from "./template-store";
import { paginateMatrixRows } from "./applicators/requirement-matrix";

/**
 * Shared rendering helpers used by both the slide-type-driven renderer
 * (loader.ts) and the profile-driven renderer (render-from-profile.ts). Kept in
 * one place so the two paths compute clone counts and output-slide totals
 * IDENTICALLY — any drift here would break golden bit-parity between them.
 */

export function countOutputSlides(
  manifest: Pick<LoadedTemplate["manifest"], "slides">,
  sections: BidSection[],
): number {
  let n = 0;
  for (const s of manifest.slides) {
    if (s.cloneFrom) n += getCloneItems(sections, s.cloneFrom).length;
    else n += 1;
  }
  return n;
}

export function getCloneItems(
  sections: BidSection[],
  key: "phases" | "references" | "requirement-matrix",
): unknown[] {
  if (key === "phases") {
    const sec = sections.find((s) => s.content?.format === "phases");
    if (sec && sec.content?.format === "phases") {
      return sec.content.phases ?? [];
    }
  }
  if (key === "references") {
    const sec = sections.find((s) => s.content?.format === "reference-v2");
    if (sec && sec.content?.format === "reference-v2") {
      return sec.content.references ?? [];
    }
  }
  if (key === "requirement-matrix") {
    // One clone per content-aware page (paginateMatrixRows — the same call the
    // applicator windows on, so counts stay in lockstep). Always at least one
    // page so the matrix slide never disappears when data is missing/empty
    // (unlike phases/references, the matrix slide is not optional). The page
    // items only need the right length — their contents are unused.
    const sec = sections.find(
      (s) => s.content?.format === "requirement-matrix-v2",
    );
    const rows =
      sec && sec.content?.format === "requirement-matrix-v2"
        ? sec.content.rows
        : [];
    const pages = rows.length > 0 ? paginateMatrixRows(rows).length : 1;
    return Array.from({ length: Math.max(1, pages) });
  }
  return [];
}

export function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}
