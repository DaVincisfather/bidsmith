// Threshold for treating a bid stuck in "generating" as a dead job. Shared by
// GET /api/bids/[id] (self-healing watchdog), POST /api/bids (replace guard)
// and unlock-team (reset guard) so the three routes cannot drift.
//
// INVARIANT: STALE_GENERATING_MS must exceed the real platform kill ceiling
// of POST /api/bids' generation (maxDuration, currently 300 s on Vercel
// Hobby) — if a "generating" row younger than the true ceiling were treated
// as dead, the replace path could overwrite a row whose runner is still
// alive, interleaving two generations.
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
