/**
 * Soft-cap warning helper for PPTX-template applicators.
 *
 * Logs a `console.warn` when `text.length` exceeds `threshold`. Does not
 * mutate text. Called before text replacement in the applicator for fields
 * where overflow is a known risk in the template textbox.
 *
 * Thresholds are design-time estimates (see spec
 * 2026-04-29-pptx-bullets-pass-design.md). They are calibrated once the
 * stress-fixture runs and the overflow fixes are in place per slide.
 */
export function softCap(
  slide: number,
  field: string,
  text: string,
  threshold: number,
): void {
  if (text.length > threshold) {
    console.warn(
      `[soft-cap] slide ${slide} field '${field}' length ${text.length} > recommended ${threshold} — overflow likely`,
    );
  }
}
