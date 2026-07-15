import type { Finding } from "@/lib/pptx-template/measure/types";
import type { BidMeasurement, GateBreach, GateResult, KnownDefect } from "./types";

/** Fitness v1 — FRYST under en forskningskörning (design 2026-07-15).
 *  Trösklarna ändras av människa via PR, aldrig av loopen. */
export const GROSS_OVERFLOW_RATIO = 1.25;
export const GROSS_OVERFLOW_ABS_PT = 30;
export const DUP_PAIR_THRESHOLD = 0.3;
export const MIN_FILL_RATIO = 0.5;
export const VOLUME_MIN = 8000;
export const VOLUME_MAX = 14000;

function isKnownDefect(f: Finding, defects: KnownDefect[]): boolean {
  return defects.some((d) => d.slide === f.slide && d.checkId === f.checkId && d.shape === f.shape);
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

  const gross = bid.measurement.shapes.filter((s) => {
    const innerHeight = s.heightPt - s.marginTopPt - s.marginBottomPt;
    const over = s.boundHeightPt - innerHeight;
    return s.boundHeightPt > GROSS_OVERFLOW_RATIO * innerHeight || over > GROSS_OVERFLOW_ABS_PT;
  });

  if (gross.length > 0) {
    breaches.push({
      gate: "gross-overflow",
      detail: gross.map((s) => `slide ${s.slide} ${s.name}: ${s.boundHeightPt}pt i ${s.heightPt}pt-box`).join("; "),
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
  };
}
