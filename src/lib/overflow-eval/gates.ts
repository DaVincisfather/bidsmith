import type { Finding, MeasurementFile, ShapeMeasurementV2 } from "@/lib/pptx-template/measure/types";
import type { BidMeasurement, GateBreach, GateResult, KnownDefect } from "./types";

/** Fitness v1 — FRYST under en forskningskörning (design 2026-07-15).
 *  Trösklarna ändras av människa via PR, aldrig av loopen. */
export const GROSS_OVERFLOW_RATIO = 1.25;
export const GROSS_OVERFLOW_ABS_PT = 30;
export const DUP_PAIR_THRESHOLD = 0.3;
export const MIN_FILL_RATIO = 0.5;
export const VOLUME_MIN = 8000;
export const VOLUME_MAX = 14000;
/** Magnitude cap on the gross-overflow defect exclusion: a defect-listed
 *  shape rides the exclusion only while its measured boundHeightPt stays
 *  within this many points of the empty-substrate baseline
 *  (KnownDefect.baselineBoundHeightPt) — so generated content overflowing far
 *  past the template's own static defect still breaches the gate instead of
 *  escaping for free (findings review 2026-07-15). */
export const DEFECT_BASELINE_TOLERANCE_PT = 5;

function isKnownDefect(f: Finding, defects: KnownDefect[]): boolean {
  return defects.some((d) => d.slide === f.slide && d.checkId === f.checkId && d.shape === f.shape);
}

interface GrossClassification {
  breaching: ShapeMeasurementV2[];
  excluded: ShapeMeasurementV2[];
}

/** Classifies every shape crossing the raw gross-overflow magnitude
 *  threshold into shapes that breach the gate vs. shapes excluded by a
 *  matching known template defect. A defect-listed shape is excluded ONLY
 *  while it hasn't grown past baseline + DEFECT_BASELINE_TOLERANCE_PT;
 *  defects with no recorded baseline (only FAIL-class entries lack one —
 *  see KnownDefect) keep the unconditional exclusion this gate had before
 *  the magnitude cap. */
function classifyGrossOverflow(measurement: MeasurementFile, knownDefects: KnownDefect[]): GrossClassification {
  const breaching: ShapeMeasurementV2[] = [];
  const excluded: ShapeMeasurementV2[] = [];
  for (const s of measurement.shapes) {
    const innerHeight = s.heightPt - s.marginTopPt - s.marginBottomPt;
    const over = s.boundHeightPt - innerHeight;
    const isGross = s.boundHeightPt > GROSS_OVERFLOW_RATIO * innerHeight || over > GROSS_OVERFLOW_ABS_PT;
    if (!isGross) continue;

    const defect = knownDefects.find((d) => d.checkId === "gross-overflow" && d.slide === s.slide && d.shape === s.name);
    if (!defect) {
      breaching.push(s);
      continue;
    }
    const withinBaseline =
      defect.baselineBoundHeightPt === undefined ||
      s.boundHeightPt <= defect.baselineBoundHeightPt + DEFECT_BASELINE_TOLERANCE_PT;
    if (withinBaseline) {
      excluded.push(s);
    } else {
      breaching.push(s);
    }
  }
  return { breaching, excluded };
}

/** Gross-overflow shapes, minus shapes that match a known template-static
 *  defect (evals/overflow/known-template-defects.json) and stay within its
 *  magnitude-cap tolerance — those overflow even in the empty template and
 *  would otherwise breach every varv. Shared with report.ts so gate and
 *  report counts never diverge. */
export function grossOverflowShapes(measurement: MeasurementFile, knownDefects: KnownDefect[]): ShapeMeasurementV2[] {
  return classifyGrossOverflow(measurement, knownDefects).breaching;
}

export function applyGates(bid: BidMeasurement, knownDefects: KnownDefect[]): GateResult {
  const breaches: GateBreach[] = [];
  const excludedDefects = bid.findings.filter((f) => f.severity === "FAIL" && isKnownDefect(f, knownDefects));
  const realFails = bid.findings.filter((f) => f.severity === "FAIL" && !isKnownDefect(f, knownDefects));

  if (realFails.length > 0) {
    breaches.push({
      gate: "fail-findings",
      detail: realFails.map((f) => `slide ${f.slide} ${f.shape}: ${f.detail}`).join("; "),
    });
  }

  const { breaching: gross, excluded: excludedGross } = classifyGrossOverflow(bid.measurement, knownDefects);

  if (gross.length > 0) {
    breaches.push({
      gate: "gross-overflow",
      detail: gross
        .map((s) => `slide ${s.slide} ${s.name}: ${s.boundHeightPt}pt i ${s.heightPt - s.marginTopPt - s.marginBottomPt}pt inre box`)
        .join("; "),
    });
  }

  const dups = bid.duplicates.filter((d) => d.similarity >= DUP_PAIR_THRESHOLD);
  if (dups.length > 0) {
    breaches.push({
      gate: "duplicates",
      detail: dups.map((d) => `slide ${d.slide}: ${d.similarity.toFixed(2)}`).join("; "),
    });
  }

  const thin = bid.fill.filter((f) => f.ratio < MIN_FILL_RATIO);
  if (thin.length > 0) {
    breaches.push({
      gate: "min-fill",
      detail: thin.map((f) => `${f.placeholder}: ${f.textChars}/${f.budgetChars}`).join("; "),
    });
  }

  if (bid.totalChars < VOLUME_MIN || bid.totalChars > VOLUME_MAX) {
    breaches.push({
      gate: "volume-corridor",
      detail: `${bid.totalChars} tecken (korridor ${VOLUME_MIN}–${VOLUME_MAX})`,
    });
  }

  return {
    fixtureId: bid.fixtureId,
    label: bid.label,
    pass: breaches.length === 0,
    breaches,
    excludedDefects,
    excludedGross,
  };
}
