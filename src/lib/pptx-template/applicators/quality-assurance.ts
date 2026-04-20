import type { ISlide } from "pptx-automizer/dist/interfaces/islide";
import type { ApplicatorContext } from "../types";
import {
  applyFooter,
  replaceAllTextNodes,
  replaceParagraphTextNodes,
} from "./_footer";

/**
 * Quality-assurance applicator (slide 11).
 *
 * Maps 3 sub-sections (qaProcess, qualityLead, escalation) + checkpoints
 * array → placeholder map, then applies footer.
 *
 * Special case: "{QA-process — granskningsrutiner, peer review och
 * dokumentationskrav.}" is split across 3 <a:t> runs in the XML. We use
 * replaceParagraphTextNodes (paragraph-level concat) to catch it, then fall
 * back to replaceAllTextNodes for the single-run placeholders.
 *
 * Unused checkpoint slots (cap 4) are replaced with "".
 * TODO: full shape removal for unused slots if empty frames cause visual issues.
 */
export function qualityAssuranceApplicator(ctx: ApplicatorContext) {
  const footer = applyFooter(ctx);

  return (slide: ISlide) => {
    const map = buildQualityMap(ctx);
    slide.modify((doc: XMLDocument) => {
      // Paragraph-level first — catches the split QA-process placeholder
      replaceParagraphTextNodes(map)(doc);
      // Node-level for remaining single-run placeholders
      replaceAllTextNodes(map)(doc);
      // Footer last (also handles paragraph-level for footer placeholders)
      footer(doc);
    });
  };
}

function buildQualityMap(ctx: ApplicatorContext): Record<string, string> {
  const sec = ctx.sections.find(
    (s) => s.content.format === "quality-assurance",
  );
  if (!sec || sec.content.format !== "quality-assurance") {
    // Missing section — leave placeholders unreplaced so gap is visible
    return {};
  }
  const c = sec.content;
  const cp = c.checkpoints;

  return {
    // Section A — QA Process (2 paragraph placeholders)
    "{QA-process — övergripande beskrivning av vårt kvalitetsarbete: metodik, standarder och verktyg.}":
      c.qaProcess[0] ?? "",
    // NOTE: This placeholder is SPLIT across 3 <a:t> nodes in the template XML.
    // replaceParagraphTextNodes handles it by concatenating the paragraph text.
    "{QA-process — granskningsrutiner, peer review och dokumentationskrav.}":
      c.qaProcess[1] ?? "",

    // Section B — Quality Lead
    "{Namn, kvalitetsledare}": c.qualityLead.name,
    "{Roll, erfarenhet och mandat}": c.qualityLead.roleAndMandate,
    "{Kontakt — e-post och telefon}": c.qualityLead.contact,

    // Section C — Escalation
    "{Hur avvikelser hanteras och eskaleras till beställare}":
      c.escalation.process,
    // NOTE: This placeholder contains soft hyphen U+00AD in "månads­rapport" and
    // "avvikelse­rapport". The string below must match the exact bytes in the XML.
    // Verified in audit: the template XML contains U+00AD between syllables.
    "{Rapporteringsfrekvens och format — månads\u00ADrapport, avvikelse\u00ADrapport}":
      c.escalation.reporting,

    // Checkpoints — cap 4
    "{Avstämning 1 — tidpunkt och innehåll}": cp[0] ?? "",
    "{Avstämning 2}": cp[1] ?? "",
    "{Avstämning 3}": cp[2] ?? "",
    "{Avstämning 4}": cp[3] ?? "",
  };
}
