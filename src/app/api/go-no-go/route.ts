import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { evaluateGoNoGo } from "@/lib/go-no-go-evaluator";
import {
  RfpAnalysis,
  Consultant,
  ScoredConsultant,
  CompetencyCategory,
  Sector,
} from "@/lib/types";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { analysisId, teamConsultantIds } = body as {
    analysisId: string;
    teamConsultantIds?: string[];
  };

  if (!analysisId) {
    return NextResponse.json({ error: "analysisId is required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Fetch analysis
  const { data: analysisRow, error: analysisError } = await supabase
    .from("analyses")
    .select("analysis")
    .eq("id", analysisId)
    .single();

  if (analysisError || !analysisRow) {
    return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
  }

  const rfpAnalysis = analysisRow.analysis as RfpAnalysis;

  // Fetch latest match (scored consultants)
  const { data: matchRows, error: matchError } = await supabase
    .from("matches")
    .select("team_proposal")
    .eq("analysis_id", analysisId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (matchError || !matchRows || matchRows.length === 0) {
    return NextResponse.json(
      { error: "No match found. Run matching first." },
      { status: 400 }
    );
  }

  const allScoredConsultants = matchRows[0].team_proposal as ScoredConsultant[];

  // Determine team IDs — use provided or pick top 3 by score
  let resolvedTeamIds: string[];
  if (teamConsultantIds && teamConsultantIds.length > 0) {
    resolvedTeamIds = teamConsultantIds;
  } else {
    // Auto-select top 3 (M3 compatibility)
    resolvedTeamIds = [...allScoredConsultants]
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((c) => c.consultantId);
  }

  // Fetch full consultant data for the team
  const { data: consultantRows, error: consultantError } = await supabase
    .from("consultants")
    .select(`
      *,
      consultant_competencies (id, competency, category),
      consultant_references (id, title, description, year, sector)
    `)
    .in("id", resolvedTeamIds);

  if (consultantError || !consultantRows || consultantRows.length === 0) {
    return NextResponse.json(
      { error: "Could not fetch team consultants" },
      { status: 500 }
    );
  }

  const teamConsultants: Consultant[] = consultantRows.map(
    (row: Record<string, unknown>) => ({
      id: row.id as string,
      organizationId: row.organization_id as string,
      name: row.name as string,
      level: row.level as Consultant["level"],
      yearsExperience: row.years_experience as number | null,
      summary: row.summary as string | null,
      rawCvText: null,
      competencies:
        (row.consultant_competencies as Array<{
          competency: string;
          category: CompetencyCategory;
        }>) || [],
      references:
        (row.consultant_references as Array<{
          title: string;
          description: string;
          year: number;
          sector: Sector;
        }>) || [],
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    })
  );

  // Run Go/No-Go evaluation
  const result = await evaluateGoNoGo(
    rfpAnalysis,
    teamConsultants,
    allScoredConsultants
  );

  // Save to DB
  const { data: assessment, error: saveError } = await supabase
    .from("go_no_go_assessments")
    .insert({
      analysis_id: analysisId,
      organization_id: DEFAULT_ORG_ID,
      team_consultant_ids: resolvedTeamIds,
      result,
    })
    .select()
    .single();

  if (saveError) {
    return NextResponse.json({ error: saveError.message }, { status: 500 });
  }

  return NextResponse.json({
    id: assessment.id,
    result,
  });
}
