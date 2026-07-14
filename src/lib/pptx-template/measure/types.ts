/**
 * The measurement core's data model (design doc 2026-07-14-measure-core-design.md).
 * ONE source of truth for check ids, their measurement source (com = needs the
 * PowerPoint COM renderer, xml = derivable from pptx XML — the subset a future
 * app surface can run without a renderer), severities, and thresholds. The
 * thresholds are START values — Task 7 tunes them against the ground-truth decks
 * before the scanner gets gate authority (the deck:dupes lesson).
 */

export type CheckId =
  | "vertical-overflow" | "outside-slide" | "horizontal-clip"
  | "single-line-break" | "autofit-shrink" | "deadspace" | "raw-token";
export type CheckSource = "com" | "xml";
export type Severity = "FAIL" | "WARN" | "INFO";

export const CHECK_SOURCES: Record<CheckId, CheckSource> = {
  "vertical-overflow": "com",
  "outside-slide": "com",
  "horizontal-clip": "com",
  "single-line-break": "com",
  "autofit-shrink": "com",
  deadspace: "com",
  "raw-token": "xml",
};

export const SEVERITIES: Record<CheckId, Severity> = {
  // Within-box overflow is frequently intentional design: PowerPoint renders
  // text past a box's nominal bounds without clipping, and the empty Radrum
  // template alone carries 47 such boxes (labels in small nominal boxes with
  // room left below by design). FAIL-grade signals are reserved for text that
  // actually leaves the slide (outside-slide) and raw un-rendered tokens
  // (raw-token) — those are the real problems; this one is a WARN.
  "vertical-overflow": "WARN",
  "outside-slide": "FAIL",
  "raw-token": "FAIL",
  "horizontal-clip": "WARN",
  "single-line-break": "WARN",
  "autofit-shrink": "WARN",
  deadspace: "INFO", // per-box; the slide aggregate is emitted as WARN by deadspaceFindings
};

/** Superset of the calibration loop's ShapeMeasurement — every field the
 *  enriched measure-overflow.ps1 emits per text shape. */
export interface ShapeMeasurementV2 {
  slide: number;
  name: string;
  topPt: number;
  leftPt: number;
  widthPt: number;
  heightPt: number;
  boundHeightPt: number;
  /** -1 when BoundWidth threw on a degenerate shape — width checks skip it. */
  boundWidthPt: number;
  marginTopPt: number;
  marginBottomPt: number;
  marginLeftPt: number;
  marginRightPt: number;
  wordWrap: boolean;
  /** msoAutoSize: 0 none, 1 shape-grows-to-fit-text (spAuto), 2 text-shrinks (norm). */
  autoSize: number;
  /** null when the shape mixes font sizes (COM returns a sentinel). */
  fontSizePt: number | null;
  textPrefix: string;
  textLength: number;
}

export interface MeasurementFile {
  slideCount: number;
  slideWidthPt: number;
  slideHeightPt: number;
  shapes: ShapeMeasurementV2[];
}

export interface Finding {
  checkId: CheckId;
  severity: Severity;
  slide: number;
  /** Shape name, or "(slide)" for slide-level findings. */
  shape: string;
  detail: string;
}

export const THRESHOLDS = {
  tolerancePt: 2,
  /** Calibration overflow signal: any shrink at all means "did not fit". */
  minFontScalePct: 99,
  /** Scanner finding: shrink below this is a readability problem. */
  uglyFontScalePct: 80,
  /** boundHeight > factor × line height ⇒ the text wrapped. */
  singleLineFactor: 1.6,
  /** Default PowerPoint line spacing. */
  lineSpacingFactor: 1.2,
  deadspaceFillRatio: 0.35,
  deadspaceMinBoxPt: 60,
  deadspaceSlideShare: 0.5,
} as const;
