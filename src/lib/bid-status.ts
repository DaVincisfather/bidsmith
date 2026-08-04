// Threshold for treating a bid stuck in "generating" as a dead job. Shared by
// GET /api/bids/[id] (self-healing watchdog), POST /api/bids (replace guard)
// and unlock-team (reset guard) so the three routes cannot drift.
export const STALE_GENERATING_MS = 7 * 60 * 1000;

/** True only for a generation that is plausibly still running. A "generating"
 *  row older than the stale threshold is a dead job (crashed/killed) — callers
 *  may treat it like "failed". Missing created_at counts as fresh (fail safe). */
export function isActivelyGenerating(bid: {
  status: string;
  created_at: string | null;
}): boolean {
  if (bid.status !== "generating") return false;
  if (!bid.created_at) return true;
  return Date.now() - new Date(bid.created_at).getTime() <= STALE_GENERATING_MS;
}
