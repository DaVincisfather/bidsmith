import type { ApplicatorContext } from "../types";

const A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";

/**
 * Find the nearest ancestor element matching the given local name in the
 * drawingml namespace. Used for multi-line splits where we need to clone
 * the enclosing <a:p> paragraph.
 */
function findAncestor(node: Node, localName: string): Element | null {
  let cur: Node | null = node.parentNode;
  while (cur) {
    if (
      cur.nodeType === 1 &&
      (cur as Element).namespaceURI === A_NS &&
      (cur as Element).localName === localName
    ) {
      return cur as Element;
    }
    cur = cur.parentNode;
  }
  return null;
}

/**
 * Multi-line expansion. When `value` contains "\n", the host paragraph is
 * cloned once per extra line so each line becomes its own <a:p>.
 *
 * Why: PowerPoint COM (and the COM PNG export) renders soft-wrapped text
 * twice on slide 11 — every wrapped line gets the previous line's last word
 * duplicated as its first word. Hard line breaks via separate paragraphs
 * avoid that bug. Verified empirically: tmp/test-hardbreaks.pptx produced
 * clean output with the multi-paragraph structure.
 *
 * The first line replaces the placeholder in the original <a:t> (so the
 * applicator's existing string replacement still works). Each extra line
 * is inserted as a sibling <a:p> right after the original. Cloned paragraphs
 * keep the same <a:pPr> and <a:rPr>; only the first <a:t> in each clone
 * carries text, the rest are blanked to avoid duplicating split runs.
 */
function expandMultiline(node: Element, value: string): string {
  if (!value.includes("\n")) return value;
  const lines = value.split("\n");
  const para = findAncestor(node, "p");
  if (!para || !para.parentNode) return lines.join(" "); // fall back: join into single line
  const parent = para.parentNode;
  let insertAfter: Node = para;
  for (let i = 1; i < lines.length; i++) {
    const clone = para.cloneNode(true) as Element;
    const cloneTs = clone.getElementsByTagNameNS(A_NS, "t");
    if (cloneTs.length > 0) {
      cloneTs[0].textContent = lines[i];
      for (let j = 1; j < cloneTs.length; j++) {
        cloneTs[j].textContent = "";
      }
    }
    parent.insertBefore(clone, insertAfter.nextSibling);
    insertAfter = clone;
  }
  return lines[0];
}

/**
 * Returns a SlideModificationCallback that walks every <a:t> node in the
 * slide XML and performs literal string replacements for each key→value pair.
 *
 * If a value contains "\n", the enclosing paragraph is cloned per line to
 * produce hard line breaks (works around a PowerPoint wrap bug — see
 * expandMultiline).
 *
 * pptx-automizer's SlideModificationCallback signature:
 *   (document: XmlDocument, parent?) => void
 * where XmlDocument = XMLDocument (standard DOM API).
 *
 * Exported here (moved from cover.ts) so all applicators share one copy.
 */
/**
 * Replaces text nodes whose FULL content exactly equals a map key (unlike
 * replaceAllTextNodes, which does substring `includes` and would corrupt any
 * content containing the key as a substring — e.g. remapping "01"→"07" would
 * turn "ISO 9001" into "ISO 9007"). Use for short literal tokens like the
 * static requirement-matrix row numbers. No multiline expansion.
 */
export function replaceExactTextNodes(
  map: Record<string, string>,
): (document: XMLDocument) => void {
  return (document: XMLDocument) => {
    const tNodes = Array.from(document.getElementsByTagNameNS(A_NS, "t"));
    for (const node of tNodes) {
      const text = node.textContent ?? "";
      if (Object.prototype.hasOwnProperty.call(map, text)) {
        node.textContent = map[text];
      }
    }
  };
}

export function replaceAllTextNodes(
  map: Record<string, string>,
): (document: XMLDocument) => void {
  return (document: XMLDocument) => {
    // Snapshot the live HTMLCollection — expandMultiline mutates the tree.
    const tNodes = Array.from(
      document.getElementsByTagNameNS(A_NS, "t"),
    );
    for (const node of tNodes) {
      let text = node.textContent ?? "";
      for (const [placeholder, value] of Object.entries(map)) {
        if (text.includes(placeholder)) {
          const firstLine = expandMultiline(node, value);
          text = text.split(placeholder).join(firstLine);
        }
      }
      node.textContent = text;
    }
  };
}

/**
 * Paragraph-level replacement for split placeholders.
 *
 * Some placeholder strings in the PPTX are fragmented across multiple <a:t>
 * runs within a single <a:p> paragraph (e.g. slide 11 QA-process line 2).
 * A simple per-node replace would miss them because no single node holds the
 * full placeholder text.
 *
 * Strategy for each paragraph <a:p>:
 *   1. Concatenate text content of all <a:t> children.
 *   2. If the concatenated text contains a placeholder key, replace it.
 *   3. Write the result into the FIRST <a:t> node; blank the rest.
 *
 * This preserves paragraph structure while handling fragmentation.
 * Any single-node placeholders NOT caught here are handled by replaceAllTextNodes.
 */
export function replaceParagraphTextNodes(
  map: Record<string, string>,
): (document: XMLDocument) => void {
  return (document: XMLDocument) => {
    const ns = "http://schemas.openxmlformats.org/drawingml/2006/main";
    const paragraphs = document.getElementsByTagNameNS(ns, "p");
    for (let i = 0; i < paragraphs.length; i++) {
      const para = paragraphs[i];
      const tNodes = para.getElementsByTagNameNS(ns, "t");
      if (tNodes.length < 2) continue; // single-node paragraphs handled by replaceAllTextNodes

      // Concatenate all text from this paragraph
      let combined = "";
      for (let j = 0; j < tNodes.length; j++) {
        combined += tNodes[j].textContent ?? "";
      }

      // Check if any placeholder spans this paragraph
      let replaced = combined;
      let didReplace = false;
      for (const [placeholder, value] of Object.entries(map)) {
        if (replaced.includes(placeholder)) {
          replaced = replaced.split(placeholder).join(value);
          didReplace = true;
        }
      }

      if (didReplace) {
        // Write combined result into first node, empty the rest.
        // If `replaced` contains "\n", clone the paragraph per extra line
        // (same hard-break trick as replaceAllTextNodes — see expandMultiline).
        const firstLine = expandMultiline(tNodes[0], replaced);
        tNodes[0].textContent = firstLine;
        for (let j = 1; j < tNodes.length; j++) {
          tNodes[j].textContent = "";
        }
      }
    }
  };
}

/**
 * Replaces each occurrence of `placeholder` in document order with the
 * corresponding value from `values`, matching by ordinal (0-based).
 *
 * Motivation: some placeholders (e.g. {Certifikatnummer}, {Giltighetstid},
 * {Uppgift som omfattas}, {Motivering}) appear multiple times per slide with
 * IDENTICAL text but different intended values per card/row. A global string
 * replace would set all occurrences to the first value. This helper walks all
 * <a:t> nodes in document order, counts occurrences of `placeholder`, and
 * replaces the N-th occurrence with `values[N]`.
 *
 * If `values[N]` is undefined (slot cap exceeded), replaces with "".
 * Nodes that do not contain the placeholder are left untouched.
 */
export function replaceNthOccurrence(
  placeholder: string,
  values: string[],
): (document: XMLDocument) => void {
  return (document: XMLDocument) => {
    const ns = "http://schemas.openxmlformats.org/drawingml/2006/main";
    const tNodes = document.getElementsByTagNameNS(ns, "t");
    let occurrenceIndex = 0;
    for (let i = 0; i < tNodes.length; i++) {
      const node = tNodes[i];
      const text = node.textContent ?? "";
      if (text.includes(placeholder)) {
        const value = values[occurrenceIndex] ?? "";
        node.textContent = text.split(placeholder).join(value);
        occurrenceIndex++;
      }
    }
  };
}

/**
 * Returns a SlideModificationCallback array (run both) that:
 *   1. Replaces {Bolagsnamn} → master.companyName
 *   2. Replaces {Diarienummer} → master.diaryNumber
 *   3. Replaces the slide counter literal (e.g. "02 / 17") with
 *      ctx.slideNum + " / " + ctx.totalSlides
 *
 * Applied to all non-cover slides (slides 2–17).
 * Returns a combined modifier function for use in slide.modify().
 */
export function applyFooter(
  ctx: ApplicatorContext,
): (document: XMLDocument) => void {
  const footerMap: Record<string, string> = {
    "{Bolagsnamn}": ctx.master.companyName,
    "{Diarienummer}": ctx.master.diaryNumber,
  };

  const counterReplacement = `${ctx.slideNum} / ${ctx.totalSlides}`;

  // Counter pattern: NN / 17 (1–2 digits, optional spaces around /)
  // The template always has the format "NN / 17" with specific spacing.
  // We do a regex-based replacement after the string replacements.
  const nodeReplace = replaceAllTextNodes(footerMap);

  return (document: XMLDocument) => {
    // First apply paragraph-level replacement (handles split placeholders)
    replaceParagraphTextNodes(footerMap)(document);

    // Then apply node-level replacement for single-node placeholders
    nodeReplace(document);

    // Replace slide counter: match "NN / 17" pattern.
    // Use a fresh regex per iteration to avoid g-flag lastIndex state issues.
    const ns = "http://schemas.openxmlformats.org/drawingml/2006/main";
    const tNodes = document.getElementsByTagNameNS(ns, "t");
    for (let i = 0; i < tNodes.length; i++) {
      const node = tNodes[i];
      const text = node.textContent ?? "";
      // Non-global regex for test + replace avoids lastIndex complications
      if (/\d{1,2}\s*\/\s*17/.test(text)) {
        node.textContent = text.replace(/\d{1,2}\s*\/\s*17/g, counterReplacement);
      }
    }

    // Widen the footer text box. The template's footer shape is 3231109 EMU
    // (~3.53") which forces "Edgren Konsult AB | VGR-NNNN-NNNN" to wrap onto
    // two lines. We identify the shape by its fixed position (x=1143000,
    // y=9686925) and bump cx to 5715000 EMU (~6.25") which fits the longest
    // realistic company-name + diary-number combination on a single line.
    const PRESERVATION_NS = "http://schemas.openxmlformats.org/presentationml/2006/main";
    const sps = document.getElementsByTagNameNS(PRESERVATION_NS, "sp");
    for (let i = 0; i < sps.length; i++) {
      const sp = sps[i];
      const offs = sp.getElementsByTagNameNS(ns, "off");
      const exts = sp.getElementsByTagNameNS(ns, "ext");
      if (offs.length === 0 || exts.length === 0) continue;
      const off = offs[0];
      if (
        off.getAttribute("x") === "1143000" &&
        off.getAttribute("y") === "9686925"
      ) {
        exts[0].setAttribute("cx", "5715000");
      }
    }
  };
}
