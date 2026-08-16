"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { PipelineItem, BidSummary, PipelineStats } from "@/lib/types";
import { splitDashboard } from "@/lib/pipeline";
import { PipelineRow } from "./PipelineRow";
import { SubmittedRow, DecidedRow } from "./SubmittedRow";
import { OutcomeSheet } from "./OutcomeSheet";

// Railen som EN yta med filterchips (Stefans val 2026-08-16 —
// beautifului.dev:s filter table-mönster i Bidsmiths tokens): Alla/Aktiva/
// Väntar beslut/Avgjorda filtrerar den gemensamma listan live. Avgjorda capas
// i Alla-läget; dedupen (splitDashboard) och ärliga win-rate-foten från
// sektionsvarianten återanvänds oförändrade.
type RailFilter = "all" | "active" | "awaiting" | "decided";

const DECIDED_CAP_IN_ALL = 3;

export function PipelineRail() {
  const [pipeItems, setPipeItems] = useState<PipelineItem[] | null>(null);
  const [bidItems, setBidItems] = useState<BidSummary[] | null>(null);
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [filter, setFilter] = useState<RailFilter>("all");

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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- baselined at CI introduction
    refetch();
  }, [refetch]);

  const loaded = pipeItems !== null && bidItems !== null;
  const { awaiting, archive } = splitDashboard(bidItems ?? []);
  const awaitingBids = awaiting.map((e) => e.bid);
  const totalCount = (pipeItems?.length ?? 0) + awaiting.length + archive.length;
  const decided = stats ? stats.wonCount + stats.lostCount : 0;
  const winRate = decided > 0 && stats ? Math.round((stats.wonCount / decided) * 100) : null;

  const showActive = filter === "all" || filter === "active";
  const showAwaiting = filter === "all" || filter === "awaiting";
  const showDecided = filter === "all" || filter === "decided";
  const decidedVisible = filter === "all" ? archive.slice(0, DECIDED_CAP_IN_ALL) : archive;

  const chips: Array<{ key: RailFilter; label: string; count: number }> = [
    { key: "all", label: "Alla", count: totalCount },
    { key: "active", label: "Aktiva", count: pipeItems?.length ?? 0 },
    { key: "awaiting", label: "Väntar beslut", count: awaiting.length },
    { key: "decided", label: "Avgjorda", count: archive.length },
  ];

  return (
    <aside className="h-full overflow-y-auto border-l border-rule bg-paper-2 p-4">
      <h3 className="mb-2.5 font-mono text-[10px] font-bold uppercase tracking-widest text-ink-mute">
        Pipen
      </h3>
      <div className="mb-3.5 flex flex-wrap gap-1.5" role="group" aria-label="Filtrera pipen">
        {chips.map((c) => (
          <button
            key={c.key}
            onClick={() => setFilter(c.key)}
            aria-pressed={filter === c.key}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]
                        font-medium transition-colors ${
                          filter === c.key
                            ? "border-accent bg-accent text-white"
                            : "border-rule bg-white text-ink-soft hover:border-ink-mute"
                        }`}
          >
            {c.label}
            <span
              className={`font-mono text-[9px] ${
                filter === c.key ? "text-white/75" : "text-ink-mute"
              }`}
            >
              {c.count}
            </span>
          </button>
        ))}
      </div>

      {!loaded && <p className="text-xs text-ink-mute">Laddar…</p>}

      {loaded && showActive && (
        <>
          {filter === "active" && pipeItems!.length === 0 && (
            <p className="mb-2 text-xs italic text-ink-mute">
              Inga aktuella RFPs. Ladda upp eller kika på <a href="/radar" className="underline">Radar →</a>
            </p>
          )}
          {pipeItems!.map((item) => (
            <PipelineRow key={item.id} item={item} />
          ))}
        </>
      )}

      {loaded && showAwaiting && (
        <>
          {filter === "awaiting" && awaiting.length === 0 && (
            <p className="mb-2 text-xs italic text-ink-mute">
              Inga anbud väntar beslut. Markerar du ett anbud som inlämnat hamnar det här.
            </p>
          )}
          {awaiting.map((entry) => (
            <SubmittedRow key={entry.bid.id} entry={entry} />
          ))}
          {awaiting.length > 0 && (
            <button
              onClick={() => setSheetOpen(true)}
              className="mb-2 mt-0.5 flex w-full items-center gap-2 rounded-xl bg-accent px-3 py-2
                         text-xs font-semibold text-white transition-colors hover:bg-accent-ink"
            >
              <span className="rounded-full bg-white/20 px-2 py-px font-mono text-[10px]">
                {awaiting.length}
              </span>
              Logga utfall →
            </button>
          )}
        </>
      )}

      {loaded && showDecided && (
        <>
          {filter === "decided" && archive.length === 0 && (
            <p className="mb-2 text-xs italic text-ink-mute">Inga avgjorda anbud än.</p>
          )}
          {decidedVisible.map((entry) => (
            <DecidedRow key={entry.bid.id} entry={entry} />
          ))}
          {filter === "all" && archive.length > DECIDED_CAP_IN_ALL && (
            <button
              onClick={() => setFilter("decided")}
              className="block text-xs text-ink-mute underline hover:no-underline"
            >
              Visa alla {archive.length} avgjorda →
            </button>
          )}
        </>
      )}

      {/* BUG-B: the pipe hides passed deadlines by design — this is the
          permanent path back to EVERY analysis, one click away. */}
      <Link href="/arbetsyta/analyser" className="mt-2 block text-xs text-ink-mute underline hover:no-underline">
        Alla analyser →
      </Link>

      {/* Ärlig fot (correctness-fyndet 2026-08-14): utfallen bär statistik,
          inte go/no-go-kalibrering — lova inte kalibreringen före funktionen. */}
      {stats && stats.loggedCount > 0 && (
        <p className="mt-4 border-t border-rule pt-3 text-[11px] leading-relaxed text-ink-mute">
          {winRate !== null && (
            <>
              Win-rate <b className="text-ink-soft">{winRate} %</b> · {stats.wonCount} W /{" "}
              {stats.lostCount} L ·{" "}
            </>
          )}
          {stats.loggedCount} loggade utfall — detaljer på{" "}
          <Link href="/arbetsyta/statistik" className="underline hover:no-underline">
            statistiksidan
          </Link>
          .
        </p>
      )}
      {stats && stats.loggedCount === 0 && awaiting.length > 0 && (
        <p className="mt-4 border-t border-rule pt-3 text-[11px] leading-relaxed text-ink-mute">
          Logga utfall så byggs firmans win-rate och historik upp på statistiksidan.
        </p>
      )}

      {sheetOpen && (
        <OutcomeSheet
          awaiting={awaitingBids}
          onClose={() => {
            setSheetOpen(false);
            // Committed-but-unenriched outcomes only reach the rail here —
            // the sheet defers refetch until save/skip to keep its rows mounted.
            refetch();
          }}
          onCommitted={refetch}
        />
      )}
    </aside>
  );
}
