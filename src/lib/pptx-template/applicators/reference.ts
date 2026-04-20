import type { ISlide } from "pptx-automizer/dist/interfaces/islide";
import type { ApplicatorContext } from "../types";
import {
  applyFooter,
  replaceAllTextNodes,
  replaceParagraphTextNodes,
} from "./_footer";

/**
 * Reference applicator (slide 14 — cloned per reference).
 *
 * Loader clones slide 14 once per BidReference item. For clone N (0-based
 * cloneIndex), this applicator fills all per-reference placeholders.
 *
 * Tab label literal update:
 *   Template has "14 · REFERENS 01" — we patch "REFERENS 01" → "REFERENS NN"
 *   where NN = (cloneIndex+1) zero-padded to 2 digits.
 *   "01" appears only in the tab label (verified in audit line 238).
 *   We replace "REFERENS 01" rather than bare "01" to avoid touching any
 *   content text that might contain the string "01".
 *
 * Contact field note:
 *   {Namn} and "{Titel} · {Telefon} · {E-post}" are in SEPARATE text frames.
 *   The compound frame holds the full string; the applicator replaces the whole
 *   literal placeholder sequence for titlePhoneEmail.
 */
export function referenceApplicator(ctx: ApplicatorContext) {
  const footer = applyFooter(ctx);
  const cloneIndex = ctx.cloneIndex ?? 0;

  // Find the reference-v2 section and get the reference for this clone
  const sec = ctx.sections.find((s) => s.content.format === "reference-v2");
  if (!sec || sec.content.format !== "reference-v2") {
    return (slide: ISlide) => {
      slide.modify(footer);
    };
  }

  const reference = sec.content.references[cloneIndex];
  if (!reference) {
    return (slide: ISlide) => {
      slide.modify(footer);
    };
  }

  // Build placeholder → value map.
  // All placeholder strings are verified against the actual PPTX XML bytes.
  // Notable gotchas:
  //   - contextLine uses U+201D (right double quote) for BOTH opening AND closing quote
  //   - startDate/endDate are in ONE compound text node: "{Start} — {Slut}"
  //     so we replace the entire compound string with a formatted date range,
  //     OR we replace each sub-placeholder within the compound string.
  //     Since replaceAllTextNodes walks nodes and the compound node contains
  //     both {Start...} and {Slut...}, we can replace them individually within it.
  //   - {Namn} has a trailing space in the XML node ("{Namn} ") — we match just
  //     "{Namn}" and leave any trailing space in place.
  const placeholderMap: Record<string, string> = {
    // Heading
    "{Referens 1 \u2014 kundnamn}": reference.clientName,
    // Subtitle — opening quote is U+201D (right double quote), both sides
    "{Referens 1 \u2014 kort kontextrad, t.ex. \u201dDigitalisering av \u00e4rendehantering\u201d}":
      reference.contextLine,

    // Details section
    "{Kund \u2014 organisation}": reference.organisation,
    // Start/end dates are in ONE node: "{Start MM/ÅÅÅÅ} — {Slut MM/ÅÅÅÅ}"
    // Replace each placeholder individually; replaceAllTextNodes handles both within the node.
    "{Start MM/\u00c5\u00c5\u00c5\u00c5}": reference.startDate,
    "{Slut MM/\u00c5\u00c5\u00c5\u00c5}": reference.endDate,
    "{Omfattning \u2014 antal timmar, konsulter och total volym}": reference.scope,

    // Contact section — two separate frames
    "{Namn}": reference.contact.name,
    // Compound contact frame — the whole string is one placeholder block
    "{Titel} \u00b7 {Telefon} \u00b7 {E-post}": reference.contact.titlePhoneEmail,

    // Role and result
    "{Roll/leverans \u2014 vilken roll vi hade och vad vi levererade, konkret och verifierbart}":
      reference.roleAndDelivery,
    "{Resultat \u2014 m\u00e4tbart utfall av uppdraget, g\u00e4rna med siffror och tidsbesparing}":
      reference.result,
  };

  // Tab label update: "REFERENS 01" → "REFERENS NN"
  const nn = String(cloneIndex + 1).padStart(2, "0");

  return (slide: ISlide) => {
    slide.modify((doc: XMLDocument) => {
      // Paragraph-level first — catches any split-run placeholders
      replaceParagraphTextNodes(placeholderMap)(doc);

      // Node-level for remaining single-run placeholders
      replaceAllTextNodes(placeholderMap)(doc);

      // Tab label literal: replace "REFERENS 01" with "REFERENS NN"
      // "REFERENS 01" is unique to the tab label — safe substring for replacement.
      applyLiteralReplacement("REFERENS 01", `REFERENS ${nn}`, doc);

      // Footer last
      footer(doc);
    });
  };
}

/** Replace all occurrences of a literal string in every <a:t> node. */
function applyLiteralReplacement(
  from: string,
  to: string,
  document: XMLDocument,
): void {
  const ns = "http://schemas.openxmlformats.org/drawingml/2006/main";
  const tNodes = document.getElementsByTagNameNS(ns, "t");
  for (let i = 0; i < tNodes.length; i++) {
    const node = tNodes[i];
    const text = node.textContent ?? "";
    if (text.includes(from)) {
      node.textContent = text.split(from).join(to);
    }
  }
}
