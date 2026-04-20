import type { ISlide } from "pptx-automizer/dist/interfaces/islide";
import type { ApplicatorContext } from "../types";
import {
  applyFooter,
  replaceAllTextNodes,
  replaceParagraphTextNodes,
  replaceNthOccurrence,
} from "./_footer";

/**
 * Confidentiality applicator (slide 16 — single instance).
 *
 * Collision challenge:
 *   Row 1 has uniquely named placeholders:
 *     {Slide/Bilaga 1}, {Uppgift som omfattas av sekretess}, {Varför — ...}
 *   Rows 2-4 share IDENTICAL placeholder text:
 *     {Slide/Bilaga N}, {Uppgift som omfattas}, {Motivering}
 *   (where N=2, 3, 4 for the reference, but the scope/justification
 *    placeholders are literally identical across rows 2-4)
 *
 * Strategy:
 *   1. Replace row 1 unique placeholders via replaceAllTextNodes (safe — unique text).
 *   2. Replace each repeated placeholder using replaceNthOccurrence which walks
 *      <a:t> nodes in document order and maps ordinal → secrecyRows[N].
 *
 * For {Slide/Bilaga N}: each row has a uniquely numbered placeholder
 * ({Slide/Bilaga 1}, {Slide/Bilaga 2}, etc.) so we can replace individually.
 *
 * For {Uppgift som omfattas} and {Motivering}: appear 3 times each (rows 2-4).
 * We use replaceNthOccurrence with values = [row2.scope, row3.scope, row4.scope].
 *
 * Note on {Bolagsnamn}: present in both body prose AND footer. replaceAllTextNodes
 * handles all occurrences — both are correct replacements.
 *
 * Unused rows (fewer than 4 secrecyRows): remaining placeholders → "".
 */
export function confidentialityApplicator(ctx: ApplicatorContext) {
  const footer = applyFooter(ctx);

  const sec = ctx.sections.find((s) => s.content.format === "confidentiality");
  if (!sec || sec.content.format !== "confidentiality") {
    return (slide: ISlide) => {
      slide.modify(footer);
    };
  }

  const { oslReference, secrecyRows } = sec.content;

  // Helper: safe accessor — returns "" for missing rows
  const row = (i: number) => secrecyRows[i] ?? { reference: "", scope: "", justification: "" };

  // Step 1: Row 1 unique placeholders + OSL reference + body Bolagsnamn.
  // replaceAllTextNodes replaces ALL occurrences of {Bolagsnamn} (body + footer),
  // which is correct per audit note on slide 16.
  //
  // Note: "{OSL kap X §Y} " has a trailing space in the XML node — we match
  // without trailing space since split().join() will only replace the matched portion.
  // Note: "{Varför — ...}" uses em dash U+2014 and "å" U+00E5, "ä" U+00E4.
  const uniqueMap: Record<string, string> = {
    // OSL reference — trailing space in XML node is preserved (we match without it)
    "{OSL kap X \u00a7Y}": oslReference,
    // Row 1 — unique placeholder names
    "{Slide/Bilaga 1}": row(0).reference,
    "{Uppgift som omfattas av sekretess}": row(0).scope,
    "{Varf\u00f6r \u2014 skadan som uppst\u00e5r vid utl\u00e4mnande}": row(0).justification,
    // Rows 2-4 — uniquely numbered reference placeholders (safe to replace individually)
    "{Slide/Bilaga 2}": row(1).reference,
    "{Slide/Bilaga 3}": row(2).reference,
    "{Slide/Bilaga 4}": row(3).reference,
  };

  // Step 2: Repeated placeholders replaced per ordinal.
  // {Uppgift som omfattas} appears 3 times (rows 2-4) in document order.
  const scopeValues = [row(1).scope, row(2).scope, row(3).scope];
  // {Motivering} appears 3 times (rows 2-4) in document order.
  const justValues = [row(1).justification, row(2).justification, row(3).justification];

  const replaceScopes = replaceNthOccurrence("{Uppgift som omfattas}", scopeValues);
  const replaceJustifications = replaceNthOccurrence("{Motivering}", justValues);

  return (slide: ISlide) => {
    slide.modify((doc: XMLDocument) => {
      // Paragraph-level first — catches any split-run placeholders
      replaceParagraphTextNodes(uniqueMap)(doc);

      // Node-level for unique single-run placeholders
      replaceAllTextNodes(uniqueMap)(doc);

      // Per-ordinal replacement for repeated placeholders (collision-resistant)
      replaceScopes(doc);
      replaceJustifications(doc);

      // Footer last (handles {Bolagsnamn} + {Diarienummer} + counter)
      footer(doc);
    });
  };
}
