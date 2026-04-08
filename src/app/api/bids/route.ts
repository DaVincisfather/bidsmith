import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { generateAllSections } from "@/lib/bid-generator";
import {
  RfpAnalysis,
  Consultant,
  ScoredConsultant,
  GoNoGoResult,
  BidSection,
  CompetencyCategory,
  Sector,
} from "@/lib/types";
import { BidContext } from "@/lib/bid-section-prompts";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { analysisId, assessmentId, teamConsultantIds } = body as {
    analysisId: string;
    assessmentId: string;
    teamConsultantIds: string[];
  };

  if (!analysisId || !teamConsultantIds?.length) {
    return NextResponse.json(
      { error: "analysisId and teamConsultantIds are required" },
      { status: 400 }
    );
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

  // Fetch Go/No-Go assessment
  let goNoGoResult: GoNoGoResult | null = null;
  if (assessmentId) {
    const { data: assessmentRow } = await supabase
      .from("go_no_go_assessments")
      .select("result")
      .eq("id", assessmentId)
      .single();

    if (assessmentRow) {
      goNoGoResult = assessmentRow.result as GoNoGoResult;
    }
  }

  // Fetch latest match (scored consultants)
  const { data: matchRows } = await supabase
    .from("matches")
    .select("team_proposal")
    .eq("analysis_id", analysisId)
    .order("created_at", { ascending: false })
    .limit(1);

  const allScoredConsultants = matchRows?.[0]?.team_proposal as ScoredConsultant[] ?? [];

  // Fetch full consultant data for the team
  const { data: consultantRows, error: consultantError } = await supabase
    .from("consultants")
    .select(`
      *,
      consultant_competencies (id, competency, category),
      consultant_references (id, title, description, year, sector)
    `)
    .in("id", teamConsultantIds);

  if (consultantError || !consultantRows?.length) {
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

  // Create bid record with status 'generating'
  const { data: bid, error: bidError } = await supabase
    .from("bids")
    .insert({
      analysis_id: analysisId,
      assessment_id: assessmentId || null,
      organization_id: DEFAULT_ORG_ID,
      team_consultant_ids: teamConsultantIds,
      status: "generating",
    })
    .select()
    .single();

  if (bidError || !bid) {
    return NextResponse.json({ error: bidError?.message ?? "Failed to create bid" }, { status: 500 });
  }

  // Build context for AI generation
  const ctx: BidContext = {
    analysis: rfpAnalysis,
    teamConsultants,
    scoredConsultants: allScoredConsultants,
    goNoGoResult: goNoGoResult ?? {
      mustRequirements: [],
      winProbability: 0,
      winProbabilityReasoning: "No Go/No-Go assessment available",
      strengths: [],
      gaps: [],
      improvements: [],
      recommendation: "go-with-reservations",
      reasoning: "No assessment performed",
    },
  };

  // Generate sections, saving progress to DB after each
  const { sections } = await generateAllSections(ctx, async (section: BidSection) => {
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

  // Mark as draft
  await supabase
    .from("bids")
    .update({ sections, status: "draft" })
    .eq("id", bid.id);

  return NextResponse.json({
    id: bid.id,
    status: "draft",
    sections,
  });
}
