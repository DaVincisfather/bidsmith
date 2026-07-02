import type { ISlide } from "pptx-automizer/dist/interfaces/islide";
import type { ApplicatorContext } from "../types";
import {
  applyFooter,
  replaceAllTextNodes,
  replaceExactTextNodes,
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

export function requirementMatrixApplicator(ctx: ApplicatorContext) {
  const footer = applyFooter(ctx);

  return (slide: ISlide) => {
    const { contentMap, numberMap } = buildRequirementMatrixMaps(ctx);
    slide.modify((doc: XMLDocument) => {
      // Row numbers first, exact-match, while content cells still hold their
      // {placeholder} text (so the digit remap can't hit real content).
      replaceExactTextNodes(numberMap)(doc);
      // Paragraph-level first — catches any split-run placeholders
      replaceParagraphTextNodes(contentMap)(doc);
      // Node-level for all remaining single-run placeholders (incl. table cells)
      replaceAllTextNodes(contentMap)(doc);
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
} {
  const sec = ctx.sections.find(
    (s) => s.content?.format === "requirement-matrix-v2",
  );
  if (!sec || sec.content?.format !== "requirement-matrix-v2") {
    return { contentMap: {}, numberMap: {} };
  }

  const cloneIndex = ctx.cloneIndex ?? 0;
  const base = cloneIndex * MATRIX_ROWS_PER_SLIDE;
  // This page's window of rows; may be shorter than 6 on the final page.
  const window = sec.content.rows.slice(base, base + MATRIX_ROWS_PER_SLIDE);

  const contentMap: Record<string, string> = {};
  const numberMap: Record<string, string> = {};

  for (let i = 1; i <= MATRIX_ROWS_PER_SLIDE; i++) {
    const row = window[i - 1]; // undefined if this page has fewer rows

    // Continuous NR column: page 2 slot 1 → "07". Blank an unused slot so the
    // final page shows empty rows without a stray number.
    numberMap[pad2(i)] = row ? pad2(base + i) : "";

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

  return { contentMap, numberMap };
}
