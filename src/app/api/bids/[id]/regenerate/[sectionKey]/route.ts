import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, fetchConsultantsByIds, EMPTY_GO_NO_GO } from "@/lib/supabase";
import { buildSection } from "@/lib/bid-generator";
import { DEFAULT_BID_PLAN } from "@/lib/bid-planner";
import type { PlannedSection } from "@/lib/bid-planner";
import { RfpAnalysis, ScoredConsultant, GoNoGoResult, BidSection } from "@/lib/types";
import { BidContext } from "@/lib/bid-section-prompts";

interface RouteContext {
  params: Promise<{ id: string; sectionKey: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteContext) {
  const { id, sectionKey } = await params;
  const supabase = createServiceClient();

  // Fetch bid
  const { data: bid, error: bidError } = await supabase
    .from("bids")
    .select("id, sections, analysis_id, assessment_id, team_consultant_ids")
    .eq("id", id)
    .single();

  if (bidError || !bid) {
    return NextResponse.json({ error: "Bid not found" }, { status: 404 });
  }

  const sections = bid.sections as BidSection[];
  const sectionIndex = sections.findIndex((s) => s.key === sectionKey);
  if (sectionIndex === -1) {
    return NextResponse.json({ error: `Section '${sectionKey}' not found` }, { status: 404 });
  }

  if (sections[sectionIndex].type !== "ai") {
    return NextResponse.json({ error: "Only AI sections can be regenerated" }, { status: 400 });
  }

  // Fetch all context in parallel
  const [analysisResult, assessmentResult, matchResult, teamConsultants] = await Promise.all([
    supabase.from("analyses").select("analysis").eq("id", bid.analysis_id).single(),
    bid.assessment_id
      ? supabase.from("go_no_go_assessments").select("result").eq("id", bid.assessment_id).single()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("matches")
      .select("team_proposal")
      .eq("analysis_id", bid.analysis_id)
      .order("created_at", { ascending: false })
      .limit(1),
    fetchConsultantsByIds(supabase, bid.team_consultant_ids),
  ]);

  if (!analysisResult.data) {
    return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
  }

  const ctx: BidContext = {
    analysis: analysisResult.data.analysis as RfpAnalysis,
    teamConsultants,
    scoredConsultants: (matchResult.data?.[0]?.team_proposal as ScoredConsultant[]) ?? [],
    goNoGoResult: (assessmentResult.data?.result as GoNoGoResult) ?? EMPTY_GO_NO_GO,
  };

  const plannedFromDefault = DEFAULT_BID_PLAN.sections.find((s) => s.semanticKey === sectionKey);
  const planned: PlannedSection = plannedFromDefault ?? {
    kind: "prose",
    title: sections[sectionIndex].title,
    promptHint: `Regenerate the section titled "${sections[sectionIndex].title}"`,
    semanticKey: sectionKey,
  };

  const newSection = await buildSection(planned, ctx);
  sections[sectionIndex] = newSection;

  await supabase.from("bids").update({ sections }).eq("id", id);

  return NextResponse.json({ section: newSection });
}
