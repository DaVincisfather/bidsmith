"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TeamProposal } from "./team-proposal";
import { GoNoGoResultView } from "./go-no-go-result";
import { GoNoGoResult } from "@/lib/types";
import { BUNDLE_LABELS_SV, type FailedBundle } from "@/lib/bundle-labels";
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
}

function buildDefaultTeamIds(scored: ScoredConsultant[]): Set<string> {
  // Pick top 3 by score, regardless of level
  const top = [...scored].sort((a, b) => b.score - a.score).slice(0, 3);
  return new Set(top.map((c) => c.consultantId));
}

interface BidStatus {
  status: string;
  failedBundles: FailedBundle[];
  generationError: string | null;
}

// POST /api/bids returns 202 before generation finishes (it runs server-side
// in the background). Poll until the bid leaves 'generating' so the
// partial/failure UX below still applies.
async function pollBidUntilDone(bidId: string): Promise<BidStatus> {
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 4000));
    const res = await fetch(`/api/bids/${bidId}`);
    if (!res.ok) throw new Error("Kunde inte hämta anbudsstatus");
    const bid: BidStatus = await res.json();
    if (bid.status !== "generating") return bid;
  }
}

export function AnalysisMatchSection({
  analysisId,
  latestMatch,
}: AnalysisMatchSectionProps) {
  const router = useRouter();
  const [match, setMatch] = useState<MatchData | null>(latestMatch);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    latestMatch ? buildDefaultTeamIds(latestMatch.scoredConsultants) : new Set()
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Go/No-Go state
  const [teamLocked, setTeamLocked] = useState(false);
  const [goNoGoLoading, setGoNoGoLoading] = useState(false);
  const [goNoGoResult, setGoNoGoResult] = useState<GoNoGoResult | null>(null);
  const [goNoGoId, setGoNoGoId] = useState<string | null>(null);

  // Bid state
  const [bidLoading, setBidLoading] = useState(false);
  const [partialBid, setPartialBid] = useState<{
    id: string;
    failedBundles: FailedBundle[];
  } | null>(null);

  async function triggerMatching() {
    setLoading(true);
    setError(null);
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

    setTeamLocked(true);
    setGoNoGoLoading(true);
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
    if (goNoGoId) {
      await fetch(`/api/go-no-go/${goNoGoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "go" }),
      });
    }

    setBidLoading(true);
    setError(null);
    setPartialBid(null);

    try {
      const response = await fetch("/api/bids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId,
          assessmentId: goNoGoId,
          teamConsultantIds: Array.from(selectedIds),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Bid generation failed");
      }

      const data = await response.json();
      const bid = await pollBidUntilDone(data.id);
      if (bid.status === "failed") {
        throw new Error(bid.generationError || "Bid generation failed");
      }
      if (bid.failedBundles.length > 0) {
        // Partiellt utkast: navigera inte tyst till ett ofullständigt anbud —
        // visa vilka sektioner som saknas och låt användaren öppna det medvetet.
        setPartialBid({ id: data.id, failedBundles: bid.failedBundles });
        setBidLoading(false);
        return;
      }
      router.push(`/bids/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBidLoading(false);
    }
  }

  return (
    <div className="border-t border-rule pt-8 mt-8 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display font-normal">Teammatchning</h2>
        {!teamLocked && (
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

      {partialBid && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded text-sm space-y-2">
          <p className="font-medium">
            {partialBid.failedBundles.length}{" "}
            {partialBid.failedBundles.length === 1 ? "sektion" : "sektioner"} kunde inte genereras
          </p>
          <p>
            Utkastet sparades utan:{" "}
            {partialBid.failedBundles
              .map((f) => BUNDLE_LABELS_SV[f.bundle] ?? f.bundle)
              .join(", ")}
            . Öppna utkastet för att granska, eller kör anbudsgenereringen igen för att försöka på nytt.
          </p>
          <button
            onClick={() => router.push(`/bids/${partialBid.id}`)}
            className="bg-ink text-white px-4 py-2 rounded-lg text-xs font-medium
                       hover:bg-accent-ink transition-colors"
          >
            Öppna utkastet ändå
          </button>
        </div>
      )}

      {match && (
        <>
          <TeamProposal
            scoredConsultants={match.scoredConsultants}
            selectedIds={selectedIds}
            onToggle={handleToggle}
            disabled={teamLocked}
          />

          {!teamLocked && !goNoGoLoading && (
            <button
              onClick={lockTeamAndEvaluate}
              disabled={selectedIds.size === 0}
              className="w-full border-2 border-dashed border-rule text-ink-soft px-4 py-3 rounded-lg text-sm font-medium
                         hover:border-accent hover:text-ink disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Lås team ({selectedIds.size} valda) och kör Go/No-Go-analys
            </button>
          )}

          {goNoGoLoading && (
            <div className="py-8 flex justify-center">
              <ForgeLoader />
            </div>
          )}

          {goNoGoResult && goNoGoId && (
            <GoNoGoResultView
              result={goNoGoResult}
              assessmentId={goNoGoId}
              onUnlock={unlockTeam}
              onProceedToBid={proceedToBid}
              bidLoading={bidLoading}
            />
          )}

          {bidLoading && (
            <div className="py-8 flex justify-center">
              <ForgeLoader />
            </div>
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
