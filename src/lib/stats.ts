import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase";

export type StatsPeriod = "all" | "30d" | "ytd";

export interface PendingBid {
  id: string;
  title: string;
  status: "draft" | "exported";
}

export interface PendingRow {
  id: string;
  created_by: string | null;
  status: "draft" | "exported";
  title: string;
}

export interface UserStats {
  userId: string;
  email: string;
  costUsd: number;
  bidsSubmitted: number;
  wins: number;
  losses: number;
  winRate: number | null;
  pending: PendingBid[];
}

export interface CostByLabel {
  label: string;
  costUsd: number;
  // Antal anrop under etiketten — driver bucket-vyns "N anrop" (cost-buckets.ts).
  count: number;
}

export interface WorkspaceStats {
  period: StatsPeriod;
  totalCostUsd: number;
  bidsSubmitted: number;
  wins: number;
  losses: number;
  winRate: number | null;
  pendingCount: number;
  perUser: UserStats[];
  // AI spend grouped by call type (ai_call_logs.label), cost desc. Surfaces
  // background/radar spend (e.g. "opportunity scoring") that carries no user.
  costByLabel: CostByLabel[];
}

export interface CostRow {
  user_id: string | null;
  cost_usd: number | string;
  label?: string | null;
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
  period: StatsPeriod,
  pendingRows: PendingRow[] = []
): WorkspaceStats {
  const byUser = new Map<
    string,
    { costUsd: number; bidsSubmitted: number; wins: number; losses: number; pending: PendingBid[] }
  >();
  const ensure = (id: string) => {
    let u = byUser.get(id);
    if (!u) {
      u = { costUsd: 0, bidsSubmitted: 0, wins: 0, losses: 0, pending: [] };
      byUser.set(id, u);
    }
    return u;
  };

  const byLabel = new Map<string, { costUsd: number; count: number }>();
  for (const r of costRows) {
    const id = r.user_id ?? UNKNOWN_USER;
    const cost = Number(r.cost_usd) || 0;
    ensure(id).costUsd += cost;
    const label = r.label ?? "Okänd typ";
    const l = byLabel.get(label) ?? { costUsd: 0, count: 0 };
    l.costUsd += cost;
    l.count += 1;
    byLabel.set(label, l);
  }
  for (const r of bidRows) {
    if (r.outcome == null) continue; // query already filters; defensive
    const u = ensure(r.created_by ?? UNKNOWN_USER);
    u.bidsSubmitted += 1;
    if (r.outcome === "won") u.wins += 1;
    else if (r.outcome === "lost") u.losses += 1;
  }
  for (const r of pendingRows) {
    ensure(r.created_by ?? UNKNOWN_USER).pending.push({
      id: r.id,
      title: r.title,
      status: r.status,
    });
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
      pending: u.pending,
    }))
    .sort((a, b) => b.costUsd - a.costUsd);

  const totalCostUsd = perUser.reduce((s, u) => s + u.costUsd, 0);
  const bidsSubmitted = perUser.reduce((s, u) => s + u.bidsSubmitted, 0);
  const wins = perUser.reduce((s, u) => s + u.wins, 0);
  const losses = perUser.reduce((s, u) => s + u.losses, 0);
  const pendingCount = pendingRows.length;

  const costByLabel: CostByLabel[] = [...byLabel.entries()]
    .map(([label, { costUsd, count }]) => ({ label, costUsd, count }))
    .sort((a, b) => b.costUsd - a.costUsd);

  return {
    period,
    totalCostUsd,
    bidsSubmitted,
    wins,
    losses,
    winRate: winRate(wins, losses),
    pendingCount,
    perUser,
    costByLabel,
  };
}

async function loadEmails(supabase: SupabaseClient): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    // One page of 1000 covers the demo. Loop pages if the user count grows.
    const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (error || !data) return map;
    for (const u of data.users) {
      if (u.email) map.set(u.id, u.email);
    }
  } catch {
    // Degrade: aggregate() falls back to a userId prefix.
  }
  return map;
}

interface PendingQueryRow {
  id: string;
  created_by: string | null;
  status: string;
  analyses: unknown; // !inner join: { analysis: RfpAnalysis } — cast on read (mirrors dashboard route)
}

export async function getWorkspaceStats(period: StatsPeriod): Promise<WorkspaceStats> {
  const supabase = createServiceClient();
  const start = periodStart(period);

  let costQuery = supabase.from("ai_call_logs").select("user_id, cost_usd, label");
  if (start) costQuery = costQuery.gte("created_at", start);
  const { data: costRows } = await costQuery;

  let bidQuery = supabase
    .from("bids")
    .select("created_by, outcome")
    .not("outcome", "is", null);
  if (start) bidQuery = bidQuery.gte("created_at", start);
  const { data: bidRows } = await bidQuery;

  // Pending bids ignore the period filter: an open bid from 60 days ago is
  // exactly what you want to chase, so it must not be hidden under "30 dgr".
  const { data: pendingRaw } = await supabase
    .from("bids")
    .select("id, created_by, status, analyses!inner(analysis)")
    .is("outcome", null)
    .in("status", ["draft", "exported"]);

  const pendingRows: PendingRow[] = ((pendingRaw as PendingQueryRow[]) ?? []).map((r) => ({
    id: r.id,
    created_by: r.created_by,
    status: r.status as PendingBid["status"],
    title:
      (r.analyses as unknown as { analysis: { title?: string } })?.analysis?.title ??
      "Namnlös RFP",
  }));

  const emailById = await loadEmails(supabase);

  return aggregate(
    (costRows as CostRow[]) ?? [],
    (bidRows as BidRow[]) ?? [],
    emailById,
    period,
    pendingRows
  );
}
