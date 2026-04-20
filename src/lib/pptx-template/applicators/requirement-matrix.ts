import type { ISlide } from "pptx-automizer/dist/interfaces/islide";
import type { ApplicatorContext } from "../types";
import {
  applyFooter,
  replaceAllTextNodes,
  replaceParagraphTextNodes,
} from "./_footer";

/**
 * Requirement-matrix applicator (slide 13).
 *
 * Slide 13 has a PPTX table with 6 requirement row slots.
 * replaceAllTextNodes walks all <a:t> nodes including table cells.
 *
 * Row numbers (01–06) and "JA" are static in the template XML.
 * v1: all requirements assumed met (JA is static — no per-row override needed).
 * TODO: future task — if met===false, override the JA cell with "NEJ" or "DELVIS".
 *
 * Slot cap: 6. >6 rows: console.warn + truncate to first 6 (matches Task 8 pattern).
 *
 * Replacement-order: per-row, insert LONGEST keys first.
 * Row 1 uses long-form placeholders; rows 2–6 use short-form.
 * Long-form goes first in the map so it's consumed before any shorter variant.
 */
export function requirementMatrixApplicator(ctx: ApplicatorContext) {
  const footer = applyFooter(ctx);

  return (slide: ISlide) => {
    const map = buildRequirementMatrixMap(ctx);
    slide.modify((doc: XMLDocument) => {
      // Paragraph-level first — catches any split-run placeholders
      replaceParagraphTextNodes(map)(doc);
      // Node-level for all remaining single-run placeholders (incl. table cells)
      replaceAllTextNodes(map)(doc);
      // Footer last
      footer(doc);
    });
  };
}

const SLOT_CAP = 6;

function buildRequirementMatrixMap(ctx: ApplicatorContext): Record<string, string> {
  const sec = ctx.sections.find(
    (s) => s.content.format === "requirement-matrix-v2",
  );
  if (!sec || sec.content.format !== "requirement-matrix-v2") {
    return {};
  }
  const c = sec.content;
  let rows = c.rows;

  if (rows.length > SLOT_CAP) {
    console.warn(
      `requirement-matrix: data has ${rows.length} rows; only the first ${SLOT_CAP} will be rendered (v1 slot cap).`,
    );
    rows = rows.slice(0, SLOT_CAP);
  }

  const map: Record<string, string> = {};

  // Row 1 uses long-form placeholder keys; rows 2–6 use short-form.
  // Insert LONGEST keys first so the long-form variants are replaced before
  // the short "{Ska-krav 1}" pattern (which doesn't actually appear for row 1,
  // but this ordering guards against any future template changes).

  for (let i = 1; i <= SLOT_CAP; i++) {
    const row = rows[i - 1]; // undefined if fewer rows provided

    if (i === 1) {
      // Row 1: long-form placeholder keys
      const reqKey =
        "{Ska-krav 1 \u2014 formulering enligt upphandlingsunderlag}";
      const hurKey =
        "{Hur krav 1 uppfylls \u2014 konkret beskrivning}";
      const cvKey = "{CV/ref 1}";

      map[reqKey] = row ? row.requirement : "";
      map[hurKey] = row ? row.hurUppfylls : "";
      map[cvKey] = row ? row.referens : "";
    } else {
      // Rows 2–6: short-form placeholder keys
      map[`{Ska-krav ${i}}`] = row ? row.requirement : "";
      map[`{Hur krav ${i} uppfylls}`] = row ? row.hurUppfylls : "";
      map[`{CV/ref ${i}}`] = row ? row.referens : "";
    }
  }

  return map;
}
