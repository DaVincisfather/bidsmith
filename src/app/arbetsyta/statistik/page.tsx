import Link from "next/link";
import {
  getWorkspaceStats,
  parsePeriod,
  formatUsd,
  formatPct,
  type StatsPeriod,
} from "@/lib/stats";
import { StatsTable } from "./StatsTable";
import { CostBuckets } from "./CostBuckets";

// Reads live workspace data (also implicitly dynamic via searchParams); be explicit.
export const dynamic = "force-dynamic";

const PERIODS: { key: StatsPeriod; label: string }[] = [
  { key: "all", label: "Allt" },
  { key: "30d", label: "30 dgr" },
  { key: "ytd", label: "I år" },
];

export default async function StatistikPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: rawPeriod } = await searchParams;
  const period = parsePeriod(rawPeriod);
  const stats = await getWorkspaceStats(period);

  return (
    <main className="min-h-screen bg-paper">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-display font-normal">Statistik</h1>
          <div className="flex gap-1 text-sm">
            {PERIODS.map((p) => (
              <Link
                key={p.key}
                href={`/arbetsyta/statistik?period=${p.key}`}
                className={
                  p.key === period
                    ? "rounded border border-ink bg-ink px-3 py-1 text-paper"
                    : "rounded border border-rule px-3 py-1 text-ink-mute hover:text-ink hover:border-ink"
                }
              >
                {p.label}
              </Link>
            ))}
          </div>
        </div>

        <p className="mb-8 text-sm text-ink">
          Total: {formatUsd(stats.totalCostUsd)} · {stats.bidsSubmitted} anbud ·
          win-rate {formatPct(stats.winRate)} ({stats.wins} W / {stats.losses} L) ·{" "}
          {stats.pendingCount} pågående
        </p>

        <StatsTable perUser={stats.perUser} />

        <h2 className="mt-12 mb-4 text-lg font-display font-normal">
          Kostnad per kategori
        </h2>
        <CostBuckets costByLabel={stats.costByLabel} />
      </div>
    </main>
  );
}
