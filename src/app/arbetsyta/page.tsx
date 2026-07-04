import Link from "next/link";
import { createServiceClient } from "@/lib/supabase";
import { getWorkspaceStats, formatUsd } from "@/lib/stats";

// Reads live workspace data; never prerender at build time.
export const dynamic = "force-dynamic";

export default async function ArbetsytaPage() {
  const supabase = createServiceClient();
  const [{ count }, { count: analysisCount }, { count: profileCount }, stats] =
    await Promise.all([
      supabase.from("consultants").select("id", { count: "exact", head: true }),
      supabase.from("analyses").select("id", { count: "exact", head: true }),
      // org_profiles saknas före migration 005 → count resolvar med error (kastar inte),
      // profileCount blir null och kortet visar "0 profiler".
      supabase.from("org_profiles").select("id", { count: "exact", head: true }),
      getWorkspaceStats("all"),
    ]);

  return (
    <main className="min-h-screen bg-paper">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-2xl font-display font-normal mb-8">Arbetsyta</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <Link
            href="/consultants"
            className="block rounded-lg border border-rule p-6 hover:border-accent"
          >
            <h2 className="text-lg font-display font-normal">Konsulter</h2>
            <p className="mt-1 text-sm text-ink-mute">{count ?? 0} konsulter</p>
          </Link>
          <Link
            href="/arbetsyta/statistik"
            className="block rounded-lg border border-rule p-6 hover:border-accent"
          >
            <h2 className="text-lg font-display font-normal">Statistik</h2>
            <p className="mt-1 text-sm text-ink-mute">
              {formatUsd(stats.totalCostUsd)} · {stats.bidsSubmitted} anbud
            </p>
          </Link>
          <Link
            href="/arbetsyta/analyser"
            className="block rounded-lg border border-rule p-6 hover:border-accent"
          >
            <h2 className="text-lg font-display font-normal">Analyser</h2>
            <p className="mt-1 text-sm text-ink-mute">
              {analysisCount ?? 0} analyserade RFP:er
            </p>
          </Link>
          <Link
            href="/arbetsyta/profil"
            className="block rounded-lg border border-rule p-6 hover:border-accent"
          >
            <h2 className="text-lg font-display font-normal">Företagsprofil</h2>
            <p className="mt-1 text-sm text-ink-mute">
              {profileCount ?? 0} profiler · röst &amp; bolagsfakta för anbud
            </p>
          </Link>
        </div>
      </div>
    </main>
  );
}
