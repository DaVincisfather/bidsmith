import type { ISlide } from "pptx-automizer/dist/interfaces/islide";
// pptx-automizer SlideModificationCallback: (document: XmlDocument) => void
// XmlDocument = XMLDocument (standard DOM). We walk <a:t> nodes to do global
// string replacement across all text frames on the slide.
import type { ApplicatorContext } from "../types";
import { replaceAllTextNodes } from "./_footer";

/** Returns a pptx-automizer slide callback that fills the cover slide placeholders. */
export function coverApplicator(ctx: ApplicatorContext) {
  const { master } = ctx;

  const replacements: Record<string, string> = {
    "{Bolagsnamn}": master.companyName,
    "{Kundnamn}": master.clientName,
    "{Upphandlingens namn}": master.bidName,
    "{Diarienummer}": master.diaryNumber,
    // {Anbudsdatum} appears TWICE on slide 1 — replaceAllTextNodes replaces all occurrences.
    "{Anbudsdatum}": master.bidDate,
  };

  // addSlide callback receives ISlide; slide.modify receives SlideModificationCallback.
  return (slide: ISlide) => {
    slide.modify(replaceAllTextNodes(replacements));
  };
}
