"use client";

import { useEffect, useRef, useState } from "react";
import type {
  EvidenceSpan,
  LocatedSpans,
} from "@/lib/evidence-context";
import { SourceQuote } from "@/components/kalla-chip";

interface SourceViewData {
  sourceText: string;
  spans: LocatedSpans;
  fileUrl?: string;
}

interface Segment {
  text: string;
  kind: "plain" | "hl" | "active";
}

/**
 * Delar upp källtexten i segment längs den sammanslagna täckningskartan och skär
 * ut det AKTIVA citatets spann (som ligger inuti ett merge) för starkare betoning.
 * Omarkerad text = källmaterial som inget påstående använt (kartans hela poäng).
 */
function buildSegments(
  text: string,
  merged: EvidenceSpan[],
  active: EvidenceSpan | null,
): Segment[] {
  const segs: Segment[] = [];
  let cursor = 0;
  for (const m of merged) {
    if (m.start > cursor)
      segs.push({ text: text.slice(cursor, m.start), kind: "plain" });
    if (active && active.start < m.end && active.end > m.start) {
      const aStart = Math.max(m.start, active.start);
      const aEnd = Math.min(m.end, active.end);
      if (aStart > m.start)
        segs.push({ text: text.slice(m.start, aStart), kind: "hl" });
      segs.push({ text: text.slice(aStart, aEnd), kind: "active" });
      if (aEnd < m.end)
        segs.push({ text: text.slice(aEnd, m.end), kind: "hl" });
    } else {
      segs.push({ text: text.slice(m.start, m.end), kind: "hl" });
    }
    cursor = m.end;
  }
  if (cursor < text.length)
    segs.push({ text: text.slice(cursor), kind: "plain" });
  return segs;
}

/**
 * Källvy (slide-over): fast högerpanel som visar HELA källdokumentet med alla
 * verifierade citat markerade (bg-accent-soft) och det klickade citatet starkare
 * betonat + autoscrollat in i vyn. Hämtar sin endpoint vid öppning; enkla
 * laddnings-/felstadier. role=dialog + aria-modal, Escape stänger, fokus på
 * stäng-knappen vid öppning (a11y).
 */
export function SourceViewer({
  open,
  url,
  quote,
  title,
  onClose,
}: {
  open: boolean;
  url: string | null;
  quote: string | null;
  title?: string;
  onClose: () => void;
}) {
  // Resultatet BÄR sin url (result-carries-its-key): setState sker BARA i async-
  // callbacken → inget synkront setState-i-effekt (react-hooks/set-state-in-effect).
  // Laddnings-/fel-läget härleds ur url vs result.url i renderingen nedan.
  const [result, setResult] = useState<{
    url: string;
    data: SourceViewData | null;
    error: boolean;
  } | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const activeRef = useRef<HTMLSpanElement | null>(null);

  // Hämta källvyn när panelen öppnas (monteras lazy → ingen fetch i onödan).
  useEffect(() => {
    if (!open || !url) return;
    let cancelled = false;
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fetch failed"))))
      .then((d: SourceViewData) => {
        if (!cancelled) setResult({ url, data: d, error: false });
      })
      .catch(() => {
        if (!cancelled) setResult({ url, data: null, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [open, url]);

  // Härled läget ur url:en resultatet bär (ignorera stale resultat från förra url:en).
  const current = url && result && result.url === url ? result : null;
  const data = current && !current.error ? current.data : null;
  const isLoading = Boolean(url) && !current;
  const isError = Boolean(current?.error);

  // Escape stänger; fokusera stäng-knappen vid öppning (tangentbord/skärmläsare).
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Scrolla det aktiva citatet till mitten när data/citat ändras. scrollIntoView
  // saknas i jsdom → optional-call gör testerna gröna utan mock.
  useEffect(() => {
    if (data && quote) activeRef.current?.scrollIntoView?.({ block: "center" });
  }, [data, quote]);

  if (!open) return null;

  const activeSpan =
    data && quote
      ? (data.spans.perEvidence.find((s) => s.evidence === quote) ?? null)
      : null;
  const segments = data
    ? buildSegments(data.sourceText, data.spans.merged, activeSpan)
    : [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title ?? "Källdokument"}
      className="fixed right-0 top-0 z-50 flex h-full w-full max-w-2xl flex-col border-l border-rule bg-paper shadow-xl"
    >
      <header className="flex items-start justify-between gap-4 border-b border-rule px-5 py-4">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-medium text-ink">
            {title ?? "Källdokument"}
          </h2>
          {data && (
            <p className="mt-0.5 text-xs text-ink-mute">
              Markerat = verifierade citat · omarkerat = ej använt källmaterial
            </p>
          )}
          {data?.fileUrl && (
            <a
              href={data.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-xs text-accent-ink underline underline-offset-2 hover:brightness-95"
            >
              Öppna originalet ↗
            </a>
          )}
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Stäng källvyn"
          className="shrink-0 rounded p-1 text-ink-mute transition hover:bg-paper-2 hover:text-ink"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {isLoading && (
          <p className="text-sm text-ink-mute">Laddar källdokumentet…</p>
        )}
        {isError && (
          <div className="text-sm text-ink-mute">
            <p>Kunde inte ladda källdokumentet.</p>
            {quote && <SourceQuote quote={quote} />}
          </div>
        )}
        {data && data.sourceText.trim() === "" && (
          <p className="text-sm text-ink-mute">
            Ingen källtext lagrad för det här dokumentet.
          </p>
        )}
        {data && data.sourceText.trim() !== "" && (
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-soft">
            {segments.map((seg, i) => {
              if (seg.kind === "plain") return <span key={i}>{seg.text}</span>;
              if (seg.kind === "active") {
                // buildSegments skär ut exakt ETT aktivt segment (citatspannet är
                // sammanhängande inuti ett merge) → refen är entydig.
                return (
                  <mark
                    key={i}
                    ref={activeRef}
                    className="rounded bg-accent-soft text-ink ring-1 ring-accent ring-inset"
                  >
                    {seg.text}
                  </mark>
                );
              }
              return (
                <mark key={i} className="rounded bg-accent-soft text-ink">
                  {seg.text}
                </mark>
              );
            })}
          </p>
        )}
      </div>
    </div>
  );
}
