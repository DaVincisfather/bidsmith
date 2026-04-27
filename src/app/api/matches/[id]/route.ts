import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, mapConsultantRow } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { getOrgId } from "@/lib/org";
import { CONSULTANT_SELECT } from "@/lib/constants";
import { matchConsultants } from "@/lib/consultant-matcher";
import { RfpAnalysis } from "@/lib/types";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteContext) {
  const { id: analysisId } = await params;
  const authed = await createClient();
  const orgId = await getOrgId(authed);
  const supabase = createServiceClient();

  // Fetch analysis + consultants in parallel
  const [analysisResult, consultantResult] = await Promise.all([
    supabase.from("analyses").select("analysis").eq("id", analysisId).single(),
    supabase.from("consultants").select(CONSULTANT_SELECT).eq("organization_id", orgId),
  ]);

  if (analysisResult.error || !analysisResult.data) {
    return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
  }

  if (consultantResult.error || !consultantResult.data?.length) {
    return NextResponse.json({ error: "No consultants found. Upload CVs first." }, { status: 400 });
  }

  const rfpAnalysis = analysisResult.data.analysis as RfpAnalysis;
  const consultants = consultantResult.data.map((row: Record<string, unknown>) => mapConsultantRow(row));

  const result = await matchConsultants(rfpAnalysis, consultants, orgId);

  const { data: matchRecord, error: matchError } = await supabase
    .from("matches")
    .insert({
      analysis_id: analysisId,
      organization_id: orgId,
      team_proposal: result.scoredConsultants,
      team_evaluation: null,
    })
    .select()
    .single();

  if (matchError) {
    return NextResponse.json({ error: matchError.message }, { status: 500 });
  }

  return NextResponse.json({ id: matchRecord.id, scoredConsultants: result.scoredConsultants });
}
