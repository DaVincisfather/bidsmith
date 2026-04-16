import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrgId } from "@/lib/org";
import { sortBidSummaries } from "@/lib/pipeline";
import type { BidSummary, PipelineStats, RfpAnalysis } from "@/lib/types";

const MAX_ITEMS = 8;

export async function GET() {
  const supabase = await createClient();
  const orgId = await getOrgId(supabase);

  const { data: bids, error } = await supabase
    .from("bids")
    .select(`
      id, team_consultant_ids, outcome, outcome_logged_at,
      competitor_name, loss_reason, loss_comment, exported_at,
      analyses!inner(id, analysis)
    `)
    .eq("organization_id", orgId)
    .not("exported_at", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch consultant names for display
  const consultantIds = Array.from(
    new Set((bids ?? []).flatMap((b) => (b.team_consultant_ids as string[]) ?? []))
  );
  let consultants: { id: string; name: string }[] = [];
  if (consultantIds.length > 0) {
    const { data, error: consultantErr } = await supabase
      .from("consultants")
      .select("id, name")
      .in("id", consultantIds);

    if (consultantErr) {
      return NextResponse.json({ error: consultantErr.message }, { status: 500 });
    }
    consultants = (data ?? []) as { id: string; name: string }[];
  }

  const nameById = new Map(consultants.map((c) => [c.id, c.name]));

  const summaries: BidSummary[] = (bids ?? []).map((b) => {
    const analysis = (b.analyses as unknown as { analysis: RfpAnalysis })?.analysis;
    const title = (analysis?.title as string) ?? "Namnlös RFP";
    const ids = (b.team_consultant_ids as string[]) ?? [];
    return {
      id: b.id as string,
      title,
      exportedAt: b.exported_at as string,
      teamNames: ids.map((id) => nameById.get(id) ?? "—"),
      outcome: (b.outcome as BidSummary["outcome"]) ?? null,
      outcomeLoggedAt: (b.outcome_logged_at as string) ?? null,
      competitorName: (b.competitor_name as string) ?? null,
      lossReason: (b.loss_reason as BidSummary["lossReason"]) ?? null,
      lossComment: (b.loss_comment as string) ?? null,
    };
  });

  const sorted = sortBidSummaries(summaries);
  const items = sorted.slice(0, MAX_ITEMS);

  const stats: PipelineStats = {
    awaitingCount: summaries.filter((s) => s.outcome === null).length,
    loggedCount: summaries.filter((s) => s.outcome !== null).length,
    wonCount: summaries.filter((s) => s.outcome === "won").length,
    lostCount: summaries.filter((s) => s.outcome === "lost").length,
  };

  return NextResponse.json({ items, stats });
}
