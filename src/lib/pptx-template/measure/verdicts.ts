import { SEVERITIES, THRESHOLDS, type CheckId, type Finding, type ShapeMeasurementV2 } from "./types";

/**
 * The seven checks as pure functions over COM measurements (design doc
 * 2026-07-14-measure-core-design.md). Shared by the calibration loop and the
 * deck scanner so the two can never drift apart — the "grönt men fult" lesson.
 * raw-token is xml-side and lives with the scanner (it needs readPptxSlides,
 * not a measurement).
 */

const MARKER_RE = /^«([^»]+)»/;

/** "«Om oss» Vi …" → "Om oss"; null when the shape carries no calibration fill.
 *  (Moved unchanged from calibrate/overflow.ts.) */
export function markerOf(textPrefix: string): string | null {
  const m = MARKER_RE.exec(textPrefix);
  return m ? m[1] : null;
}

function finding(checkId: CheckId, m: ShapeMeasurementV2, detail: string): Finding {
  return { checkId, severity: SEVERITIES[checkId], slide: m.slide, shape: m.name, detail };
}

/** Text laid out taller than the box's available height (non-growing boxes). */
export function checkVerticalOverflow(m: ShapeMeasurementV2): Finding | null {
  const available = m.heightPt - m.marginTopPt - m.marginBottomPt;
  if (m.boundHeightPt > available + THRESHOLDS.tolerancePt) {
    return finding("vertical-overflow", m, `text ${m.boundHeightPt}pt > box ${Math.round(available)}pt`);
  }
  return null;
}

/** Where the TEXT lands relative to the slide — not the box. Box-based bleed is
 *  frequently legitimate design (a Radrum kicker/footer box extends ~50pt past
 *  the slide edge with no text anywhere near there); flagging the box itself
 *  produces noise with no real overflow. Checks:
 *  - bottom: always, via textBottom = topPt + marginTopPt + boundHeightPt.
 *  - right: ONLY for no-wrap text (wordWrap === false && boundWidthPt >= 0), via
 *    textRight = leftPt + marginLeftPt + boundWidthPt. For wrapped or centered
 *    text, leftPt + boundWidthPt overestimates where the text actually sits
 *    (COM's BoundWidth for wrapped text is the wrap width, not the ink extent,
 *    and centered text is not flush against leftPt) — deliberately not checked
 *    in v1 to avoid false positives on the common case.
 *
 *  Top-anchor assumption (bottom check): topPt + marginTopPt + boundHeightPt is
 *  exact for top-anchored frames, and also exact for spAutoFit-grown boxes
 *  regardless of anchor (the box itself grows to hug the text, so its top
 *  already tracks where the text starts). It UNDERESTIMATES the true text
 *  bottom for middle- or bottom-anchored, NON-growing boxes — PowerPoint
 *  centers/bottom-aligns the text inside the box's fixed height there, so the
 *  ink sits lower than this formula implies. measure-overflow.ps1 does not yet
 *  emit VerticalAnchor, so this check cannot tell that case apart: the failure
 *  mode is a false NEGATIVE (a real outside-slide bottom overflow goes
 *  unflagged) on non-growing, non-top-anchored boxes — never a false positive. */
export function checkOutsideSlide(m: ShapeMeasurementV2, slideWidthPt: number, slideHeightPt: number): Finding | null {
  const textBottom = m.topPt + m.marginTopPt + m.boundHeightPt;
  const bottomOut = textBottom > slideHeightPt + THRESHOLDS.tolerancePt;
  const checkRight = m.wordWrap === false && m.boundWidthPt >= 0;
  const textRight = m.leftPt + m.marginLeftPt + m.boundWidthPt;
  const rightOut = checkRight && textRight > slideWidthPt + THRESHOLDS.tolerancePt;
  if (bottomOut || rightOut) {
    return finding("outside-slide", m, `text bottom ${Math.round(textBottom)}pt / right ${checkRight ? Math.round(textRight) : "n/a"}pt vs slide ${slideWidthPt}×${slideHeightPt}pt`);
  }
  return null;
}

/** No-wrap text clipped against its box or running past the slide edge. */
export function checkHorizontalClip(m: ShapeMeasurementV2, slideWidthPt: number): Finding | null {
  if (m.wordWrap || m.boundWidthPt < 0) return null;
  const available = m.widthPt - m.marginLeftPt - m.marginRightPt;
  const pastBox = m.boundWidthPt > available + THRESHOLDS.tolerancePt;
  const pastSlide = m.leftPt + m.boundWidthPt > slideWidthPt + THRESHOLDS.tolerancePt;
  if (pastBox || pastSlide) {
    return finding("horizontal-clip", m, `no-wrap text ${m.boundWidthPt}pt vs box ${Math.round(available)}pt (slide width ${slideWidthPt}pt)`);
  }
  return null;
}

/** A grow-to-fit box whose text wrapped to multiple lines — a one-line field
 *  that received prose (the vecka-box class). Needs a known font size. */
export function checkSingleLineBreak(m: ShapeMeasurementV2): Finding | null {
  if (m.autoSize !== 1 || m.fontSizePt === null) return null;
  const lineHeight = m.fontSizePt * THRESHOLDS.lineSpacingFactor;
  if (m.boundHeightPt > THRESHOLDS.singleLineFactor * lineHeight) {
    return finding("single-line-break", m, `text ${m.boundHeightPt}pt tall vs one line ≈ ${Math.round(lineHeight)}pt`);
  }
  return null;
}

/** normAutofit shrank the text below readable size (scanner threshold 80 %). */
export function checkAutofitShrink(m: ShapeMeasurementV2, fontScalePct: number | null): Finding | null {
  if (fontScalePct !== null && fontScalePct < THRESHOLDS.uglyFontScalePct) {
    return finding("autofit-shrink", m, `autofit shrank text to ${fontScalePct}%`);
  }
  return null;
}

/** Slide-level deadspace: most LARGE boxes on a slide barely filled. Emits one
 *  INFO per underfilled large box + one WARN per offending slide. */
export function deadspaceFindings(shapes: ShapeMeasurementV2[]): Finding[] {
  const out: Finding[] = [];
  const bySlide = new Map<number, ShapeMeasurementV2[]>();
  for (const m of shapes) {
    const arr = bySlide.get(m.slide) ?? [];
    arr.push(m);
    bySlide.set(m.slide, arr);
  }
  for (const [slide, slideShapes] of bySlide) {
    const large = slideShapes.filter(
      (m) => m.heightPt - m.marginTopPt - m.marginBottomPt >= THRESHOLDS.deadspaceMinBoxPt,
    );
    if (large.length < 2) continue;
    const underfilled = large.filter((m) => {
      const available = m.heightPt - m.marginTopPt - m.marginBottomPt;
      return m.boundHeightPt / available < THRESHOLDS.deadspaceFillRatio;
    });
    for (const m of underfilled) {
      out.push(finding("deadspace", m, `fill ${Math.round((m.boundHeightPt / (m.heightPt - m.marginTopPt - m.marginBottomPt)) * 100)}%`));
    }
    if (underfilled.length / large.length >= THRESHOLDS.deadspaceSlideShare) {
      out.push({ checkId: "deadspace", severity: "WARN", slide, shape: "(slide)",
        detail: `${underfilled.length}/${large.length} large boxes under ${THRESHOLDS.deadspaceFillRatio * 100}% filled` });
    }
  }
  return out;
}

export interface ShapeVerdict {
  overBudget: boolean;
  signals: CheckId[];
}

/** The calibration loop's overflow verdict: the three geometric signals plus
 *  ANY autofit shrink (99 % — stricter than the scanner's readability 80 %,
 *  because for budget search any shrink means "did not fit at nominal size"). */
export function calibrationVerdict(
  m: ShapeMeasurementV2,
  fontScalePct: number | null,
  slideWidthPt: number,
  slideHeightPt: number,
): ShapeVerdict {
  const signals: CheckId[] = [];
  if (checkVerticalOverflow(m)) signals.push("vertical-overflow");
  if (checkOutsideSlide(m, slideWidthPt, slideHeightPt)) signals.push("outside-slide");
  if (checkHorizontalClip(m, slideWidthPt)) signals.push("horizontal-clip");
  if (fontScalePct !== null && fontScalePct < THRESHOLDS.minFontScalePct) signals.push("autofit-shrink");
  return { overBudget: signals.length > 0, signals };
}
