import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, fetchConsultantsByIds } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { evaluateGoNoGo } from "@/lib/go-no-go-evaluator";
import { RfpAnalysis, ScoredConsultant } from "@/lib/types";
import { parseBody, internalError, requireUser } from "@/lib/api-helpers";
import { GoNoGoCreateSchema } from "@/lib/api-schemas";
import { defaultTeamSize } from "@/lib/default-team-size";

export async function POST(request: NextRequest) {
  try {
  const parsed = await parseBody(request, GoNoGoCreateSchema);
  if (!parsed.ok) return parsed.response;
  const { analysisId, teamConsultantIds } = parsed.data;

  // Mutating route + service client: route-level auth, never middleware alone
  // (#103 rule). requireUser also supplies the userId for attribution.
  const authed = await createClient();
  const auth = await requireUser(authed);
  if (!auth.ok) return auth.response;
  const userId = auth.data;
  const supabase = createServiceClient();

  // Fetch analysis + match in parallel
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
  const allScoredConsultants = matchResult.data[0].team_proposal as ScoredConsultant[];

  // Determine team IDs — use provided, or pick the top N by score where N
  // follows the RFP's explicit team size hint (defaultTeamSize), 3 otherwise
  const resolvedTeamIds = teamConsultantIds?.length
    ? teamConsultantIds
    : [...allScoredConsultants]
        .sort((a, b) => b.score - a.score)
        .slice(0, defaultTeamSize(rfpAnalysis))
        .map((c) => c.consultantId);

  const teamConsultants = await fetchConsultantsByIds(supabase, resolvedTeamIds);

  const result = await evaluateGoNoGo(rfpAnalysis, teamConsultants, allScoredConsultants, userId);

  const { data: assessment, error: saveError } = await supabase
    .from("go_no_go_assessments")
    .insert({
      analysis_id: analysisId,
      team_consultant_ids: resolvedTeamIds,
      result,
    })
    .select()
    .single();

  if (saveError) {
    return NextResponse.json({ error: saveError.message }, { status: 500 });
  }

  return NextResponse.json({ id: assessment.id, result });
  } catch (err) {
    return internalError(err);
  }
}
