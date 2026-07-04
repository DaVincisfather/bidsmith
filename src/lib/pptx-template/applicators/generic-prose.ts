import type { ISlide } from "pptx-automizer/dist/interfaces/islide";
import type { ApplicatorContext } from "../types";
import type { SlideProfile } from "../template-profile";
import {
  applyFooter,
  replaceAllTextNodes,
  replaceParagraphTextNodes,
} from "./_footer";

/**
 * Generic-prose applicator (template-upload slice 4) — fills every generic-prose
 * slot on a slide by matching it to the BidSection generated for that exact
 * placeholder, then does placeholder replacement + footer like the prose
 * applicator. This is the render side of the generic-prose fallback: unknown
 * template sections get plain prose instead of a specialised layout.
 */
export function genericProseApplicator(
  ctx: ApplicatorContext,
  slide: SlideProfile,
) {
  const footer = applyFooter(ctx);
  const map = buildGenericProseMap(ctx, slide);

  return (s: ISlide) => {
    s.modify((doc: XMLDocument) => {
      // Paragraph-level first (same reason as proseApplicator: PowerPoint's
      // spell-checker splits Swedish placeholders across runs).
      replaceParagraphTextNodes(map)(doc);
      replaceAllTextNodes(map)(doc);
      footer(doc);
    });
  };
}

/**
 * Placeholder → generated-text map for a slide's generic-prose slots. Pure and
 * exported so the slot↔section matching is unit-testable without a pptx. A slot
 * whose section is missing is left out of the map → placeholder stays visible
 * (data-missing signal, same convention as proseApplicator).
 */
export function buildGenericProseMap(
  ctx: ApplicatorContext,
  slide: SlideProfile,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const slot of slide.slots) {
    if (slot.status === "skip") {
      // Användaren valde att lämna sloten tom — ersätt platshållaren med "" så
      // inget rått {token} läcker ut i det exporterade anbudet (routine-fynd #68;
      // export-vägran triggas inte för skip-slots eftersom inget failade).
      map[slot.placeholder] = "";
      continue;
    }
    if (slot.capability !== "generic-prose") continue;
    const sec = ctx.sections.find(
      (s) =>
        s.content?.format === "generic-prose" &&
        s.content.placeholder === slot.placeholder,
    );
    if (sec && sec.content?.format === "generic-prose") {
      map[slot.placeholder] = sec.content.text;
    }
  }
  return map;
}
