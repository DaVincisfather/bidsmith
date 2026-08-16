"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { PipelineItem, BidSummary, PipelineStats } from "@/lib/types";
import { splitDashboard } from "@/lib/pipeline";
import { PipelineRow } from "./PipelineRow";
import { SubmittedRow, ArchiveRow } from "./SubmittedRow";
import { OutcomeSheet } from "./OutcomeSheet";

// Flikvarianten (Stefans val 2026-08-16 efter anti-slop-kritiken på chipsen):
// Pågående | Arkiv som två flikar — avgjort är ett annat mentalt läge än
// pågående och får en egen vy i stället för att blandas in i arbetsströmmen.
// Inga statuschips på korten; mono-sektionsrubrikerna bär hierarkin som i
// editorn. Mekaniken (splitDashboard/superseded, ärlig win-rate-fot) orörd.
type RailTab = "ongoing" | "archive";

function SectionHeading({ label, count }: { label: string; count: number | null }) {
  return (
    <h3 className="mb-2.5 mt-5 flex items-baseline justify-between font-mono text-[10px] font-bold uppercase tracking-widest text-ink-mute first:mt-0">
      <span>{label}</span>
      {count !== null && <span className="text-accent">{count}</span>}
    </h3>
  );
}

export function PipelineRail() {
  const [pipeItems, setPipeItems] = useState<PipelineItem[] | null>(null);
  const [bidItems, setBidItems] = useState<BidSummary[] | null>(null);
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [tab, setTab] = useState<RailTab>("ongoing");

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
  const ongoingCount = (pipeItems?.length ?? 0) + awaiting.length;
  const decided = stats ? stats.wonCount + stats.lostCount : 0;
  const winRate = decided > 0 && stats ? Math.round((stats.wonCount / decided) * 100) : null;

  const tabs: Array<{ key: RailTab; label: string; count: number }> = [
    { key: "ongoing", label: "Pågående", count: ongoingCount },
    { key: "archive", label: "Arkiv", count: archive.length },
  ];

  return (
    <aside className="flex h-full flex-col border-l border-rule bg-paper-2">
      <div
        role="tablist"
        aria-label="Pipen"
        className="flex border-b border-rule bg-paper"
        onKeyDown={(e) => {
          // Fullt tabs-mönster (routine-fynd #127): piltangenter växlar flik.
          if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
            setTab((prev) => (prev === "ongoing" ? "archive" : "ongoing"));
          }
        }}
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            id={`rail-tab-${t.key}`}
            role="tab"
            aria-selected={tab === t.key}
            aria-controls="rail-tabpanel"
            tabIndex={tab === t.key ? 0 : -1}
            onClick={() => setTab(t.key)}
            className={`flex-1 border-b-2 pb-2.5 pt-3 text-center font-mono text-[10px] uppercase
                        tracking-widest transition-colors ${
                          tab === t.key
                            ? "border-accent font-bold text-accent"
                            : "border-transparent text-ink-mute hover:text-ink-soft"
                        }`}
          >
            {t.label}
            <span className={`ml-1.5 text-[9px] ${tab === t.key ? "text-accent" : "text-ink-mute"}`}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id="rail-tabpanel"
        aria-labelledby={`rail-tab-${tab}`}
        className="flex flex-1 flex-col overflow-y-auto p-4"
      >
        {!loaded && <p className="text-xs text-ink-mute">Laddar…</p>}

        {loaded && tab === "ongoing" && (
          <>
            <SectionHeading label="Aktiva FFU:er" count={pipeItems!.length} />
            {pipeItems!.length === 0 && (
              <p className="mb-2 text-xs italic text-ink-mute">
                Inga aktuella FFU:er. Ladda upp eller kika på <a href="/radar" className="underline">Radar →</a>
              </p>
            )}
            {pipeItems!.map((item) => (
              <PipelineRow key={item.id} item={item} />
            ))}
            {/* BUG-B: the pipe hides passed deadlines by design — this is the
                permanent path back to EVERY analysis, one click away. */}
            <Link href="/arbetsyta/analyser" className="mt-1 block text-xs text-ink-mute underline hover:no-underline">
              Alla analyser →
            </Link>

            <SectionHeading label="Väntar beslut" count={awaiting.length} />
            {awaiting.length === 0 && (
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
                className="mt-0.5 flex w-full items-center justify-center gap-2 rounded-xl bg-accent
                           px-3 py-2 text-xs font-semibold text-white transition-colors
                           hover:bg-accent-ink"
              >
                <span className="rounded-full bg-white/20 px-2 py-px font-mono text-[10px]">
                  {awaiting.length}
                </span>
                Logga utfall →
              </button>
            )}
          </>
        )}

        {loaded && tab === "archive" && (
          <>
            <SectionHeading label="Avgjorda" count={archive.length} />
            {archive.length === 0 && (
              <p className="mb-2 text-xs italic text-ink-mute">Inga avgjorda anbud än.</p>
            )}
            {archive.map((entry) => (
              <ArchiveRow key={entry.bid.id} entry={entry} />
            ))}
            {archive.length > 0 && (
              <Link
                href="/arbetsyta/statistik"
                className="mt-2 block text-xs text-ink-mute underline hover:no-underline"
              >
                Hela arkivet med utfall →
              </Link>
            )}
          </>
        )}

        {/* Ärlig fot (correctness-fyndet 2026-08-14): utfallen bär statistik,
            inte go/no-go-kalibrering — lova inte kalibreringen före funktionen. */}
        {stats && stats.loggedCount > 0 && (
          <p className="mt-5 border-t border-rule pt-3 text-[11px] leading-relaxed text-ink-mute">
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
          <p className="mt-5 border-t border-rule pt-3 text-[11px] leading-relaxed text-ink-mute">
            Logga utfall så byggs firmans win-rate och historik upp på statistiksidan.
          </p>
        )}
      </div>

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
