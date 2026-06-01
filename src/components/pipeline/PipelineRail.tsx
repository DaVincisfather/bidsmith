"use client";

import { useEffect, useState, useCallback } from "react";
import type { PipelineItem, BidSummary, PipelineStats } from "@/lib/types";
import { PipelineRow } from "./PipelineRow";
import { SubmittedRow } from "./SubmittedRow";
import { OutcomeSheet } from "./OutcomeSheet";

export function PipelineRail() {
  const [pipeItems, setPipeItems] = useState<PipelineItem[] | null>(null);
  const [bidItems, setBidItems] = useState<BidSummary[] | null>(null);
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const refetch = useCallback(async () => {
    const [pipeRes, bidsRes] = await Promise.all([
      fetch("/api/pipeline").then((r) => r.json()),
      fetch("/api/bids/dashboard").then((r) => r.json()),
    ]);
    setPipeItems(pipeRes.items ?? []);
    setBidItems(bidsRes.items ?? []);
    setStats(bidsRes.stats ?? null);
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const awaiting = (bidItems ?? []).filter((b) => b.outcome === null);

  return (
    <aside className="bg-paper-2 border-l border-rule p-4 h-full">
      <h3 className="text-[10px] font-bold uppercase tracking-wider text-ink-mute mb-2">
        Pipen {pipeItems && `· ${pipeItems.length} RFPs`}
      </h3>
      {pipeItems === null && <p className="text-xs text-ink-mute">Laddar…</p>}
      {pipeItems && pipeItems.length === 0 && (
        <p className="text-xs text-ink-mute italic">
          Inga aktuella RFPs. Ladda upp eller kika på <a href="/radar" className="underline">Radar →</a>
        </p>
      )}
      {pipeItems?.map((item) => (
        <PipelineRow key={item.id} item={item} />
      ))}

      <h3 className="text-[10px] font-bold uppercase tracking-wider text-ink-mute mt-6 mb-2">
        Inlämnade {stats && `· ${stats.awaitingCount + stats.loggedCount} anbud`}
      </h3>
      {bidItems === null && <p className="text-xs text-ink-mute">Laddar…</p>}
      {bidItems && bidItems.length === 0 && (
        <p className="text-xs text-ink-mute italic">
          Inga inlämnade anbud än. Exporterar du ett anbud hamnar det här.
        </p>
      )}
      {bidItems?.map((bid) => (
        <SubmittedRow key={bid.id} bid={bid} />
      ))}

      {awaiting.length > 0 && (
        <button
          onClick={() => setSheetOpen(true)}
          className="block w-full text-left text-xs text-black underline mt-2 hover:no-underline"
        >
          📊 {awaiting.length} anbud väntar på utfall — Logga utfall →
        </button>
      )}

      {stats && stats.loggedCount > 0 && (
        <p className="text-[11px] text-ink-mute mt-4 pt-3 border-t border-rule leading-relaxed">
          Du har loggat {stats.loggedCount} utfall — Go/No-Go-rekommendationer är nu kalibrerade mot er firma.
        </p>
      )}
      {stats && stats.loggedCount === 0 && awaiting.length > 0 && (
        <p className="text-[11px] text-ink-mute mt-4 pt-3 border-t border-rule leading-relaxed">
          Logga ditt första utfall för att börja träna modellen mot er firma.
        </p>
      )}

      {sheetOpen && (
        <OutcomeSheet
          awaiting={awaiting}
          onClose={() => setSheetOpen(false)}
          onCommitted={refetch}
        />
      )}
    </aside>
  );
}
