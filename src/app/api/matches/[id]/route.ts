import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { matchConsultants } from "@/lib/consultant-matcher";
import { RfpAnalysis, Consultant, CompetencyCategory, Sector } from "@/lib/types";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteContext) {
  const { id: analysisId } = await params;
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

  // Fetch all consultants for the org
  const { data: consultantRows, error: consultantError } = await supabase
    .from("consultants")
    .select(`
      *,
      consultant_competencies (id, competency, category),
      consultant_references (id, title, description, year, sector)
    `)
    .eq("organization_id", DEFAULT_ORG_ID);

  if (consultantError) {
    return NextResponse.json({ error: consultantError.message }, { status: 500 });
  }

  if (!consultantRows || consultantRows.length === 0) {
    return NextResponse.json(
      { error: "No consultants found. Upload CVs first." },
      { status: 400 }
    );
  }

  // Map DB rows to Consultant type
  const consultants: Consultant[] = consultantRows.map((row: Record<string, unknown>) => ({
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

  // Score all consultants
  const result = await matchConsultants(rfpAnalysis, consultants);

  // Save match — store scored list in team_proposal jsonb
  const { data: matchRecord, error: matchError } = await supabase
    .from("matches")
    .insert({
      analysis_id: analysisId,
      organization_id: DEFAULT_ORG_ID,
      team_proposal: result.scoredConsultants,
      team_evaluation: null,
    })
    .select()
    .single();

  if (matchError) {
    return NextResponse.json({ error: matchError.message }, { status: 500 });
  }

  return NextResponse.json({
    id: matchRecord.id,
    scoredConsultants: result.scoredConsultants,
  });
}
