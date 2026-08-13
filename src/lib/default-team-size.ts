import { RfpAnalysis } from "@/lib/types";
import { MAX_TEAM_SIZE } from "@/lib/constants";

// Standard assignment size per Stefan's market picture, 2026-08-13 — used only
// when the RFP gives no explicit team size hint.
const DEFAULT_TEAM_SIZE = 3;

/**
 * How many consultants to pre-select for a team when no explicit choice has
 * been made yet. Follows the RFP's explicit team size hint (max — praxis
 * bemannar övre gränsen för ledighetstäckning), falling back to
 * DEFAULT_TEAM_SIZE when the underlag doesn't state a size.
 */
export function defaultTeamSize(analysis: Pick<RfpAnalysis, "teamSizeHint">): number {
  const hint = analysis.teamSizeHint;
  // A malformed persisted hint (missing/non-numeric max) must not propagate
  // NaN into slice(0, NaN) downstream — fall back to the default instead.
  if (!hint || !Number.isFinite(hint.max)) return DEFAULT_TEAM_SIZE;
  return Math.min(Math.max(hint.max, 1), MAX_TEAM_SIZE);
}
