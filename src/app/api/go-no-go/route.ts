import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, fetchConsultantsByIds } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { getOrgId } from "@/lib/org";
import { evaluateGoNoGo } from "@/lib/go-no-go-evaluator";
import { RfpAnalysis, ScoredConsultant } from "@/lib/types";
import { parseBody } from "@/lib/api-helpers";
import { GoNoGoCreateSchema } from "@/lib/api-schemas";

export async function POST(request: NextRequest) {
  const parsed = await parseBody(request, GoNoGoCreateSchema);
  if (!parsed.ok) return parsed.response;
  const { analysisId, teamConsultantIds } = parsed.data;

  const authed = await createClient();
  const orgId = await getOrgId(authed);
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

  // Determine team IDs — use provided or pick top 3 by score
  const resolvedTeamIds = teamConsultantIds?.length
    ? teamConsultantIds
    : [...allScoredConsultants].sort((a, b) => b.score - a.score).slice(0, 3).map((c) => c.consultantId);

  const teamConsultants = await fetchConsultantsByIds(supabase, resolvedTeamIds);

  const result = await evaluateGoNoGo(rfpAnalysis, teamConsultants, allScoredConsultants, orgId);

  const { data: assessment, error: saveError } = await supabase
    .from("go_no_go_assessments")
    .insert({
      analysis_id: analysisId,
      organization_id: orgId,
      team_consultant_ids: resolvedTeamIds,
      result,
    })
    .select()
    .single();

  if (saveError) {
    return NextResponse.json({ error: saveError.message }, { status: 500 });
  }

  return NextResponse.json({ id: assessment.id, result });
}
