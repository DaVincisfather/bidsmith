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
 * Top section is one-box-per-column: {QA-process}, {Kvalitetsledare},
 * {Eskalering}. Paragraphs joined with "\n\n" (rendered via paragraph-level
 * split in replaceAllTextNodes/replaceParagraphTextNodes handling newlines).
 *
 * Bottom "AVSTÄMNINGSPUNKTER MOT BESTÄLLARE" section remains slot-based —
 * {Avstämning 1}..{Avstämning 4} because gate dates are naturally slot-shaped.
 *
 * Unused checkpoint slots (cap 4) are replaced with "".
 */
export function qualityAssuranceApplicator(ctx: ApplicatorContext) {
  const footer = applyFooter(ctx);

  return (slide: ISlide) => {
    const map = buildQualityMap(ctx);
    slide.modify((doc: XMLDocument) => {
      // Paragraph-level first — catches any placeholder split across runs
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
    (s) => s.content?.format === "quality-assurance",
  );
  if (!sec || sec.content?.format !== "quality-assurance") {
    // Missing section — leave placeholders unreplaced so gap is visible
    return {};
  }
  const c = sec.content;
  const cp = c.checkpoints;

  // Build the consolidated text blocks.
  const qaProcessText = c.qaProcess
    .filter((s) => s && s.trim().length > 0)
    .join("\n\n");
  const qualityLeadText = [
    c.qualityLead.name,
    c.qualityLead.roleAndMandate,
    c.qualityLead.contact,
  ]
    .filter((s) => s && s.trim().length > 0)
    .join("\n");
  const escalationText = [c.escalation.process, c.escalation.reporting]
    .filter((s) => s && s.trim().length > 0)
    .join("\n\n");

  return {
    // Top section — one-box-per-column
    "{QA-process}": qaProcessText,
    "{Kvalitetsledare}": qualityLeadText,
    "{Eskalering}": escalationText,

    // Bottom section — checkpoints, slot-based (cap 4)
    "{Avstämning 1 — tidpunkt och innehåll}": cp[0] ?? "",
    "{Avstämning 2}": cp[1] ?? "",
    "{Avstämning 3}": cp[2] ?? "",
    "{Avstämning 4}": cp[3] ?? "",
  };
}
