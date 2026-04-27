import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, fetchConsultantsByIds, EMPTY_GO_NO_GO } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { getOrgId } from "@/lib/org";
import { generateAllSections } from "@/lib/bid-generator";
import { RfpAnalysis, ScoredConsultant, GoNoGoResult, BidSection } from "@/lib/types";
import type { BidContext } from "@/lib/bid-generator";
import { parseBody } from "@/lib/api-helpers";
import { BidCreateSchema } from "@/lib/api-schemas";

export async function POST(request: NextRequest) {
  const parsed = await parseBody(request, BidCreateSchema);
  if (!parsed.ok) return parsed.response;
  const { analysisId, assessmentId, teamConsultantIds } = parsed.data;

  const authed = await createClient();
  const orgId = await getOrgId(authed);
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
      organization_id: orgId,
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
    organizationId: orgId,
  };

  // Generate sections, saving progress to DB after each
  const sections = await generateAllSections(ctx, async (section: BidSection) => {
    const { data: currentBid } = await supabase
      .from("bids")
      .select("sections")
      .eq("id", bid.id)
      .single();

    const currentSections = (currentBid?.sections as BidSection[]) ?? [];
    currentSections.push(section);

    await supabase
      .from("bids")
      .update({ sections: currentSections })
      .eq("id", bid.id);
  });

  await supabase
    .from("bids")
    .update({ sections, status: "draft" })
    .eq("id", bid.id);

  return NextResponse.json({ id: bid.id, status: "draft", sections });
}
