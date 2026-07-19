import type { ISlide } from "pptx-automizer/dist/interfaces/islide";
import type { ApplicatorContext } from "../types";
import type { SlideProfile, TableColumnRole } from "../template-profile";
import type { WrapCell } from "../foreign-table-pagination";
import { rowStatus } from "./requirement-matrix";

/**
 * Foreign-table row engine (foreign-table-matrix design 2026-07-19, "Rendering —
 * radmotorn"). Fills a CUSTOMER'S real <a:tbl> requirement-matrix table: it
 * clones the mapped template row once per requirement on this page, writes each
 * cell by its fixed column role, then removes the template row. Header rows are
 * left untouched; "ignorera" columns keep the template row's own content.
 *
 * This is the a:tbl counterpart to requirementMatrixApplicator, which fills OUR
 * template's stack-of-text-boxes matrix. The row window for this page comes from
 * ctx.tableRowIndices (precomputed by render-from-profile via packRows), so the
 * loader's page count and the applicator's fill stay in lockstep — exactly like
 * paginateMatrixRows keeps them aligned for our own template.
 *
 * Cell writing mirrors injectToken: keep the cell's first paragraph pPr and first
 * run rPr, replace only the text — so the customer's own cell formatting rides
 * through unchanged.
 */

const A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const P_NS = "http://schemas.openxmlformats.org/presentationml/2006/main";

type Status = "JA" | "NEJ" | "DELVIS";

interface Coverage {
  consultantName: string;
  status: Status;
}

export interface MatrixRow {
  requirement: string;
  coverage: Coverage[];
}

/**
 * The consultants whose coverage CARRIES this row's status, in coverage order:
 * for a JA row the ones marked JA, for a DELVIS row the ones marked DELVIS (the
 * best available), for a NEJ row none. Same roll-up logic as rowStatus, so the
 * pointer always names someone who actually covers the requirement. Blank names
 * are dropped.
 */
export function coveringNames(coverage: Coverage[]): string[] {
  const status = rowStatus(coverage);
  if (status === "NEJ") return [];
  return coverage
    .filter((c) => c.status === status)
    .map((c) => c.consultantName.trim())
    .filter((n) => n.length > 0);
}

/**
 * The deterministic "uppfyllnad" answer — a SHORT CV pointer, not the AI prose
 * and not the bundle's verbose referens string (that overflowed narrow cells).
 * "Ja — se CV: {namn}" / "Delvis — se CV: {namn}" / "Nej", naming the first
 * covering consultant. "se CV: Namn" (colon form) sidesteps Swedish genitive on
 * names ending in s. Without a covering name (or for NEJ), just the status word.
 */
export function formulaicAnswer(coverage: Coverage[]): string {
  const status = rowStatus(coverage);
  if (status === "NEJ") return "Nej";
  const word = status === "JA" ? "Ja" : "Delvis";
  const names = coveringNames(coverage);
  return names.length > 0 ? `${word} — se CV: ${names[0]}` : word;
}

/**
 * The mapped CONTENT cells of a generated row (krav / uppfyllnad / referens) as
 * text + column width — the exact strings the applicator writes, so pagination
 * estimates the honest wrapped height of every column it fills. status/ignorera
 * are excluded (a single status word / the kept template text never drive the
 * row height). Column c aligns with gridCol c (roles are one-per-gridCol).
 */
export function wrapCellsFor(
  row: MatrixRow,
  columns: TableColumnRole[],
  gridColsEmu: number[],
): WrapCell[] {
  const cells: WrapCell[] = [];
  for (let c = 0; c < columns.length; c++) {
    const colWidthEmu = gridColsEmu[c] ?? 0;
    switch (columns[c]) {
      case "krav":
        cells.push({ text: row.requirement, colWidthEmu });
        break;
      case "uppfyllnad":
        cells.push({ text: formulaicAnswer(row.coverage), colWidthEmu });
        break;
      case "referens":
        cells.push({ text: coveringNames(row.coverage).join(", "), colWidthEmu });
        break;
    }
  }
  return cells;
}

export function foreignTableApplicator(
  ctx: ApplicatorContext,
  slide: SlideProfile,
): (s: ISlide) => void {
  const tableMap = slide.tableMap;
  const allRows = matrixRows(ctx);
  const indices = ctx.tableRowIndices ?? [];
  const window = indices
    .map((i) => allRows[i])
    .filter((r): r is MatrixRow => r !== undefined);

  return (s: ISlide) => {
    if (!tableMap) return;
    s.modify((doc: XMLDocument) => {
      fillForeignTable(doc, tableMap, window);
    });
  };
}

/** Pulls the requirement-matrix-v2 section's rows from the generated sections. */
function matrixRows(ctx: ApplicatorContext): MatrixRow[] {
  const sec = ctx.sections.find(
    (s) => s.content?.format === "requirement-matrix-v2",
  );
  return sec && sec.content?.format === "requirement-matrix-v2"
    ? (sec.content.rows as MatrixRow[])
    : [];
}

function fillForeignTable(
  doc: XMLDocument,
  tableMap: NonNullable<SlideProfile["tableMap"]>,
  window: MatrixRow[],
): void {
  const tbl = findTable(doc, tableMap.frameIndex);
  if (!tbl) return;
  const rows = childElementsNS(tbl, A_NS, "tr");
  const templateRow = rows[tableMap.templateRowIndex];
  if (!templateRow) return;

  // Build the generated rows from a clone of the template row FIRST — the
  // template row is one of the body rows stripped below, so order matters.
  const generated = window.map((row) => {
    const clone = templateRow.cloneNode(true) as Element;
    fillRow(doc, clone, tableMap.columns, row);
    return clone;
  });

  // Strip EVERY original body row (index >= headerRows): the mapped template row
  // AND any extra example rows the customer left in the template. Leaving those
  // would print stale example text in the real export, uncounted by the page
  // band. Header rows are untouched. Zero requirements → the table is just its
  // header row(s), which is honest — no faked example rows.
  for (let i = rows.length - 1; i >= tableMap.headerRows; i--) {
    rows[i].parentNode?.removeChild(rows[i]);
  }

  // Append the generated rows after the surviving header rows (nothing follows
  // the rows in an a:tbl, so appendChild lands them in order).
  for (const clone of generated) tbl.appendChild(clone);
}

/** Writes one cloned row's cells by their column roles. */
function fillRow(
  doc: XMLDocument,
  tr: Element,
  columns: TableColumnRole[],
  row: MatrixRow,
): void {
  const cells = childElementsNS(tr, A_NS, "tc");
  for (let c = 0; c < columns.length; c++) {
    const cell = cells[c];
    if (!cell) continue;
    switch (columns[c]) {
      case "krav":
        setCellText(doc, cell, row.requirement);
        break;
      case "uppfyllnad":
        setCellText(doc, cell, formulaicAnswer(row.coverage));
        break;
      case "referens":
        // Short CV pointers — the covering consultants' names, not the bundle's
        // verbose referens string (which overflowed the narrow column).
        setCellText(doc, cell, coveringNames(row.coverage).join(", "));
        break;
      case "status":
        setCellText(doc, cell, rowStatus(row.coverage));
        break;
      case "ignorera":
        // Keep the template row's own cell content (e.g. a running-number column).
        break;
    }
  }
}

/**
 * Replaces a table cell's text while preserving its formatting — the injectToken
 * pattern applied to an <a:tc>'s <a:txBody>: keep the first paragraph's <a:pPr>
 * and the first run's <a:rPr>, drop everything else, write a single <a:t>.
 */
function setCellText(doc: XMLDocument, tc: Element, text: string): void {
  const txBody = firstChildNS(tc, A_NS, "txBody");
  if (!txBody) return;

  const paras = childElementsNS(txBody, A_NS, "p");
  for (let i = 1; i < paras.length; i++) txBody.removeChild(paras[i]);

  let firstP = paras[0];
  if (!firstP) {
    firstP = doc.createElementNS(A_NS, "a:p");
    txBody.appendChild(firstP);
  }

  const pPr = childElementsNS(firstP, A_NS, "pPr")[0] ?? null;
  const keptRun = childElementsNS(firstP, A_NS, "r")[0] ?? null;

  // Reduce the paragraph to {pPr?, kept run?}, dropping other runs and any
  // text-bearing siblings (a:fld, a:br) so only the new text remains.
  for (let n = firstP.firstChild; n; ) {
    const next = n.nextSibling;
    if (n !== pPr && n !== keptRun) firstP.removeChild(n);
    n = next;
  }

  if (keptRun) {
    const rPr = childElementsNS(keptRun, A_NS, "rPr")[0] ?? null;
    for (let n = keptRun.firstChild; n; ) {
      const next = n.nextSibling;
      if (n !== rPr) keptRun.removeChild(n);
      n = next;
    }
    keptRun.appendChild(makeText(doc, text));
  } else {
    const run = doc.createElementNS(A_NS, "a:r");
    run.appendChild(makeText(doc, text));
    if (pPr) firstP.insertBefore(run, pPr.nextSibling);
    else firstP.insertBefore(run, firstP.firstChild);
  }
}

function makeText(doc: XMLDocument, text: string): Element {
  const t = doc.createElementNS(A_NS, "a:t");
  t.appendChild(doc.createTextNode(text));
  return t;
}

/**
 * The <a:tbl> of the graphicFrame at `frameIndex` — counted DENSELY among
 * graphicFrames that contain an a:tbl, in document order, exactly as read-pptx's
 * extractTables numbers them (so the profile's frameIndex addresses the same
 * table the reader reported).
 */
function findTable(doc: XMLDocument, frameIndex: number): Element | null {
  const frames = doc.getElementsByTagNameNS(P_NS, "graphicFrame");
  let idx = 0;
  for (let i = 0; i < frames.length; i++) {
    const tbls = frames[i].getElementsByTagNameNS(A_NS, "tbl");
    if (tbls.length === 0) continue;
    if (idx === frameIndex) return tbls[0];
    idx++;
  }
  return null;
}

/** Direct-child elements of `parent` matching ns + localName (document order). */
function childElementsNS(parent: Element, ns: string, localName: string): Element[] {
  const out: Element[] = [];
  for (let n = parent.firstChild; n; n = n.nextSibling) {
    if (
      n.nodeType === 1 &&
      (n as Element).localName === localName &&
      (n as Element).namespaceURI === ns
    ) {
      out.push(n as Element);
    }
  }
  return out;
}

function firstChildNS(parent: Element, ns: string, localName: string): Element | null {
  return childElementsNS(parent, ns, localName)[0] ?? null;
}
