"use client";

import { useState } from "react";
import type { BidSummary, BidOutcome, LossReason } from "@/lib/types";
import { OutcomeEnrichmentForm } from "./OutcomeEnrichmentForm";

interface Props {
  awaiting: BidSummary[];
  onClose: () => void;
  onCommitted: () => void;
}

export function OutcomeSheet({ awaiting, onClose, onCommitted }: Props) {
  const [committed, setCommitted] = useState<Record<string, BidOutcome>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const hasCommitted = Object.keys(committed).length > 0;
  const sheetWidth = hasCommitted ? "720px" : "440px";

  async function commitOutcome(bidId: string, outcome: BidOutcome) {
    setSavingId(bidId);
    const res = await fetch(`/api/bids/${bidId}/outcome`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome }),
    });
    setSavingId(null);
    if (!res.ok) {
      alert("Kunde inte spara utfall. Försök igen.");
      return;
    }
    setCommitted((prev) => ({ ...prev, [bidId]: outcome }));
    onCommitted();
  }

  async function saveEnrichment(
    bidId: string,
    values: { competitorName: string; lossReason: LossReason | ""; lossComment: string }
  ) {
    const outcome = committed[bidId];
    const res = await fetch(`/api/bids/${bidId}/outcome`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        outcome,
        competitorName: values.competitorName || undefined,
        lossReason: values.lossReason || undefined,
        lossComment: values.lossComment || undefined,
      }),
    });
    if (!res.ok) {
      alert("Kunde inte spara detaljer.");
      return;
    }
    setCommitted((prev) => {
      const next = { ...prev };
      delete next[bidId];
      return next;
    });
    onCommitted();
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <aside
        className="fixed top-0 right-0 bottom-0 bg-paper shadow-2xl z-50 flex flex-col"
        style={{ width: sheetWidth, transition: "width 200ms ease-out" }}
      >
        <header className="flex justify-between items-center px-5 py-4 border-b border-rule">
          <h2 className="text-base font-semibold">
            Logga utfall · {awaiting.length} väntar
          </h2>
          <button onClick={onClose} className="text-2xl text-ink-mute leading-none">
            ×
          </button>
        </header>
        <div className="bg-amber-50 border-b border-amber-200 px-5 py-2.5 text-xs text-ink">
          📊 Detaljerna här tränar din firmas Go/No-Go-modell — vi lär oss vad ni vinner och förlorar på.
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {awaiting.length === 0 && (
            <p className="text-sm text-ink-soft italic">Inga anbud väntar på utfall.</p>
          )}
          {awaiting.map((bid) => {
            const outcomeKey = committed[bid.id];
            return (
              <div
                key={bid.id}
                className="border border-rule rounded-r p-3 mb-3"
                style={{
                  borderLeft: `4px solid ${
                    outcomeKey === "won"
                      ? "var(--outcome-won)"
                      : outcomeKey === "lost"
                      ? "var(--outcome-lost)"
                      : "var(--outcome-awaiting)"
                  }`,
                }}
              >
                <div className="text-sm font-medium">{bid.title}</div>
                <div className="text-xs text-ink-soft mt-1">
                  Inlämnat {new Date(bid.exportedAt).toLocaleDateString("sv-SE")}
                  {bid.teamNames.length > 0 && ` · Team: ${bid.teamNames.join(", ")}`}
                </div>
                {!outcomeKey && (
                  <div className="flex gap-1.5 mt-2.5">
                    <button
                      disabled={savingId === bid.id}
                      onClick={() => commitOutcome(bid.id, "won")}
                      className="px-3 py-1.5 bg-emerald-600 text-white rounded text-xs disabled:opacity-50"
                    >
                      Vunnen
                    </button>
                    <button
                      disabled={savingId === bid.id}
                      onClick={() => commitOutcome(bid.id, "lost")}
                      className="px-3 py-1.5 bg-paper text-red-600 border border-red-600 rounded text-xs disabled:opacity-50"
                    >
                      Förlorad
                    </button>
                    <button
                      disabled={savingId === bid.id}
                      onClick={() => commitOutcome(bid.id, "cancelled")}
                      className="px-3 py-1.5 bg-transparent text-ink-soft border border-rule rounded text-xs disabled:opacity-50"
                    >
                      Avbröts
                    </button>
                  </div>
                )}
                {outcomeKey && (outcomeKey === "won" || outcomeKey === "lost") && (
                  <OutcomeEnrichmentForm
                    outcome={outcomeKey}
                    onSave={(v) => saveEnrichment(bid.id, v)}
                    onSkip={() =>
                      setCommitted((prev) => {
                        const next = { ...prev };
                        delete next[bid.id];
                        return next;
                      })
                    }
                  />
                )}
              </div>
            );
          })}
        </div>
      </aside>
    </>
  );
}
