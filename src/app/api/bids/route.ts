import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createServiceClient, fetchConsultantsByIds, EMPTY_GO_NO_GO } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/org";
import { runBidGeneration } from "@/lib/bid-generator/run-bid-generation";
import { loadActiveTemplate } from "@/lib/pptx-template/active-template";
import { loadActiveProfile } from "@/lib/org-profile";
import { RfpAnalysis, ScoredConsultant, GoNoGoResult } from "@/lib/types";
import type { BidContext } from "@/lib/bid-generator";
import { parseBody, internalError } from "@/lib/api-helpers";
import { BidCreateSchema } from "@/lib/api-schemas";
import { isActivelyGenerating } from "@/lib/bid-status";

// 6 parallel Opus calls take 2–5 min — far beyond the default serverless
// timeout. The response returns immediately; generation continues via after()
// up to maxDuration. 300 s is the Vercel Hobby ceiling (raise to 800 on Pro)
// (if you raise this, raise STALE_GENERATING_MS in lib/bid-status.ts
// accordingly — see its invariant note).
// If the platform still kills the function, the stale-generating watchdog in
// GET /api/bids/[id] marks the bid 'failed' instead of leaving it stuck.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
  const parsed = await parseBody(request, BidCreateSchema);
  if (!parsed.ok) return parsed.response;
  const { analysisId, assessmentId, teamConsultantIds } = parsed.data;

  const authed = await createClient();
  const userId = await getUserId(authed);
  const supabase = createServiceClient();

  // Fetch all context in parallel — including the analysis' existing bid:
  // one analysis owns at most one bid (spec 2026-08-04). Drafts are replaced
  // in place, exported bids are frozen.
  const [analysisResult, assessmentResult, matchResult, teamConsultants, existingBidResult] =
    await Promise.all([
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
      supabase
        .from("bids")
        .select("id, status, exported_at, created_at")
        .eq("analysis_id", analysisId)
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

  if (analysisResult.error || !analysisResult.data) {
    return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
  }

  const existing = existingBidResult.data?.[0] as
    | { id: string; status: string; exported_at: string | null; created_at: string | null }
    | undefined;
  if (existing && (existing.exported_at || existing.status === "exported")) {
    return NextResponse.json(
      { error: "Anbudet är inlämnat och fryst — utfallet spårar det." },
      { status: 409 },
    );
  }
  if (existing && isActivelyGenerating(existing)) {
    return NextResponse.json(
      { error: "Generering pågår redan för den här analysen." },
      { status: 409 },
    );
  }

  const rfpAnalysis = analysisResult.data.analysis as RfpAnalysis;
  const goNoGoResult = (assessmentResult.data?.result as GoNoGoResult) ?? null;
  const allScoredConsultants = (matchResult.data?.[0]?.team_proposal as ScoredConsultant[]) ?? [];

  // Resolve the active template up front so the bid records which template it
  // was generated against (export/editor must reuse the same — budgets were
  // computed for it). Falls back to the bundled anbudsmall-v2 v1 if unseeded.
  // The active org profile gives every bundle the org's voice (injected first
  // in the cached system block); null when no profile exists → today's behavior.
  const [template, profile] = await Promise.all([
    loadActiveTemplate(),
    loadActiveProfile(),
  ]);

  let bidId: string;
  if (existing) {
    // Replace the draft in place: the id survives so existing links stay valid.
    const newCreatedAt = new Date().toISOString();
    let replaceQuery = supabase
      .from("bids")
      .update({
        assessment_id: assessmentId || null,
        team_consultant_ids: teamConsultantIds,
        template_id: template.id,
        profile_id: profile?.id ?? null,
        status: "generating",
        sections: [],
        failed_bundles: [],
        generation_error: null,
        // created_at doubles as the generation-start timestamp for the
        // stale-generating watchdog in GET /api/bids/[id] — reset it so a
        // replaced bid isn't instantly flagged as timed out.
        created_at: newCreatedAt,
      })
      .eq("id", existing.id)
      // CAS: only replace the exact state we read. status alone is not
      // enough — a stale-generating replace sets status to the same value
      // it read — so created_at (re-stamped by every replace) is included
      // as the invariant that always changes across a legitimate replace.
      .eq("status", existing.status);
    if (existing.created_at) {
      replaceQuery = replaceQuery.eq("created_at", existing.created_at);
    }
    const { data: replaced, error: replaceError } = await replaceQuery.select("id");
    if (replaceError) {
      return NextResponse.json({ error: replaceError.message }, { status: 500 });
    }
    if (!replaced || replaced.length === 0) {
      return NextResponse.json(
        { error: "Generering pågår redan för den här analysen." },
        { status: 409 },
      );
    }
    bidId = existing.id;
  } else {
    const { data: bid, error: bidError } = await supabase
      .from("bids")
      .insert({
        analysis_id: analysisId,
        assessment_id: assessmentId || null,
        created_by: userId,
        team_consultant_ids: teamConsultantIds,
        template_id: template.id,
        // Pinna profilen anbudet skrivs med (som template_id) — export måste
        // återanvända samma, annars kan bolagsnamn/röst divergera om profilen ändras.
        profile_id: profile?.id ?? null,
        status: "generating",
      })
      .select()
      .single();
    if (bidError || !bid) {
      return NextResponse.json(
        { error: bidError?.message ?? "Failed to create bid" },
        { status: 500 },
      );
    }
    bidId = bid.id;
  }

  const ctx: BidContext = {
    analysis: rfpAnalysis,
    teamConsultants,
    scoredConsultants: allScoredConsultants,
    goNoGoResult: goNoGoResult ?? EMPTY_GO_NO_GO,
    userId,
    bidId,
    profile,
  };

  // Generation runs after the response is sent (Vercel: waitUntil). The
  // client polls GET /api/bids/[id] until status leaves 'generating'.
  after(() => runBidGeneration(supabase, bidId, ctx, template));

  return NextResponse.json({ id: bidId, status: "generating" }, { status: 202 });
  } catch (err) {
    return internalError(err);
  }
}
