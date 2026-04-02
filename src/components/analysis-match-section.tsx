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
  const [editedProposal, setEditedProposal] = useState<TeamProposalData | null>(null);
  const [loading, setLoading] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [comparison, setComparison] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentProposal = editedProposal ?? match?.team_proposal ?? null;
  const dirty = editedProposal !== null;

  async function triggerMatching() {
    setLoading(true);
    setError(null);
    setComparison(null);
    setEditedProposal(null);

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

  function handleLocalSwap(newProposal: TeamProposalData) {
    setEditedProposal(newProposal);
  }

  async function evaluateTeam() {
    if (!match || !editedProposal) return;

    setEvaluating(true);
    setError(null);

    try {
      const response = await fetch(`/api/matches/${match.id}/swap`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamProposal: editedProposal }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Evaluation failed");
      }

      const data = await response.json();
      setMatch({
        id: data.id,
        team_proposal: data.teamProposal,
        team_evaluation: data.teamEvaluation,
      });
      setComparison(data.comparison);
      setEditedProposal(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setEvaluating(false);
    }
  }

  return (
    <div className="border-t border-gray-200 pt-8 mt-8 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Teammatchning</h2>
        <div className="flex gap-2">
          {dirty && (
            <button
              onClick={evaluateTeam}
              disabled={evaluating}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium
                         hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors"
            >
              {evaluating ? "Utvärderar..." : "Utvärdera team"}
            </button>
          )}
          <button
            onClick={triggerMatching}
            disabled={loading || evaluating}
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
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
          {error}
        </div>
      )}

      {currentProposal && (
        <TeamProposal
          proposal={currentProposal}
          allConsultants={allConsultants}
          onLocalSwap={handleLocalSwap}
          dirty={dirty}
        />
      )}

      {match && !dirty && (
        <TeamEvaluation
          evaluation={match.team_evaluation}
          comparison={comparison || undefined}
        />
      )}

      {!match && !loading && (
        <p className="text-gray-400 text-sm text-center py-8">
          Klicka &quot;Matcha konsulter&quot; för att generera ett teamförslag.
        </p>
      )}
    </div>
  );
}
