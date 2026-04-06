"use client";

import { useState } from "react";
import { TeamProposal } from "./team-proposal";
import { GoNoGoResultView } from "./go-no-go-result";
import { GoNoGoResult } from "@/lib/types";

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

function getTeamIds(team: SelectedTeam): string[] {
  return [team.senior, team.intermediate, team.junior]
    .filter((c): c is ScoredConsultant => c !== null)
    .map((c) => c.consultantId);
}

export function AnalysisMatchSection({
  analysisId,
  latestMatch,
}: AnalysisMatchSectionProps) {
  const [match, setMatch] = useState<MatchData | null>(latestMatch);
  const [selectedTeam, setSelectedTeam] = useState<SelectedTeam>(
    latestMatch
      ? buildDefaultTeam(latestMatch.scoredConsultants)
      : { senior: null, intermediate: null, junior: null }
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Go/No-Go state
  const [teamLocked, setTeamLocked] = useState(false);
  const [goNoGoLoading, setGoNoGoLoading] = useState(false);
  const [goNoGoResult, setGoNoGoResult] = useState<GoNoGoResult | null>(null);
  const [goNoGoId, setGoNoGoId] = useState<string | null>(null);

  async function triggerMatching() {
    setLoading(true);
    setError(null);
    // Reset Go/No-Go when re-matching
    setTeamLocked(false);
    setGoNoGoResult(null);
    setGoNoGoId(null);

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

  async function lockTeamAndEvaluate() {
    setTeamLocked(true);
    setGoNoGoLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/go-no-go", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId,
          teamConsultantIds: getTeamIds(selectedTeam),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Go/No-Go evaluation failed");
      }

      const data = await response.json();
      setGoNoGoResult(data.result);
      setGoNoGoId(data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setTeamLocked(false);
    } finally {
      setGoNoGoLoading(false);
    }
  }

  function unlockTeam() {
    setTeamLocked(false);
    setGoNoGoResult(null);
    setGoNoGoId(null);
  }

  async function proceedToBid() {
    // Record "go" decision
    if (goNoGoId) {
      await fetch(`/api/go-no-go/${goNoGoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "go" }),
      });
    }
    // TODO: Navigate to bid flow (M2)
    alert("Anbudsflödet byggs i M2. Beslutet (Go) har sparats.");
  }

  return (
    <div className="border-t border-gray-200 pt-8 mt-8 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Teammatchning</h2>
        {!teamLocked && (
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
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
          {error}
        </div>
      )}

      {match && (
        <>
          <TeamProposal
            scoredConsultants={match.scoredConsultants}
            selectedTeam={selectedTeam}
            onSwap={handleSwap}
            disabled={teamLocked}
          />

          {/* Lock team / Go/No-Go section */}
          {!teamLocked && !goNoGoLoading && (
            <button
              onClick={lockTeamAndEvaluate}
              className="w-full border-2 border-dashed border-gray-300 text-gray-600 px-4 py-3 rounded-lg text-sm font-medium
                         hover:border-gray-400 hover:text-gray-800 transition-colors"
            >
              Lås team och kör Go/No-Go-analys
            </button>
          )}

          {goNoGoLoading && (
            <div className="text-center py-8 text-gray-400 text-sm">
              Analyserar teamets chanser...
            </div>
          )}

          {goNoGoResult && goNoGoId && (
            <GoNoGoResultView
              result={goNoGoResult}
              assessmentId={goNoGoId}
              onUnlock={unlockTeam}
              onProceedToBid={proceedToBid}
            />
          )}
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
