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
    supabase
      .from("matches")
      .select("id, team_proposal")
      .eq("analysis_id", analysisId)
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("go_no_go_assessments")
      .select("id, team_consultant_ids, result, decision")
      .eq("analysis_id", analysisId)
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("bids")
      .select("id, status, exported_at, failed_bundles")
      .eq("analysis_id", analysisId)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const m = matchRes.data?.[0];
  const a = assessmentRes.data?.[0];
  const b = bidRes.data?.[0];

  return {
    match: m
      ? { id: m.id as string, scoredConsultants: (m.team_proposal as ScoredConsultant[]) ?? [] }
      : null,
    assessment: a
      ? {
          id: a.id as string,
          teamConsultantIds: (a.team_consultant_ids as string[]) ?? [],
          result: a.result as GoNoGoResult,
          decision: (a.decision as "go" | "no-go" | null) ?? null,
        }
      : null,
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
