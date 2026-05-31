import Link from "next/link";
import { createServiceClient } from "@/lib/supabase";
import { getWorkspaceStats, formatUsd } from "@/lib/stats";

// Reads live workspace data; never prerender at build time.
export const dynamic = "force-dynamic";

export default async function ArbetsytaPage() {
  const supabase = createServiceClient();
  const [{ count }, stats] = await Promise.all([
    supabase.from("consultants").select("id", { count: "exact", head: true }),
    getWorkspaceStats("all"),
  ]);

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-2xl font-bold mb-8">Arbetsyta</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <Link
            href="/consultants"
            className="block rounded-lg border border-gray-200 p-6 hover:border-gray-400"
          >
            <h2 className="text-lg font-semibold">Konsulter</h2>
            <p className="mt-1 text-sm text-gray-500">{count ?? 0} konsulter</p>
          </Link>
          <Link
            href="/arbetsyta/statistik"
            className="block rounded-lg border border-gray-200 p-6 hover:border-gray-400"
          >
            <h2 className="text-lg font-semibold">Statistik</h2>
            <p className="mt-1 text-sm text-gray-500">
              {formatUsd(stats.totalCostUsd)} · {stats.bidsSubmitted} anbud
            </p>
          </Link>
        </div>
      </div>
    </main>
  );
}
