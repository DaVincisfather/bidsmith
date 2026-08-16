"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { PipelineItem, BidSummary, PipelineStats } from "@/lib/types";
import { splitDashboard } from "@/lib/pipeline";
import { PipelineRow } from "./PipelineRow";
import { SubmittedRow } from "./SubmittedRow";
import { OutcomeSheet } from "./OutcomeSheet";

// Railens sektioner (pipeline-UX-passet 2026-08-16, godkänd mockup): Aktiva →
// Väntar beslut (dedupad, en rad per analys) → Arkiv (avgjorda lämnar korten,
// 3 senaste + länk till statistiksidan) → ärlig win-rate-fot.
const ARCHIVE_PREVIEW = 3;

const ARCHIVE_GLYPH: Record<string, { char: string; cls: string }> = {
  won: { char: "✓", cls: "text-emerald-600" },
  lost: { char: "✗", cls: "text-red-600" },
  cancelled: { char: "—", cls: "text-ink-mute" },
  "no-bid": { char: "—", cls: "text-ink-mute" },
};

function SectionHeading({ label, count }: { label: string; count: number | null }) {
  return (
    <h3 className="mb-2 mt-5 flex items-baseline justify-between font-mono text-[10px] font-bold uppercase tracking-widest text-ink-mute first:mt-0">
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

  const { awaiting, archive } = splitDashboard(bidItems ?? []);
  const awaitingBids = awaiting.map((e) => e.bid);
  const decided = stats ? stats.wonCount + stats.lostCount : 0;
  const winRate = decided > 0 && stats ? Math.round((stats.wonCount / decided) * 100) : null;

  return (
    <aside className="h-full overflow-y-auto border-l border-rule bg-paper-2 p-4">
      <SectionHeading label="Pipen · Aktiva" count={pipeItems ? pipeItems.length : null} />
      {pipeItems === null && <p className="text-xs text-ink-mute">Laddar…</p>}
      {pipeItems && pipeItems.length === 0 && (
        <p className="text-xs italic text-ink-mute">
          Inga aktuella RFPs. Ladda upp eller kika på <a href="/radar" className="underline">Radar →</a>
        </p>
      )}
      {pipeItems?.map((item) => (
        <PipelineRow key={item.id} item={item} />
      ))}
      {/* BUG-B: the pipe hides passed deadlines by design — this is the
          permanent path back to EVERY analysis, one click away. */}
      <Link href="/arbetsyta/analyser" className="mt-1 block text-xs text-ink-mute underline hover:no-underline">
        Alla analyser →
      </Link>

      <SectionHeading label="Väntar beslut" count={bidItems ? awaiting.length : null} />
      {bidItems === null && <p className="text-xs text-ink-mute">Laddar…</p>}
      {bidItems && awaiting.length === 0 && (
        <p className="text-xs italic text-ink-mute">
          Inga anbud väntar beslut. Markerar du ett anbud som inlämnat hamnar det här.
        </p>
      )}
      {awaiting.map((entry) => (
        <SubmittedRow key={entry.bid.id} entry={entry} />
      ))}
      {awaiting.length > 0 && (
        <button
          onClick={() => setSheetOpen(true)}
          className="mt-1 flex w-full items-center gap-2 rounded-xl bg-accent px-3 py-2 text-xs
                     font-semibold text-white transition-colors hover:bg-accent-ink"
        >
          <span className="rounded-full bg-white/20 px-2 py-px font-mono text-[10px]">
            {awaiting.length}
          </span>
          Logga utfall →
        </button>
      )}

      {archive.length > 0 && (
        <div className="mt-5 border-t border-rule pt-3">
          <SectionHeading label="Arkiv · Avgjorda" count={archive.length} />
          {archive.slice(0, ARCHIVE_PREVIEW).map((bid) => {
            const glyph = ARCHIVE_GLYPH[bid.outcome ?? "cancelled"];
            return (
              <Link
                key={bid.id}
                href={`/bids/${bid.id}`}
                className="flex items-baseline gap-2 px-0.5 py-1 text-[11.5px] text-ink-mute hover:text-ink-soft"
              >
                <span aria-hidden className={`font-mono text-[9px] ${glyph.cls}`}>
                  {glyph.char}
                </span>
                <span className="truncate">{bid.title}</span>
              </Link>
            );
          })}
          <Link
            href="/arbetsyta/statistik"
            className="mt-1 block text-xs text-ink-mute underline hover:no-underline"
          >
            Hela arkivet med utfall →
          </Link>
        </div>
      )}

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
