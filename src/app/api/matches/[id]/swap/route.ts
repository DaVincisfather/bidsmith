import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { reEvaluateTeam } from "@/lib/consultant-matcher";
import { RfpAnalysis, Consultant, TeamProposal, CompetencyCategory, Sector } from "@/lib/types";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const supabase = createServiceClient();
  const body = await request.json();

  // body.teamProposal = the new team after swap
  const newTeamProposal = body.teamProposal as TeamProposal;

  // Fetch original match to get analysis_id and previous proposal
  const { data: matchRow, error: matchError } = await supabase
    .from("matches")
    .select("analysis_id, team_proposal")
    .eq("id", id)
    .single();

  if (matchError || !matchRow) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  const previousProposal = matchRow.team_proposal as TeamProposal;

  // Fetch analysis
  const { data: analysisRow } = await supabase
    .from("analyses")
    .select("analysis")
    .eq("id", matchRow.analysis_id)
    .single();

  if (!analysisRow) {
    return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
  }

  const rfpAnalysis = analysisRow.analysis as RfpAnalysis;

  // Fetch all consultants in the new team for full context
  const allIds = [
    ...newTeamProposal.senior,
    ...newTeamProposal.intermediate,
    ...newTeamProposal.junior,
  ].map((c) => c.consultantId);

  const { data: consultantRows } = await supabase
    .from("consultants")
    .select(`
      *,
      consultant_competencies (id, competency, category),
      consultant_references (id, title, description, year, sector)
    `)
    .in("id", allIds);

  const consultants: Consultant[] = (consultantRows || []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    organizationId: row.organization_id as string,
    name: row.name as string,
    level: row.level as Consultant["level"],
    yearsExperience: row.years_experience as number | null,
    summary: row.summary as string | null,
    rawCvText: null,
    competencies: (row.consultant_competencies as Array<{ competency: string; category: CompetencyCategory }>) || [],
    references: (row.consultant_references as Array<{ title: string; description: string; year: number; sector: Sector }>) || [],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }));

  // Re-evaluate
  const result = await reEvaluateTeam(rfpAnalysis, consultants, previousProposal);

  // Save as NEW match row (preserves history)
  const { data: newMatch, error: saveError } = await supabase
    .from("matches")
    .insert({
      analysis_id: matchRow.analysis_id,
      organization_id: DEFAULT_ORG_ID,
      team_proposal: result.teamProposal,
      team_evaluation: result.teamEvaluation,
    })
    .select()
    .single();

  if (saveError) {
    return NextResponse.json({ error: saveError.message }, { status: 500 });
  }

  return NextResponse.json({
    id: newMatch.id,
    previousMatchId: id,
    ...result,
  });
}
