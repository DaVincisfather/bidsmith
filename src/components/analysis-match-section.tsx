"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { TeamProposal } from "./team-proposal";
import { MAX_TEAM_SIZE } from "@/lib/constants";
import { ForgeLoader } from "./ForgeLoader";

interface ScoredConsultant {
  consultantId: string;
  consultantName: string;
  level: string;
  score: number;
  reasoning: string;
}

interface MatchData {
  id: string;
  scoredConsultants: ScoredConsultant[];
}

interface AnalysisMatchSectionProps {
  analysisId: string;
  latestMatch: MatchData | null;
  /** true when a go/no-go assessment exists — the team is locked server-side */
  locked: boolean;
  /** the locked team from the latest assessment (null when unlocked) */
  lockedTeamIds: string[] | null;
}

function buildDefaultTeamIds(scored: ScoredConsultant[]): Set<string> {
  // Pick top 3 by score, regardless of level
  const top = [...scored].sort((a, b) => b.score - a.score).slice(0, 3);
  return new Set(top.map((c) => c.consultantId));
}

export function AnalysisMatchSection({
  analysisId,
  latestMatch,
  locked,
  lockedTeamIds,
}: AnalysisMatchSectionProps) {
  const router = useRouter();
  const [match, setMatch] = useState<MatchData | null>(latestMatch);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    lockedTeamIds
      ? new Set(lockedTeamIds)
      : latestMatch
        ? buildDefaultTeamIds(latestMatch.scoredConsultants)
        : new Set(),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [goNoGoRunning, setGoNoGoRunning] = useState(false);

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
      setSelectedIds(buildDefaultTeamIds(data.scoredConsultants));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function handleToggle(consultantId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(consultantId)) {
        next.delete(consultantId);
      } else {
        // Defensive: the UI disables unselected rows at the cap, but never let
        // a toggle push the team past the slot count (silent-drop guard).
        if (next.size >= MAX_TEAM_SIZE) return prev;
        next.add(consultantId);
      }
      return next;
    });
  }

  async function lockTeamAndEvaluate() {
    if (selectedIds.size === 0) {
      setError("Välj minst en konsult för teamet.");
      return;
    }
    setGoNoGoRunning(true);
    setError(null);
    try {
      const response = await fetch("/api/go-no-go", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId,
          teamConsultantIds: Array.from(selectedIds),
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Go/No-Go evaluation failed");
      }
      router.push(`/analysis/${analysisId}/go-no-go`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setGoNoGoRunning(false);
    }
  }

  return (
    <div className="border-t border-rule pt-8 mt-8 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display font-normal">Teammatchning</h2>
        {!locked && (
          <button
            onClick={triggerMatching}
            disabled={loading}
            className="bg-ink text-white px-4 py-2 rounded-lg text-sm font-medium
                       hover:bg-accent-ink disabled:bg-rule disabled:cursor-not-allowed transition-colors"
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
            selectedIds={selectedIds}
            onToggle={handleToggle}
            disabled={locked}
            maxTeamSize={MAX_TEAM_SIZE}
          />

          {!locked && !goNoGoRunning && (
            <button
              onClick={lockTeamAndEvaluate}
              disabled={selectedIds.size === 0}
              className="w-full border-2 border-dashed border-rule text-ink-soft px-4 py-3 rounded-lg text-sm font-medium
                         hover:border-accent hover:text-ink disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Lås team ({selectedIds.size} valda) och kör Go/No-Go-analys
            </button>
          )}

          {goNoGoRunning && (
            <div className="py-8 flex justify-center">
              <ForgeLoader />
            </div>
          )}

          {locked && (
            <Link
              href={`/analysis/${analysisId}/go-no-go`}
              className="block w-full border border-rule text-ink-soft px-4 py-3 rounded-lg text-sm
                         font-medium text-center hover:border-accent hover:text-ink transition-colors"
            >
              Teamet är låst — visa Go/No-Go-bedömningen →
            </Link>
          )}
        </>
      )}

      {loading && !match && (
        <div className="py-8 flex justify-center">
          <ForgeLoader />
        </div>
      )}

      {!match && !loading && (
        <p className="text-ink-mute text-sm text-center py-8">
          Klicka &quot;Matcha konsulter&quot; för att generera ett teamförslag.
        </p>
      )}
    </div>
  );
}
