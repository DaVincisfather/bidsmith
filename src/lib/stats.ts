export type StatsPeriod = "all" | "30d" | "ytd";

export interface UserStats {
  userId: string;
  email: string;
  costUsd: number;
  bidsSubmitted: number;
  wins: number;
  losses: number;
  winRate: number | null;
}

export interface WorkspaceStats {
  period: StatsPeriod;
  totalCostUsd: number;
  bidsSubmitted: number;
  wins: number;
  losses: number;
  winRate: number | null;
  perUser: UserStats[];
}

export interface CostRow {
  user_id: string | null;
  cost_usd: number | string;
}

export interface BidRow {
  created_by: string | null;
  outcome: string | null;
}

const UNKNOWN_USER = "unknown";

export function periodStart(period: StatsPeriod, now: Date = new Date()): string | null {
  if (period === "all") return null;
  if (period === "30d") {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - 30);
    return d.toISOString();
  }
  // ytd: Jan 1 (UTC) of the current year
  return new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();
}

export function parsePeriod(raw: string | string[] | undefined): StatsPeriod {
  return raw === "30d" || raw === "ytd" ? raw : "all";
}

function winRate(wins: number, losses: number): number | null {
  const denom = wins + losses;
  return denom === 0 ? null : wins / denom;
}

export function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function formatPct(n: number | null): string {
  return n === null ? "—" : `${Math.round(n * 100)}%`;
}

export function aggregate(
  costRows: CostRow[],
  bidRows: BidRow[],
  emailById: Map<string, string>,
  period: StatsPeriod
): WorkspaceStats {
  const byUser = new Map<
    string,
    { costUsd: number; bidsSubmitted: number; wins: number; losses: number }
  >();
  const ensure = (id: string) => {
    let u = byUser.get(id);
    if (!u) {
      u = { costUsd: 0, bidsSubmitted: 0, wins: 0, losses: 0 };
      byUser.set(id, u);
    }
    return u;
  };

  for (const r of costRows) {
    const id = r.user_id ?? UNKNOWN_USER;
    ensure(id).costUsd += Number(r.cost_usd) || 0;
  }
  for (const r of bidRows) {
    if (r.outcome == null) continue; // query already filters; defensive
    const u = ensure(r.created_by ?? UNKNOWN_USER);
    u.bidsSubmitted += 1;
    if (r.outcome === "won") u.wins += 1;
    else if (r.outcome === "lost") u.losses += 1;
  }

  const perUser: UserStats[] = [...byUser.entries()]
    .map(([userId, u]) => ({
      userId,
      email:
        userId === UNKNOWN_USER
          ? "Okänd"
          : emailById.get(userId) ?? userId.slice(0, 8),
      costUsd: u.costUsd,
      bidsSubmitted: u.bidsSubmitted,
      wins: u.wins,
      losses: u.losses,
      winRate: winRate(u.wins, u.losses),
    }))
    .sort((a, b) => b.costUsd - a.costUsd);

  const totalCostUsd = perUser.reduce((s, u) => s + u.costUsd, 0);
  const bidsSubmitted = perUser.reduce((s, u) => s + u.bidsSubmitted, 0);
  const wins = perUser.reduce((s, u) => s + u.wins, 0);
  const losses = perUser.reduce((s, u) => s + u.losses, 0);

  return {
    period,
    totalCostUsd,
    bidsSubmitted,
    wins,
    losses,
    winRate: winRate(wins, losses),
    perUser,
  };
}
