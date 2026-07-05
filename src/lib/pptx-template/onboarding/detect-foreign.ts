import type { SlideShapes } from "../introspect/read-pptx";

/**
 * En kundmall utan ETT ENDA {token} är "foreign" → onboarding-vägen. Mallar
 * med några tokens men fel konvention går kvar i dagens introspektions-422
 * (delvis instrumenterade mallar är re-onboarding-merge, backloggad).
 */
export function isForeignPptx(slides: SlideShapes[]): boolean {
  return slides.every((s) => s.tokens.length === 0);
}
