import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createServiceClient, fetchConsultantsByIds, EMPTY_GO_NO_GO } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/org";
import { runBidGeneration } from "@/lib/bid-generator/run-bid-generation";
import { bundledTemplate } from "@/lib/pptx-template/registry";
import { RfpAnalysis, ScoredConsultant, GoNoGoResult } from "@/lib/types";
import type { BidContext } from "@/lib/bid-generator";
import { parseBody } from "@/lib/api-helpers";
import { BidCreateSchema } from "@/lib/api-schemas";

// 6 parallel Opus calls take 2–5 min — far beyond the default serverless
// timeout. The response returns immediately; generation continues via after()
// up to maxDuration. 300 s is the Vercel Hobby ceiling (raise to 800 on Pro).
// If the platform still kills the function, the stale-generating watchdog in
// GET /api/bids/[id] marks the bid 'failed' instead of leaving it stuck.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const parsed = await parseBody(request, BidCreateSchema);
  if (!parsed.ok) return parsed.response;
  const { analysisId, assessmentId, teamConsultantIds } = parsed.data;

  const authed = await createClient();
  const userId = await getUserId(authed);
  const supabase = createServiceClient();

  // Fetch all context in parallel
  const [analysisResult, assessmentResult, matchResult, teamConsultants] = await Promise.all([
    supabase.from("analyses").select("analysis").eq("id", analysisId).single(),
    assessmentId
      ? supabase.from("go_no_go_assessments").select("result").eq("id", assessmentId).single()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("matches")
      .select("team_proposal")
      .eq("analysis_id", analysisId)
      .order("created_at", { ascending: false })
      .limit(1),
    fetchConsultantsByIds(supabase, teamConsultantIds),
  ]);

  if (analysisResult.error || !analysisResult.data) {
    return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
  }

  const rfpAnalysis = analysisResult.data.analysis as RfpAnalysis;
  const goNoGoResult = (assessmentResult.data?.result as GoNoGoResult) ?? null;
  const allScoredConsultants = (matchResult.data?.[0]?.team_proposal as ScoredConsultant[]) ?? [];

  // Create bid record
  const { data: bid, error: bidError } = await supabase
    .from("bids")
    .insert({
      analysis_id: analysisId,
      assessment_id: assessmentId || null,
      created_by: userId,
      team_consultant_ids: teamConsultantIds,
      status: "generating",
    })
    .select()
    .single();

  if (bidError || !bid) {
    return NextResponse.json({ error: bidError?.message ?? "Failed to create bid" }, { status: 500 });
  }

  const ctx: BidContext = {
    analysis: rfpAnalysis,
    teamConsultants,
    scoredConsultants: allScoredConsultants,
    goNoGoResult: goNoGoResult ?? EMPTY_GO_NO_GO,
    userId,
    bidId: bid.id,
  };

  // Generation runs after the response is sent (Vercel: waitUntil). The
  // client polls GET /api/bids/[id] until status leaves 'generating'.
  // Template is the bundled manifest for now — Task 12 widens to the active
  // template once bids.template_id is set.
  after(() => runBidGeneration(supabase, bid.id, ctx, bundledTemplate()));

  return NextResponse.json({ id: bid.id, status: "generating" }, { status: 202 });
}
