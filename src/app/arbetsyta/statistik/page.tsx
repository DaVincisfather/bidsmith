import Link from "next/link";
import {
  getWorkspaceStats,
  parsePeriod,
  formatUsd,
  formatPct,
  type StatsPeriod,
} from "@/lib/stats";

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
    <main className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Statistik</h1>
          <div className="flex gap-1 text-sm">
            {PERIODS.map((p) => (
              <Link
                key={p.key}
                href={`/arbetsyta/statistik?period=${p.key}`}
                className={
                  p.key === period
                    ? "rounded bg-gray-900 px-3 py-1 text-white"
                    : "rounded px-3 py-1 text-gray-500 hover:text-gray-900"
                }
              >
                {p.label}
              </Link>
            ))}
          </div>
        </div>

        <p className="mb-8 text-sm text-gray-700">
          Total: {formatUsd(stats.totalCostUsd)} · {stats.bidsSubmitted} anbud ·
          win-rate {formatPct(stats.winRate)} ({stats.wins} W / {stats.losses} L)
        </p>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-2 font-medium">Användare</th>
              <th className="py-2 text-right font-medium">Kostnad</th>
              <th className="py-2 text-right font-medium">Anbud</th>
              <th className="py-2 text-right font-medium">W / L</th>
              <th className="py-2 text-right font-medium">Win-rate</th>
            </tr>
          </thead>
          <tbody>
            {stats.perUser.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-4 text-gray-400">
                  Ingen data ännu.
                </td>
              </tr>
            ) : (
              stats.perUser.map((u) => (
                <tr key={u.userId} className="border-b border-gray-100">
                  <td className="py-2">{u.email}</td>
                  <td className="py-2 text-right">{formatUsd(u.costUsd)}</td>
                  <td className="py-2 text-right">{u.bidsSubmitted}</td>
                  <td className="py-2 text-right">
                    {u.wins} / {u.losses}
                  </td>
                  <td className="py-2 text-right">{formatPct(u.winRate)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
