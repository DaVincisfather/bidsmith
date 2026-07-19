import type { PipelineItem, BidSummary, Urgency } from "./types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Today's calendar date (YYYY-MM-DD) in Europe/Stockholm — the users' and
 *  procurement deadlines' timezone. Using UTC made "today" flip 1-2 h early
 *  after local midnight, so a deadline that had passed locally still showed as
 *  "Idag"/0 days for that window. */
export function stockholmToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function daysUntil(isoDate: string, now: Date = new Date()): number {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  const targetUtc = Date.UTC(y, m - 1, d);
  const [ty, tm, td] = stockholmToday(now).split("-").map(Number);
  const todayUtc = Date.UTC(ty, tm - 1, td);
  return Math.round((targetUtc - todayUtc) / MS_PER_DAY);
}

export function calculateUrgency(daysLeft: number): Urgency {
  if (daysLeft < 7) return "urgent";
  if (daysLeft < 14) return "soon";
  return "later";
}

export function sortPipelineItems(items: PipelineItem[]): PipelineItem[] {
  // Deadline-less items sort LAST — they are actionable but not time-pressed.
  return [...items].sort(
    (a, b) =>
      (a.daysLeft ?? Number.POSITIVE_INFINITY) - (b.daysLeft ?? Number.POSITIVE_INFINITY),
  );
}

export function sortBidSummaries(items: BidSummary[]): BidSummary[] {
  return [...items].sort((a, b) => {
    const aAwaiting = a.outcome === null;
    const bAwaiting = b.outcome === null;

    // Awaiting before committed
    if (aAwaiting !== bAwaiting) return aAwaiting ? -1 : 1;

    // Both awaiting: oldest export first
    if (aAwaiting && bAwaiting) {
      return a.exportedAt.localeCompare(b.exportedAt);
    }

    // Both committed: newest logged first
    const aLog = a.outcomeLoggedAt;
    const bLog = b.outcomeLoggedAt;
    if (aLog === null && bLog === null) return 0;
    if (aLog === null) return 1;   // a goes last
    if (bLog === null) return -1;  // b goes last
    return bLog.localeCompare(aLog);
  });
}
