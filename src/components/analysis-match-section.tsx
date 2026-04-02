"use client";

import { useState } from "react";
import { TeamProposal } from "./team-proposal";
import { TeamEvaluation } from "./team-evaluation";

interface ConsultantMatch {
  consultantId: string;
  consultantName: string;
  level: string;
  score: number;
  reasoning: string;
}

interface TeamProposalData {
  senior: ConsultantMatch[];
  intermediate: ConsultantMatch[];
  junior: ConsultantMatch[];
}

interface RequirementCoverage {
  met: number;
  total: number;
  details: string[];
}

interface TeamEvaluationData {
  overallFit: string;
  gaps: string[];
  requirementCoverage: {
    must: RequirementCoverage;
    should: RequirementCoverage;
    niceToHave: RequirementCoverage;
  };
}

interface MatchData {
  id: string;
  team_proposal: TeamProposalData;
  team_evaluation: TeamEvaluationData;
}

interface AllConsultant {
  id: string;
  name: string;
  level: string;
}

interface AnalysisMatchSectionProps {
  analysisId: string;
  latestMatch: MatchData | null;
  allConsultants: AllConsultant[];
}

export function AnalysisMatchSection({
  analysisId,
  latestMatch,
  allConsultants,
}: AnalysisMatchSectionProps) {
  const [match, setMatch] = useState<MatchData | null>(latestMatch);
  const [loading, setLoading] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [comparison, setComparison] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function triggerMatching() {
    setLoading(true);
    setError(null);
    setComparison(null);

    try {
      const response = await fetch(`/api/matches/${analysisId}`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Matching failed");
      }

      const data = await response.json();
      setMatch({
        id: data.id,
        team_proposal: data.teamProposal,
        team_evaluation: data.teamEvaluation,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleSwap(matchId: string, newProposal: TeamProposalData) {
    setSwapping(true);
    setError(null);

    try {
      const response = await fetch(`/api/matches/${matchId}/swap`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamProposal: newProposal }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Swap failed");
      }

      const data = await response.json();
      setMatch({
        id: data.id,
        team_proposal: data.teamProposal,
        team_evaluation: data.teamEvaluation,
      });
      setComparison(data.comparison);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSwapping(false);
    }
  }

  return (
    <div className="border-t border-gray-200 pt-8 mt-8 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Teammatchning</h2>
        <button
          onClick={triggerMatching}
          disabled={loading}
          className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium
                     hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {loading
            ? "Matchar..."
            : match
              ? "Kör om matchning"
              : "Matcha konsulter"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
          {error}
        </div>
      )}

      {match && (
        <>
          <TeamProposal
            matchId={match.id}
            proposal={match.team_proposal}
            allConsultants={allConsultants}
            onSwap={handleSwap}
            swapping={swapping}
          />
          <TeamEvaluation
            evaluation={match.team_evaluation}
            comparison={comparison || undefined}
          />
        </>
      )}

      {!match && !loading && (
        <p className="text-gray-400 text-sm text-center py-8">
          Klicka &quot;Matcha konsulter&quot; för att generera ett teamförslag.
        </p>
      )}
    </div>
  );
}
