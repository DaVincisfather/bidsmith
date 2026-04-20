import type { ISlide } from "pptx-automizer/dist/interfaces/islide";
import type { ApplicatorContext } from "../types";
import { applyFooter } from "./_footer";

/**
 * TOC applicator (slide 2).
 *
 * The TOC is fully static — all 17 entries are hard-coded in the mockup.
 * No row-cloning is needed. We only need to replace the footer placeholders
 * ({Bolagsnamn}, {Diarienummer}) and the slide counter (02 / 17).
 */
export function tocApplicator(ctx: ApplicatorContext) {
  const footer = applyFooter(ctx);
  return (slide: ISlide) => {
    slide.modify(footer);
  };
}
