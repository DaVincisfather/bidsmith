"use client";

import { useState } from "react";
import type { BidSummary, BidOutcome, LossReason } from "@/lib/types";
import { OutcomeEnrichmentForm } from "./OutcomeEnrichmentForm";

interface Props {
  awaiting: BidSummary[];
  onClose: () => void;
  onCommitted: () => void;
}

// Utfallsdialogen i omdesignens DNA (pipeline-UX-passet 2026-08-16, godkänd
// mockup): Fraunces-rubrik, ärlig banner, vita kort med tydliga
// utfallsknappar och chip + berikningsfält efter val. Mekaniken
// (commit-före-berikning, uppskjuten refetch) är orörd.
export function OutcomeSheet({ awaiting, onClose, onCommitted }: Props) {
  const [committed, setCommitted] = useState<Record<string, BidOutcome>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const hasCommitted = Object.keys(committed).length > 0;
  const sheetWidth = hasCommitted ? "720px" : "460px";

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
    // No onCommitted() here: a parent refetch would drop the bid out of
    // `awaiting` and unmount this row before the enrichment form (reason,
    // competitor) ever renders. The refetch happens on save/skip/close instead.
    setCommitted((prev) => ({ ...prev, [bidId]: outcome }));
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
      <div className="fixed inset-0 z-40 bg-ink/25" onClick={onClose} />
      <aside
        className="fixed bottom-0 right-0 top-0 z-50 flex flex-col bg-paper shadow-2xl"
        style={{ width: sheetWidth, transition: "width 200ms ease-out" }}
      >
        <header className="flex items-start justify-between border-b border-rule px-6 py-4">
          <div>
            <h2 className="font-display text-xl font-medium">Logga utfall</h2>
            <div className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-ink-mute">
              {awaiting.length} anbud väntar beslut
            </div>
          </div>
          <button onClick={onClose} aria-label="Stäng" className="text-2xl leading-none text-ink-mute">
            ×
          </button>
        </header>
        {/* Ärlig copy (correctness-fyndet 2026-08-14): utfallen tränar ingen
            modell i dag — de bygger firmans historik/win-rate. */}
        <div className="border-b border-rule bg-paper-2 px-6 py-2.5 text-[11px] text-ink-soft">
          Detaljerna sparas i firmans historik — win-rate och förlustmönster syns på statistiksidan.
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {awaiting.length === 0 && (
            <p className="text-sm italic text-ink-soft">Inga anbud väntar på utfall.</p>
          )}
          {awaiting.map((bid) => {
            const outcomeKey = committed[bid.id];
            return (
              <div
                key={bid.id}
                className="mb-3 rounded-xl border border-rule bg-white px-4 py-3.5 shadow-sm"
              >
                <div className="text-[13.5px] font-semibold text-ink">{bid.title}</div>
                <div className="mt-1 font-mono text-[9px] uppercase tracking-wide text-ink-mute">
                  Inlämnat {new Date(bid.exportedAt).toLocaleDateString("sv-SE")}
                  {bid.teamNames.length > 0 && ` · Team: ${bid.teamNames.join(", ")}`}
                </div>
                {!outcomeKey && (
                  <div className="mt-3 flex gap-2">
                    <button
                      disabled={savingId === bid.id}
                      onClick={() => commitOutcome(bid.id, "won")}
                      className="flex-1 rounded-lg bg-emerald-600 py-2 text-xs font-semibold text-white
                                 transition-colors hover:bg-emerald-700 disabled:opacity-50"
                    >
                      ✓ Vunnen
                    </button>
                    <button
                      disabled={savingId === bid.id}
                      onClick={() => commitOutcome(bid.id, "lost")}
                      className="flex-1 rounded-lg border border-red-600 bg-white py-2 text-xs
                                 font-semibold text-red-600 transition-colors hover:bg-red-50
                                 disabled:opacity-50"
                    >
                      ✗ Förlorad
                    </button>
                    <button
                      disabled={savingId === bid.id}
                      onClick={() => commitOutcome(bid.id, "cancelled")}
                      className="flex-1 rounded-lg border border-rule bg-transparent py-2 text-xs
                                 font-semibold text-ink-soft transition-colors hover:bg-paper-2
                                 disabled:opacity-50"
                    >
                      Avbröts
                    </button>
                  </div>
                )}
                {outcomeKey && (outcomeKey === "won" || outcomeKey === "lost") && (
                  <OutcomeEnrichmentForm
                    outcome={outcomeKey}
                    onSave={(v) => saveEnrichment(bid.id, v)}
                    onSkip={() => {
                      setCommitted((prev) => {
                        const next = { ...prev };
                        delete next[bid.id];
                        return next;
                      });
                      onCommitted();
                    }}
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
