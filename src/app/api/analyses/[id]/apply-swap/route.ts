import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, fetchConsultantsByIds } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { evaluateGoNoGo } from "@/lib/go-no-go-evaluator";
import { RfpAnalysis, ScoredConsultant } from "@/lib/types";
import { parseBody, parseUuidParam, internalError, requireUser } from "@/lib/api-helpers";
import { ApplySwapSchema } from "@/lib/api-schemas";
import { isActivelyGenerating } from "@/lib/bid-status";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Applies a go/no-go improvement suggestion: swaps removeId → addId in the
 * locked team, re-runs the assessment and INSERTS a new assessment row.
 * The previous row is deliberately kept — loadFlowState is latest-row-wins,
 * and the surviving row is what feeds the before/after comparison in the UI.
 * The draft bid is deleted (it was generated for the old team); the client
 * shows a confirm dialog before calling.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { id: rawId } = await params;
    const idResult = parseUuidParam(rawId, "analysis id");
    if (!idResult.ok) return idResult.response;
    const analysisId = idResult.data;

    const parsed = await parseBody(request, ApplySwapSchema);
    if (!parsed.ok) return parsed.response;
    const { assessmentId, removeId, addId } = parsed.data;

    // Destructive route (deletes the draft bid): route-level auth before the
    // service client, never middleware alone (#103 rule).
    const authed = await createClient();
    const auth = await requireUser(authed);
    if (!auth.ok) return auth.response;
    const userId = auth.data;

    const supabase = createServiceClient();

    const { data: assessRows, error: assessError } = await supabase
      .from("go_no_go_assessments")
      .select("id, team_consultant_ids")
      .eq("analysis_id", analysisId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (assessError) {
      return NextResponse.json({ error: assessError.message }, { status: 500 });
    }
    const latest = assessRows?.[0];
    if (!latest) {
      return NextResponse.json({ error: "Ingen bedömning att utgå från." }, { status: 404 });
    }
    if (latest.id !== assessmentId) {
      return NextResponse.json(
        { error: "Bedömningen har ändrats — ladda om sidan." },
        { status: 409 },
      );
    }

    const teamIds = (latest.team_consultant_ids as string[]) ?? [];
    if (!teamIds.includes(removeId) || teamIds.includes(addId)) {
      return NextResponse.json(
        { error: "Förslaget matchar inte det låsta teamet — ladda om sidan." },
        { status: 409 },
      );
    }

    // Same freeze/generation guards as unlock-team: an exported bid is a
    // submitted document and a running generation must not lose its bid row.
    const { data: bids, error: bidsError } = await supabase
      .from("bids")
      .select("id, status, exported_at, created_at")
      .eq("analysis_id", analysisId);
    if (bidsError) {
      return NextResponse.json({ error: bidsError.message }, { status: 500 });
    }
    const bidRows = (bids ?? []) as { id: string; status: string; exported_at: string | null; created_at: string | null }[];
    if (bidRows.some((b) => b.exported_at || b.status === "exported")) {
      return NextResponse.json(
        { error: "Anbudet är inlämnat — teamet kan inte ändras." },
        { status: 409 },
      );
    }
    if (bidRows.some((b) => isActivelyGenerating(b))) {
      return NextResponse.json(
        { error: "Generering pågår — vänta tills den är klar." },
        { status: 409 },
      );
    }

    const [analysisResult, matchResult] = await Promise.all([
      supabase.from("analyses").select("analysis").eq("id", analysisId).single(),
      supabase
        .from("matches")
        .select("team_proposal")
        .eq("analysis_id", analysisId)
        .order("created_at", { ascending: false })
        .limit(1),
    ]);
    if (analysisResult.error || !analysisResult.data) {
      return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
    }
    if (matchResult.error || !matchResult.data?.length) {
      return NextResponse.json({ error: "No match found. Run matching first." }, { status: 400 });
    }

    const rfpAnalysis = analysisResult.data.analysis as RfpAnalysis;
    const pool = (matchResult.data[0].team_proposal as ScoredConsultant[]) ?? [];
    // swapIds come from an AI response and are unvalidated at generation time —
    // the pool membership check is what makes them safe to act on.
    if (!pool.some((c) => c.consultantId === addId)) {
      return NextResponse.json(
        { error: "Konsulten i förslaget finns inte i matchningen längre — kör om matchningen." },
        { status: 422 },
      );
    }

    const newTeamIds = teamIds.map((id) => (id === removeId ? addId : id));
    const teamConsultants = await fetchConsultantsByIds(supabase, newTeamIds);

    // Evaluate BEFORE deleting the draft: an AI failure must not cost the user
    // their bid. The delete below keeps the exported/status filters so an export
    // landing mid-evaluation survives (same accepted race as unlock-team).
    const result = await evaluateGoNoGo(rfpAnalysis, teamConsultants, pool, userId);

    const { error: delBidsError } = await supabase
      .from("bids")
      .delete()
      .eq("analysis_id", analysisId)
      .is("exported_at", null)
      .neq("status", "exported");
    if (delBidsError) {
      return NextResponse.json({ error: delBidsError.message }, { status: 500 });
    }

    const { data: created, error: saveError } = await supabase
      .from("go_no_go_assessments")
      .insert({
        analysis_id: analysisId,
        team_consultant_ids: newTeamIds,
        result,
      })
      .select()
      .single();
    if (saveError) {
      return NextResponse.json({ error: saveError.message }, { status: 500 });
    }

    return NextResponse.json({ id: created.id, result });
  } catch (err) {
    return internalError(err);
  }
}
