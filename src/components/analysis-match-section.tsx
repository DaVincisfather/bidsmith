"use client";

import { useState } from "react";
import { TeamProposal } from "./team-proposal";

interface ScoredConsultant {
  consultantId: string;
  consultantName: string;
  level: string;
  score: number;
  reasoning: string;
}

interface SelectedTeam {
  senior: ScoredConsultant | null;
  intermediate: ScoredConsultant | null;
  junior: ScoredConsultant | null;
}

interface MatchData {
  id: string;
  scoredConsultants: ScoredConsultant[];
}

interface AnalysisMatchSectionProps {
  analysisId: string;
  latestMatch: MatchData | null;
}

function buildDefaultTeam(scored: ScoredConsultant[]): SelectedTeam {
  const byLevel: Record<string, ScoredConsultant[]> = {};
  for (const c of scored) {
    if (!byLevel[c.level]) byLevel[c.level] = [];
    byLevel[c.level].push(c);
  }

  // Sort each level by score desc, pick top 1
  const pick = (level: string): ScoredConsultant | null => {
    const list = byLevel[level];
    if (!list || list.length === 0) return null;
    return [...list].sort((a, b) => b.score - a.score)[0];
  };

  return {
    senior: pick("senior"),
    intermediate: pick("intermediate"),
    junior: pick("junior"),
  };
}

export function AnalysisMatchSection({
  analysisId,
  latestMatch,
}: AnalysisMatchSectionProps) {
  const [match, setMatch] = useState<MatchData | null>(latestMatch);
  const [selectedTeam, setSelectedTeam] = useState<SelectedTeam>(
    latestMatch ? buildDefaultTeam(latestMatch.scoredConsultants) : { senior: null, intermediate: null, junior: null }
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function triggerMatching() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/matches/${analysisId}`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Matching failed");
      }

      const data = await response.json();
      const newMatch: MatchData = {
        id: data.id,
        scoredConsultants: data.scoredConsultants,
      };
      setMatch(newMatch);
      setSelectedTeam(buildDefaultTeam(data.scoredConsultants));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function handleSwap(level: string, consultant: ScoredConsultant) {
    setSelectedTeam((prev) => ({
      ...prev,
      [level]: consultant,
    }));
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
        <TeamProposal
          scoredConsultants={match.scoredConsultants}
          selectedTeam={selectedTeam}
          onSwap={handleSwap}
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
