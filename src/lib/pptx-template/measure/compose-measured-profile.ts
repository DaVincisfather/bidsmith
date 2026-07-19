// Composes one onboarding-measurement pass's results (defect scan + budget
// calibration) into a single updated TemplateProfile — the CLI's one atomic
// save (design doc 2026-07-19-onboarding-measure-design.md). Pure: no I/O.
import type { CalibrationReport } from "../calibrate/calibrate";
import { applyBudgets } from "../calibrate/calibrate";
import type { TemplateDefect, TemplateProfile } from "../template-profile";
import { defectSuggestion, mergeDefectAccepts } from "./template-defects";
import type { EmptyScanDefect } from "./empty-scan";

export function composeMeasuredProfile(
  profile: TemplateProfile,
  report: CalibrationReport,
  scanned: EmptyScanDefect[],
  now: string,
): TemplateProfile {
  const withBudgets = applyBudgets(profile, report.results);

  const slotWarnings: Record<string, string[]> = {};
  for (const r of report.results) {
    if (r.warnings.length > 0) slotWarnings[r.token] = r.warnings;
  }

  const nextDefects: TemplateDefect[] = scanned.map((s) => ({
    ...s,
    suggestion: defectSuggestion(
      s.checkId,
      s.note + (s.baselineBoundHeightPt ? `, baseline ${s.baselineBoundHeightPt} pt` : ""),
    ),
    status: "open" as const,
  }));

  return {
    ...withBudgets,
    measurement: {
      status: "complete",
      measuredAt: now,
      calibrationRounds: report.rounds,
      unresolved: report.unresolved,
      slotWarnings,
    },
    knownDefects: mergeDefectAccepts(profile.knownDefects, nextDefects),
  };
}
