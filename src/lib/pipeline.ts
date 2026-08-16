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

export interface RailBidEntry {
  bid: BidSummary;
  /** Antal inlämnade rader (alla utfall) som delar analys — "N versioner".
   *  1 när anbudet är ensamt om sin analys eller saknar analyskoppling. */
  versionsCount: number;
}

export interface DashboardSplit {
  awaiting: RailBidEntry[];
  archive: RailBidEntry[];
}

/**
 * Railens vy av inlämnade anbud (pipeline-UX-passet 2026-08-16, Stefans
 * direktiv): väntar-beslut visar EN rad per analys (senaste inlämningen;
 * legacy-dubbletter från före en-analys-ett-anbud-regeln #103 kollapsas i
 * VISNINGEN — raderna finns kvar och bär utfallshistoriken), avgjorda flyttar
 * till arkivet. Rader utan analyskoppling kan inte dedupas och visas var för sig.
 */
export function splitDashboard(items: BidSummary[]): DashboardSplit {
  const versionsByAnalysis = new Map<string, number>();
  for (const b of items) {
    if (b.analysisId === null) continue;
    versionsByAnalysis.set(b.analysisId, (versionsByAnalysis.get(b.analysisId) ?? 0) + 1);
  }

  const latestAwaiting = new Map<string, BidSummary>();
  const orphanAwaiting: BidSummary[] = [];
  for (const b of items) {
    if (b.outcome !== null) continue;
    if (b.analysisId === null) {
      orphanAwaiting.push(b);
      continue;
    }
    const current = latestAwaiting.get(b.analysisId);
    if (!current || b.exportedAt.localeCompare(current.exportedAt) > 0) {
      latestAwaiting.set(b.analysisId, b);
    }
  }

  const withVersions = (bid: BidSummary): RailBidEntry => ({
    bid,
    versionsCount: bid.analysisId ? versionsByAnalysis.get(bid.analysisId) ?? 1 : 1,
  });

  const awaiting: RailBidEntry[] = [...latestAwaiting.values(), ...orphanAwaiting]
    .sort((a, b) => a.exportedAt.localeCompare(b.exportedAt)) // äldst väntar först
    .map(withVersions);

  const archive: RailBidEntry[] = items
    .filter((b) => b.outcome !== null)
    .sort((a, b) => {
      // Senast loggade först; rader utan loggtid sist.
      if (a.outcomeLoggedAt === null && b.outcomeLoggedAt === null) return 0;
      if (a.outcomeLoggedAt === null) return 1;
      if (b.outcomeLoggedAt === null) return -1;
      return b.outcomeLoggedAt.localeCompare(a.outcomeLoggedAt);
    })
    .map(withVersions);

  return { awaiting, archive };
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
