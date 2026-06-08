import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, fetchConsultantsByIds, EMPTY_GO_NO_GO } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/org";
import { generateAllSections, BID_BUNDLE_COUNT, type FailedBundle } from "@/lib/bid-generator";
import { RfpAnalysis, ScoredConsultant, GoNoGoResult, BidSection } from "@/lib/types";
import type { BidContext } from "@/lib/bid-generator";
import { parseBody } from "@/lib/api-helpers";
import { BidCreateSchema } from "@/lib/api-schemas";
import {
  judgeBidStructure,
  buildStructureEvalSummary,
  RUNTIME_MANDATORY_SECTIONS,
} from "@/lib/eval/bid-structure";

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
  };

  // Generate sections, saving progress to DB after each.
  // templateName is hardcoded for now — picker is a separate PR.
  // Wrap in try/catch so an infra failure (loadBudgets throws, etc) doesn't
  // leave an orphan bid stuck at status='generating' — bids.status CHECK
  // constraint accepts only 'generating'/'draft'/'exported', so we DELETE the
  // orphan rather than mark it failed.
  let sections: BidSection[];
  let overflowFlags: Awaited<ReturnType<typeof generateAllSections>>["overflowFlags"];
  let failedBundles: FailedBundle[];
  try {
    ({ sections, overflowFlags, failedBundles } = await generateAllSections(ctx, "anbudsmall-v2", async (section: BidSection) => {
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
    }));
  } catch (err) {
    console.error("bid generation failed, deleting orphan row:", err);
    await supabase.from("bids").delete().eq("id", bid.id);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Bid generation failed" },
      { status: 500 },
    );
  }

  // Every bundle failed → no AI content was produced (only deterministic
  // cover/confidentiality/certifications), so there's nothing worth keeping.
  // Treat it like an infra failure: delete the orphan and report it.
  if (failedBundles.length >= BID_BUNDLE_COUNT) {
    console.error("all bid bundles failed, deleting orphan row:", failedBundles);
    await supabase.from("bids").delete().eq("id", bid.id);
    return NextResponse.json(
      { error: "Bid generation failed", failedBundles },
      { status: 500 },
    );
  }
  // Some bundles failed but others succeeded: keep the partial draft rather
  // than discarding the (already billed) Opus output. The response flags it so
  // the UI can tell the user which sections to regenerate.
  if (failedBundles.length > 0) {
    console.warn("bid generation partial — some bundles failed:", failedBundles);
  }

  // Eval failure must never block the bid save — sections took 2-5 min to
  // generate and we'd rather show "ej utvärderad" than lose them.
  let structureEval: ReturnType<typeof buildStructureEvalSummary> | null = null;
  try {
    structureEval = buildStructureEvalSummary(
      judgeBidStructure(sections, RUNTIME_MANDATORY_SECTIONS),
    );
  } catch (err) {
    console.error("structure-judge failed (sections still saved):", err);
  }

  await supabase
    .from("bids")
    .update({ sections, status: "draft", structure_eval: structureEval, overflow_flags: overflowFlags })
    .eq("id", bid.id);

  return NextResponse.json({
    id: bid.id,
    status: "draft",
    sections,
    structureEval,
    overflowFlags,
    failedBundles,
  });
}
