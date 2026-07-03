import type { ISlide } from "pptx-automizer/dist/interfaces/islide";
import type { ApplicatorContext } from "../types";
import {
  applyFooter,
  replaceAllTextNodes,
  replaceParagraphTextNodes,
} from "./_footer";

/**
 * Prose applicator — handles the three understanding slides.
 *
 * Dispatches on ctx.variant (kunden-idag/uppdraget/vision) to pick the right
 * placeholder map.
 * If the corresponding BidSection is missing from ctx.sections, placeholders
 * are left unreplaced (visible in output as a data-missing signal).
 *
 * Unused slot-cap items (smärtpunkter, utmaningar, värden) are replaced with
 * empty string "". TODO: full shape removal if empty frames look visually bad.
 */
export function proseApplicator(ctx: ApplicatorContext) {
  const footer = applyFooter(ctx);

  return (slide: ISlide) => {
    const map = buildProseMap(ctx);
    slide.modify((doc: XMLDocument) => {
      // Paragraph-level first: placeholders like {Stycken}/{Utmaningar}/{Värden}
      // get split by PowerPoint's spell-checker across multiple <a:r> runs
      // (err="1" flags "unknown" Swedish words), so a single-node pass misses them.
      replaceParagraphTextNodes(map)(doc);
      replaceAllTextNodes(map)(doc);
      footer(doc);
    });
  };
}

function buildProseMap(ctx: ApplicatorContext): Record<string, string> {
  switch (ctx.variant) {
    case "kunden-idag":
      return buildSlide3Map(ctx);
    case "uppdraget":
      return buildSlide4Map(ctx);
    case "vision":
      return buildSlide5Map(ctx);
    default:
      // Fail loud on a prose slide we can't map. Distinguish missing variant (a
      // manifest config error — identify-slides always sets one) from an unknown
      // variant value (a foreign profile string that passed the `as ProseVariant`
      // cast in render-from-profile) so the message points at the real cause.
      throw new Error(
        ctx.variant
          ? `prose-slide (source ${ctx.sourceSlide}) har okänd variant "${ctx.variant}"`
          : `prose-slide (source ${ctx.sourceSlide}) saknar variant i manifestet`,
      );
  }
}

// ---------------------------------------------------------------------------
// Slide 3 — Kunden idag
// Sections: A (organisation/system/processer) + B (smärtpunkter, cap 4)
// ---------------------------------------------------------------------------

function buildSlide3Map(ctx: ApplicatorContext): Record<string, string> {
  const sec = ctx.sections.find(
    (s) => s.content?.format === "understanding-current",
  );
  if (!sec || sec.content?.format !== "understanding-current") {
    // Missing section — leave placeholders unreplaced so gap is visible
    return {};
  }
  const c = sec.content;
  const sp = c.smärtpunkter.filter((s) => s && s.trim().length > 0);

  // One-box pattern (parallel to slide 4/5). {Nuläge} is a single flowing
  // block with inline section labels; expandMultiline clones the host
  // paragraph per \n, so each line/section inherits the same rPr. The
  // template textbox rPr determines visual output; labels become natural
  // inline prefixes.
  const nulage = [
    `Organisation — ${c.organisation}`,
    `System — ${c.system}`,
    `Processer — ${c.processer}`,
  ].join("\n\n");

  return {
    "{Nuläge}": nulage,
    "{Smärtpunkter}": sp.join("\n"),
  };
}

// ---------------------------------------------------------------------------
// Slide 4 — Uppdragsbeskrivning
// Single {Stycken} placeholder — paragraphs separated by blank line (\n\n).
// expandMultiline() in _footer.ts clones <a:p> per \n so each stycke becomes
// its own paragraph, inheriting pPr/rPr from the template placeholder.
// ---------------------------------------------------------------------------

function buildSlide4Map(ctx: ApplicatorContext): Record<string, string> {
  const sec = ctx.sections.find(
    (s) => s.content?.format === "understanding-assignment",
  );
  if (!sec || sec.content?.format !== "understanding-assignment") {
    return {};
  }
  const stycken = sec.content.stycken.filter((s) => s && s.trim().length > 0);

  return {
    "{Stycken}": stycken.join("\n\n"),
  };
}

// ---------------------------------------------------------------------------
// Slide 5 — Utmaningar och värde
// Two placeholders: {Utmaningar} and {Värden}, each flowing N bullets via \n.
// Each bullet becomes its own paragraph (inherits bullet marker styling).
// ---------------------------------------------------------------------------

function buildSlide5Map(ctx: ApplicatorContext): Record<string, string> {
  const sec = ctx.sections.find(
    (s) => s.content?.format === "understanding-vision",
  );
  if (!sec || sec.content?.format !== "understanding-vision") {
    return {};
  }
  const utm = sec.content.utmaningar.filter((s) => s && s.trim().length > 0);
  const val = sec.content.värden.filter((s) => s && s.trim().length > 0);

  return {
    "{Utmaningar}": utm.join("\n"),
    "{Värden}": val.join("\n"),
  };
}
