import { NextRequest, NextResponse } from "next/server";
import { fetchConsultantsByIds, EMPTY_GO_NO_GO } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import type { BidContext } from "@/lib/bid-generator";
import { buildUnderstandingBundle } from "@/lib/bid-generator/bundles/understanding";
import { buildPhasesBundle } from "@/lib/bid-generator/bundles/phases";
import { buildQualityBundle } from "@/lib/bid-generator/bundles/quality";
import { buildRequirementMatrixBundle } from "@/lib/bid-generator/bundles/requirement-matrix";
import { buildTeamBundle } from "@/lib/bid-generator/bundles/team";
import { buildReferenceBundle } from "@/lib/bid-generator/bundles/reference";
import { buildCoverSection } from "@/lib/bid-generator/deterministic/cover";
import { buildCertificationsSection } from "@/lib/bid-generator/deterministic/certifications";
import { buildConfidentialitySection } from "@/lib/bid-generator/deterministic/confidentiality";
import type {
  RfpAnalysis, ScoredConsultant, GoNoGoResult, BidSection,
} from "@/lib/types";

interface RouteContext {
  params: Promise<{ id: string; sectionKey: string }>;
}

type BundleRunner = (ctx: BidContext) => Promise<BidSection[]>;

// Maps a section key to the bundle (or deterministic builder) that owns it.
// A single bundle can own multiple section keys — re-running it replaces all of them.
const KEY_TO_BUNDLE: Record<string, BundleRunner> = {
  "understanding-current": buildUnderstandingBundle,
  "understanding-assignment": buildUnderstandingBundle,
  "understanding-vision": buildUnderstandingBundle,
  "phases": buildPhasesBundle,
  "quality-assurance": buildQualityBundle,
  "requirement-matrix-v2": buildRequirementMatrixBundle,
  "team-pricing": buildTeamBundle,
  "reference-v2": buildReferenceBundle,
  "cover": async (ctx) => [buildCoverSection(ctx.analysis)],
  "certifications": async () => [buildCertificationsSection()],
  "confidentiality": async (ctx) => [buildConfidentialitySection(ctx.analysis)],
};

export async function POST(_request: NextRequest, { params }: RouteContext) {
  const { id, sectionKey } = await params;
  const supabase = await createClient();

  const { data: bid, error: bidError } = await supabase
    .from("bids")
    .select("id, sections, analysis_id, assessment_id, team_consultant_ids")
    .eq("id", id)
    .single();

  if (bidError || !bid) {
    return NextResponse.json({ error: "Bid not found" }, { status: 404 });
  }

  const runner = KEY_TO_BUNDLE[sectionKey];
  if (!runner) {
    return NextResponse.json({ error: `Unknown section key '${sectionKey}'` }, { status: 400 });
  }

  const [analysisResult, assessmentResult, matchResult, teamConsultants] = await Promise.all([
    supabase.from("analyses").select("analysis").eq("id", bid.analysis_id).single(),
    bid.assessment_id
      ? supabase.from("go_no_go_assessments").select("result").eq("id", bid.assessment_id).single()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("matches")
      .select("team_proposal")
      .eq("analysis_id", bid.analysis_id)
      .order("created_at", { ascending: false })
      .limit(1),
    fetchConsultantsByIds(supabase, bid.team_consultant_ids),
  ]);

  if (!analysisResult.data) {
    return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
  }

  const ctx: BidContext = {
    analysis: analysisResult.data.analysis as RfpAnalysis,
    teamConsultants,
    scoredConsultants: (matchResult.data?.[0]?.team_proposal as ScoredConsultant[]) ?? [],
    goNoGoResult: (assessmentResult.data?.result as GoNoGoResult) ?? EMPTY_GO_NO_GO,
  };

  const newSections = await runner(ctx);
  const newKeys = new Set(newSections.map((s) => s.key));

  const existing = bid.sections as BidSection[];
  const sections = existing.filter((s) => !newKeys.has(s.key)).concat(newSections);

  await supabase.from("bids").update({ sections }).eq("id", id);

  return NextResponse.json({ sections: newSections });
}
