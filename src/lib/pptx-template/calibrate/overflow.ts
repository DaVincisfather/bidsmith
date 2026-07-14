/** Overflow verdicts from the COM measurement (scripts/measure-overflow.ps1). */

export interface ShapeMeasurement {
  slide: number;
  name: string;
  heightPt: number;
  boundHeightPt: number;
  marginTopPt: number;
  marginBottomPt: number;
  textPrefix: string;
}

/** BoundHeight is layout truth ±rounding; 2pt keeps borderline fits from flapping. */
export const OVERFLOW_TOLERANCE_PT = 2;
/** normAutofit shrink below this = the text did NOT fit at nominal size. */
export const MIN_FONT_SCALE_PCT = 99;

const MARKER_RE = /^«([^»]+)»/;

/** "«Om oss» Vi …" → "Om oss"; null when the shape carries no calibration fill. */
export function markerOf(textPrefix: string): string | null {
  const m = MARKER_RE.exec(textPrefix);
  return m ? m[1] : null;
}

/** true = the shape's text is over budget (spills, or autofit shrank it). */
export function verdictFor(
  m: ShapeMeasurement,
  fontScalePct: number | null,
): boolean {
  if (fontScalePct !== null && fontScalePct < MIN_FONT_SCALE_PCT) return true;
  const available = m.heightPt - m.marginTopPt - m.marginBottomPt;
  return m.boundHeightPt > available + OVERFLOW_TOLERANCE_PT;
}
