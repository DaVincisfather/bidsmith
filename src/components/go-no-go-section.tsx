"use client";

import { useRef, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { GoNoGoResultView } from "./go-no-go-result";
import type { FlowAssessment, FlowBid, FlowMatch } from "@/lib/flow-state";

interface GoNoGoSectionProps {
  analysisId: string;
  assessment: FlowAssessment;
  match: FlowMatch | null;
  bid: FlowBid | null;
}

const LEVEL_LABELS: Record<string, string> = {
  expert: "Expert",
  senior: "Senior",
  intermediate: "Medel",
  junior: "Junior",
};

/** Polls GET /api/bids/[id] until status leaves 'generating'. Returns null if
 *  the component unmounted (generation continues server-side). A single failed
 *  poll must NOT surface as "generation failed" — the generation continues
 *  server-side; only give up after several failures in a row. */
async function pollBidUntilDone(
  bidId: string,
  isMounted: () => boolean,
): Promise<{ status: string } | null> {
  let consecutiveFailures = 0;
  for (;;) {
    if (!isMounted()) return null;
    let bid: { status: string } | null = null;
    try {
      const res = await fetch(`/api/bids/${bidId}`);
      if (res.ok) bid = (await res.json()) as { status: string };
    } catch {
      // Network rejection (dropped wifi, laptop sleep) — counted below,
      // exactly like a non-ok response.
    }
    if (bid) {
      consecutiveFailures = 0;
      if (bid.status !== "generating") return bid;
    } else {
      consecutiveFailures += 1;
      if (consecutiveFailures >= 5) {
        throw new Error(
          "Kunde inte följa genereringen — den fortsätter i bakgrunden. Ladda om sidan om en stund.",
        );
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

export function GoNoGoSection({ analysisId, assessment, match, bid }: GoNoGoSectionProps) {
  const router = useRouter();
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const [working, setWorking] = useState<"generate" | "unlock" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const team = (match?.scoredConsultants ?? []).filter((c) =>
    assessment.teamConsultantIds.includes(c.consultantId),
  );
  const frozen = bid !== null && (bid.exportedAt !== null || bid.status === "exported");

  async function generate() {
    if (bid && !window.confirm("Detta ersätter det befintliga utkastet med ett nytt. Fortsätt?")) {
      return;
    }
    setWorking("generate");
    setError(null);
    try {
      // Record the go decision (same behavior as the old proceedToBid).
      await fetch(`/api/go-no-go/${assessment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "go" }),
      });
      const response = await fetch("/api/bids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId,
          assessmentId: assessment.id,
          teamConsultantIds: assessment.teamConsultantIds,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Bid generation failed");
      const done = await pollBidUntilDone(data.id, () => mountedRef.current);
      if (!done) return; // user left the page; generation continues server-side
      router.push(`/bids/${data.id}`);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : "Something went wrong");
      setWorking(null);
    }
  }

  async function unlock() {
    const message = bid
      ? "Detta låser upp teamet och raderar go/no-go-bedömningen OCH anbudsutkastet. Fortsätt?"
      : "Detta låser upp teamet och raderar go/no-go-bedömningen. Fortsätt?";
    if (!window.confirm(message)) return;
    setWorking("unlock");
    setError(null);
    try {
      const res = await fetch(`/api/analyses/${analysisId}/unlock-team`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Kunde inte låsa upp teamet");
      }
      router.push(`/analysis/${analysisId}`);
      router.refresh();
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : "Something went wrong");
      setWorking(null);
    }
  }

  const actions = frozen ? (
    <>
      <span className="flex-1 px-4 py-2 text-sm text-ink-mute text-center">
        Anbudet är inlämnat — flödet är låst.
      </span>
      <Link
        href={`/bids/${bid!.id}`}
        className="flex-1 bg-ink text-white px-4 py-2 rounded-lg text-sm font-medium text-center
                   hover:bg-accent-ink transition-colors"
      >
        Öppna anbudet
      </Link>
    </>
  ) : (
    <>
      <button
        onClick={unlock}
        disabled={working !== null}
        className="flex-1 border border-rule text-ink-soft px-4 py-2 rounded-lg text-sm font-medium
                   hover:bg-paper-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {working === "unlock" ? "Låser upp..." : "Lås upp och ändra team"}
      </button>
      {bid && (
        <Link
          href={`/bids/${bid.id}`}
          className="flex-1 bg-ink text-white px-4 py-2 rounded-lg text-sm font-medium text-center
                     hover:bg-accent-ink transition-colors"
        >
          Öppna anbudet
        </Link>
      )}
      <button
        onClick={generate}
        disabled={working !== null}
        className="flex-1 bg-ink text-white px-4 py-2 rounded-lg text-sm font-medium
                   hover:bg-accent-ink disabled:bg-rule disabled:cursor-not-allowed transition-colors"
      >
        {working === "generate"
          ? "Genererar anbud..."
          : bid
            ? "Generera om (ersätter utkastet)"
            : "Generera anbud"}
      </button>
    </>
  );

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-display font-normal mb-4">Låst team</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {team.map((c) => (
            <div key={c.consultantId} className="border border-rule rounded-lg px-4 py-3 bg-paper">
              <div className="font-medium text-ink text-sm">{c.consultantName}</div>
              <div className="text-xs text-ink-mute mt-0.5">
                {LEVEL_LABELS[c.level] ?? c.level} · {c.score} p
              </div>
            </div>
          ))}
          {team.length === 0 && (
            <p className="text-sm text-ink-mute">Teamkorten kunde inte läsas ur matchningen.</p>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
          {error}
        </div>
      )}

      <GoNoGoResultView result={assessment.result} assessmentId={assessment.id} actions={actions} />
    </div>
  );
}
