import type { ISlide } from "pptx-automizer/dist/interfaces/islide";
import type { ApplicatorContext } from "../types";
import type { SlideProfile, TableColumnRole } from "../template-profile";
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

interface MatrixRow {
  requirement: string;
  hurUppfylls: string;
  referens: string;
  coverage: { status: "JA" | "NEJ" | "DELVIS" }[];
}

/**
 * The deterministic "uppfyllnad" answer for a requirement — NOT the AI prose.
 * "Ja — se {referens}" / "Delvis — se {referens}" / "Nej". Without a referens
 * (or for NEJ), just the status word. The status column, when mapped, gets the
 * bare JA/DELVIS/NEJ instead (pills are our own template's idiom).
 */
export function formulaicAnswer(
  row: { referens?: string },
  status: "JA" | "DELVIS" | "NEJ",
): string {
  if (status === "NEJ") return "Nej";
  const word = status === "JA" ? "Ja" : "Delvis";
  const ref = row.referens?.trim();
  return ref ? `${word} — se ${ref}` : word;
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
  // No rows to place → leave the table (and its template row) untouched rather
  // than emitting a header-only husk.
  if (window.length === 0) return;

  for (const row of window) {
    const clone = templateRow.cloneNode(true) as Element;
    fillRow(doc, clone, tableMap.columns, row);
    templateRow.parentNode?.insertBefore(clone, templateRow);
  }
  templateRow.parentNode?.removeChild(templateRow);
}

/** Writes one cloned row's cells by their column roles. */
function fillRow(
  doc: XMLDocument,
  tr: Element,
  columns: TableColumnRole[],
  row: MatrixRow,
): void {
  const cells = childElementsNS(tr, A_NS, "tc");
  const status = rowStatus(row.coverage);
  for (let c = 0; c < columns.length; c++) {
    const cell = cells[c];
    if (!cell) continue;
    switch (columns[c]) {
      case "krav":
        setCellText(doc, cell, row.requirement);
        break;
      case "uppfyllnad":
        setCellText(doc, cell, formulaicAnswer(row, status));
        break;
      case "referens":
        setCellText(doc, cell, row.referens);
        break;
      case "status":
        setCellText(doc, cell, status);
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
