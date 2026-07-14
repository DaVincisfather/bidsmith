import type { SlideShapes } from "../introspect/read-pptx";
import { genericGeometricCapacity, isSingleLineBox, singleLineCapacity } from "../introspect/compute-budgets";
import type { TemplateProfile } from "../template-profile";

/**
 * Calibration plan: which slots to measure, from WHERE (slide + shape via the
 * instrumented pptx's tokens), sharing which shape, starting at which guess.
 * The marker (token name sans braces) is what maps a rendered shape back to
 * its slot on the measurement side — see test-prose.fillText.
 */

export const DEFAULT_GUESS = 300;

export interface CalibrationTarget {
  token: string;
  marker: string;
  source: number;
  shareCount: number;
  initialGuess: number;
  geometryMissing: boolean;
  /** Geometry says the box holds exactly one line — budget is capped at lineCapChars. */
  singleLine: boolean;
  /** Per-slot one-line capacity (capacity / shareCount); null when not single-line. */
  lineCapChars: number | null;
}

export function planTargets(
  slides: SlideShapes[],
  profile: TemplateProfile,
): CalibrationTarget[] {
  // Fillable = same filter as generateSectionsFromProfile: generic-prose, not skip.
  const fillable = new Set<string>();
  for (const slide of profile.slides) {
    for (const slot of slide.slots) {
      if (slot.capability === "generic-prose" && slot.status !== "skip") {
        fillable.add(slot.placeholder);
      }
    }
  }

  const targets: CalibrationTarget[] = [];
  for (const slide of slides) {
    for (const shape of slide.shapes) {
      const shapeTokens = shape.tokens.filter((t) => fillable.has(t));
      if (shapeTokens.length === 0) continue;
      const capacity = genericGeometricCapacity(shape);
      const singleLine = isSingleLineBox(shape);
      const lineCap = singleLine ? singleLineCapacity(shape) : null;
      for (const token of shapeTokens) {
        targets.push({
          token,
          marker: token.slice(1, -1),
          source: slide.source,
          shareCount: shapeTokens.length,
          initialGuess:
            capacity === null
              ? DEFAULT_GUESS
              : Math.max(1, Math.round(capacity / shapeTokens.length)),
          geometryMissing: capacity === null,
          singleLine,
          lineCapChars: lineCap === null ? null : Math.max(1, Math.round(lineCap / shapeTokens.length)),
        });
      }
    }
  }
  return targets;
}
