import type { ISlide } from "pptx-automizer/dist/interfaces/islide";
import type { ApplicatorContext } from "../types";
import {
  applyFooter,
  replaceAllTextNodes,
  replaceParagraphTextNodes,
  replaceNthOccurrence,
} from "./_footer";

/**
 * Certifications applicator (slide 17 — single instance).
 *
 * Collision challenge:
 *   {Certifikatnummer} appears 4 times (once per card).
 *   {Giltighetstid} appears 4 times (once per card).
 *   Naïve global replace would set all 4 cards to certs[0]'s values.
 *
 * Strategy:
 *   Use replaceNthOccurrence for both {Certifikatnummer} and {Giltighetstid},
 *   walking <a:t> nodes in document order and mapping ordinal → certs[N].
 *
 * Card 4 (Övrig) additional placeholders:
 *   {Övrig relevant certifiering} → certs[3].name
 *   {Beskrivning} → certs[3].description
 *   These appear once each — safe for replaceAllTextNodes.
 *
 * Optional cards:
 *   If certs[i] is missing, the N-th occurrence of {Certifikatnummer} and
 *   {Giltighetstid} is replaced with "". Visual artifact acceptable (Task 13
 *   will add full card removal).
 *
 * Slot cap: 4 cards (indices 0-3).
 */
export function certificationsApplicator(ctx: ApplicatorContext) {
  const footer = applyFooter(ctx);

  const sec = ctx.sections.find((s) => s.content.format === "certifications");
  if (!sec || sec.content.format !== "certifications") {
    return (slide: ISlide) => {
      slide.modify(footer);
    };
  }

  const { certs } = sec.content;

  // Helper: safe accessor
  const cert = (i: number) =>
    certs[i] ?? { name: undefined, description: undefined, number: "", validUntil: "" };

  // Per-ordinal replacements for the 4-times-repeated placeholders.
  // Document order: card 1 → card 2 → card 3 → card 4.
  const certNumbers = [
    cert(0).number,
    cert(1).number,
    cert(2).number,
    cert(3).number,
  ];
  const certValids = [
    cert(0).validUntil,
    cert(1).validUntil,
    cert(2).validUntil,
    cert(3).validUntil,
  ];

  const replaceCertNumbers = replaceNthOccurrence("{Certifikatnummer}", certNumbers);
  const replaceCertValids = replaceNthOccurrence("{Giltighetstid}", certValids);

  // Card 4 unique placeholders (appear once each — global replace is safe)
  const card4 = cert(3);
  const uniqueMap: Record<string, string> = {
    // Övrig relevant certifiering — card 4 name (appears once)
    "{\u00d6vrig relevant certifiering}": card4.name ?? "",
    // Beskrivning — card 4 description (appears once)
    "{Beskrivning}": card4.description ?? "",
  };

  return (slide: ISlide) => {
    slide.modify((doc: XMLDocument) => {
      // Paragraph-level first — catches any split-run placeholders
      replaceParagraphTextNodes(uniqueMap)(doc);

      // Node-level for unique single-occurrence placeholders
      replaceAllTextNodes(uniqueMap)(doc);

      // Per-ordinal replacement for 4× repeated placeholders (collision-resistant)
      replaceCertNumbers(doc);
      replaceCertValids(doc);

      // Footer last
      footer(doc);
    });
  };
}
