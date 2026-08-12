import { createClient } from "@/lib/supabase/server";
import type { GoNoGoResult, ScoredConsultant } from "@/lib/types";

export interface FlowMatch {
  id: string;
  scoredConsultants: ScoredConsultant[];
}

export interface FlowAssessment {
  id: string;
  teamConsultantIds: string[];
  result: GoNoGoResult;
  decision: "go" | "no-go" | null;
}

export interface FlowBid {
  id: string;
  status: string;
  exportedAt: string | null;
  hasFailures: boolean;
}

export interface FlowState {
  match: FlowMatch | null;
  assessment: FlowAssessment | null;
  previousAssessment: FlowAssessment | null;
  bid: FlowBid | null;
}

/**
 * Single source of truth for the analysis → go/no-go → bid step chain.
 * "Latest row wins" also absorbs legacy data where an analysis accumulated
 * several assessments/bids before the one-bid-per-analysis rule (spec 2026-08-04).
 */
export async function loadFlowState(analysisId: string): Promise<FlowState> {
  const supabase = await createClient();

  const [matchRes, assessmentRes, bidRes] = await Promise.all([
    // Deliberately inline rather than fetchLatestTeamProposal (lib/supabase):
    // the flow needs the match id, which the helper's ScoredConsultant[]
    // contract omits. Keep ordering semantics identical to the helper.
    supabase
      .from("matches")
      .select("id, team_proposal")
      .eq("analysis_id", analysisId)
      .order("created_at", { ascending: false })
      .limit(1),
    // limit(2): [0] is the active assessment, [1] (if any) is the assessment it
    // replaced via apply-swap — surfaced as previousAssessment for the
    // before/after comparison on the go/no-go page.
    supabase
      .from("go_no_go_assessments")
      .select("id, team_consultant_ids, result, decision")
      .eq("analysis_id", analysisId)
      .order("created_at", { ascending: false })
      .limit(2),
    supabase
      .from("bids")
      .select("id, status, exported_at, failed_bundles")
      .eq("analysis_id", analysisId)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  for (const [label, res] of [
    ["matches", matchRes],
    ["go_no_go_assessments", assessmentRes],
    ["bids", bidRes],
  ] as const) {
    if (res.error) {
      throw new Error(`loadFlowState(${analysisId}): ${label} query failed: ${res.error.message}`);
    }
  }

  const m = matchRes.data?.[0];
  const a = assessmentRes.data?.[0];
  const b = bidRes.data?.[0];

  const toAssessment = (row: NonNullable<typeof a>): FlowAssessment => ({
    id: row.id as string,
    teamConsultantIds: (row.team_consultant_ids as string[]) ?? [],
    result: row.result as GoNoGoResult,
    decision: (row.decision as "go" | "no-go" | null) ?? null,
  });

  return {
    match: m
      ? { id: m.id as string, scoredConsultants: (m.team_proposal as ScoredConsultant[]) ?? [] }
      : null,
    assessment: a ? toAssessment(a) : null,
    previousAssessment: assessmentRes.data?.[1] ? toAssessment(assessmentRes.data[1]) : null,
    bid: b
      ? {
          id: b.id as string,
          status: b.status as string,
          exportedAt: (b.exported_at as string | null) ?? null,
          hasFailures: ((b.failed_bundles as unknown[]) ?? []).length > 0,
        }
      : null,
  };
}
