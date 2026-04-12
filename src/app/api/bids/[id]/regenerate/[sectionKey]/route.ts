import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { buildSection } from "@/lib/bid-generator";
import { DEFAULT_BID_PLAN } from "@/lib/bid-planner";
import type { PlannedSection } from "@/lib/bid-planner";
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

interface RouteContext {
  params: Promise<{ id: string; sectionKey: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteContext) {
  const { id, sectionKey } = await params;
  const supabase = createServiceClient();

  // Fetch bid
  const { data: bid, error: bidError } = await supabase
    .from("bids")
    .select("*")
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
    return NextResponse.json(
      { error: "Only AI sections can be regenerated" },
      { status: 400 }
    );
  }

  // Fetch analysis
  const { data: analysisRow } = await supabase
    .from("analyses")
    .select("analysis")
    .eq("id", bid.analysis_id)
    .single();

  if (!analysisRow) {
    return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
  }

  // Fetch Go/No-Go assessment
  let goNoGoResult: GoNoGoResult | null = null;
  if (bid.assessment_id) {
    const { data: assessmentRow } = await supabase
      .from("go_no_go_assessments")
      .select("result")
      .eq("id", bid.assessment_id)
      .single();
    if (assessmentRow) {
      goNoGoResult = assessmentRow.result as GoNoGoResult;
    }
  }

  // Fetch scored consultants
  const { data: matchRows } = await supabase
    .from("matches")
    .select("team_proposal")
    .eq("analysis_id", bid.analysis_id)
    .order("created_at", { ascending: false })
    .limit(1);

  const allScoredConsultants = matchRows?.[0]?.team_proposal as ScoredConsultant[] ?? [];

  // Fetch team consultants
  const { data: consultantRows } = await supabase
    .from("consultants")
    .select(`
      *,
      consultant_competencies (id, competency, category),
      consultant_references (id, title, description, year, sector)
    `)
    .in("id", bid.team_consultant_ids);

  const teamConsultants: Consultant[] = (consultantRows ?? []).map(
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

  const ctx: BidContext = {
    analysis: analysisRow.analysis as RfpAnalysis,
    teamConsultants,
    scoredConsultants: allScoredConsultants,
    goNoGoResult: goNoGoResult ?? {
      mustRequirements: [],
      winProbability: 0,
      winProbabilityReasoning: "No assessment",
      strengths: [],
      gaps: [],
      improvements: [],
      recommendation: "go-with-reservations",
      reasoning: "No assessment",
    },
  };

  // Resolve the PlannedSection for this key from DEFAULT_BID_PLAN, or build a
  // minimal prose fallback so unknown keys still produce a sensible result.
  const plannedFromDefault = DEFAULT_BID_PLAN.sections.find(
    (s) => s.semanticKey === sectionKey
  );
  const planned: PlannedSection = plannedFromDefault ?? {
    kind: "prose",
    title: sections[sectionIndex].title,
    promptHint: `Regenerate the section titled "${sections[sectionIndex].title}"`,
    semanticKey: sectionKey,
  };

  // Regenerate the section
  const newSection = await buildSection(planned, ctx);

  // Replace in sections array
  sections[sectionIndex] = newSection;

  await supabase
    .from("bids")
    .update({ sections })
    .eq("id", id);

  return NextResponse.json({ section: newSection });
}
