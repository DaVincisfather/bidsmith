import type { SlideShapes } from "../introspect/read-pptx";
import { genericGeometricCapacity } from "../introspect/compute-budgets";

/**
 * Upload-time geometry screen for foreign-template onboarding (design doc
 * TASK 6). Pure XML math against genericGeometricCapacity — no COM, so
 * autofit shrinking is invisible here (documented + accepted limitation).
 * Findings are PRELIMINARY by design: a starting signal carried into the
 * classification draft and shown in the wizard (next task), not a hard gate.
 */

/** Below this, a token-less candidate box is too small to be a realistic
 *  AI-fill target — flagged as tight-box rather than silently offered up. */
export const TIGHT_BOX_MIN_CHARS = 20;

export interface ScreenFinding {
  slide: number;
  /** shapeIndex (0-based among the slide's txBody shapes) — same addressing
   *  as CandidateSlot/DraftSlot, stringified per the ScreenFinding contract. */
  shape: string;
  kind: "static-overflow" | "tight-box";
  detail: string;
}

/** Screens every slide's shapes for two preliminary quality signals:
 *  - static-overflow: the customer's own static text is already longer than
 *    the box's measured capacity.
 *  - tight-box: an empty candidate box whose capacity is under
 *    TIGHT_BOX_MIN_CHARS — too small to realistically hold AI-written text.
 *  Token-bearing shapes (already instrumented) and shapes whose geometry is
 *  inherited/absent (capacity unmeasurable) are never flagged. */
export function screenSlides(slides: SlideShapes[]): ScreenFinding[] {
  const findings: ScreenFinding[] = [];
  for (const slide of slides) {
    slide.shapes.forEach((shape, shapeIndex) => {
      if (shape.tokens.length > 0) return; // already instrumented — never flagged
      const capacity = genericGeometricCapacity(shape);
      if (capacity === null) return; // inherited geometry — unmeasurable

      const text = shape.paragraphs.join("\n");
      const hasText = shape.paragraphs.some((p) => p.trim().length > 0);

      if (hasText) {
        if (text.length > capacity) {
          findings.push({
            slide: slide.source,
            shape: String(shapeIndex),
            kind: "static-overflow",
            detail: `statisk text ~${text.length} tecken, boxen rymmer ~${capacity}`,
          });
        }
      } else if (capacity < TIGHT_BOX_MIN_CHARS) {
        findings.push({
          slide: slide.source,
          shape: String(shapeIndex),
          kind: "tight-box",
          detail: `boxen rymmer ~${capacity} tecken`,
        });
      }
    });
  }
  return findings;
}
