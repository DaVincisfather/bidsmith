"use client";

import { useEffect, useState } from "react";
import type { EvidenceContext } from "@/lib/evidence-context";

// Svenska citationstecken (U+201D i båda ändar) — omsluter det ordagranna citatet.
const Q = "”";

/**
 * Citatblocket som fälls ut under ett påstående. Delas av KallaChip (krav + referenser)
 * och kompetens-chippen i konsultprofilen så markup:en inte dupliceras.
 *
 * `contextUrl` (valfri): endpoint som ger citatet I SITT SAMMANHANG. När den finns
 * hämtas ±200 tecken källtext runt citatet vid utfällning (komponenten monteras först
 * när den öppnas → ingen fetch i onödan) och renderar dämpade före/efter-fragment med
 * citatspannet markerat. Svarar på "var står det, i vilket sammanhang" — inte "vad
 * står det" (produktägar-feedback: citatet duplicerade ofta påståendet ordagrant).
 * Under laddning eller när kontexten är null: dagens rena citatblock.
 */
export function SourceQuote({
  quote,
  contextUrl,
}: {
  quote: string;
  contextUrl?: string;
}) {
  // Resultatet bär sitt citat: när `quote` ändras (t.ex. byte av öppen kompetens)
  // matchar det gamla resultatet inte längre → vi faller tillbaka till rena blocket
  // tills den nya hämtningen löser. setState sker BARA i async-callbacken (undviker
  // synkron setState-i-effekt, react-hooks/set-state-in-effect).
  const [result, setResult] = useState<{
    quote: string;
    context: EvidenceContext | null;
  } | null>(null);

  useEffect(() => {
    if (!contextUrl) return;
    let cancelled = false;
    fetch(`${contextUrl}?q=${encodeURIComponent(quote)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { context: EvidenceContext | null } | null) => {
        if (!cancelled) setResult({ quote, context: d?.context ?? null });
      })
      .catch(() => {
        if (!cancelled) setResult({ quote, context: null });
      });
    return () => {
      cancelled = true;
    };
  }, [contextUrl, quote]);

  const context = result && result.quote === quote ? result.context : null;

  // Kontext-läge: dämpade före/efter-fragment, citatet markerat (icke-kursivt,
  // text-ink, subtil bg-accent-soft-underlägg).
  if (contextUrl && context) {
    return (
      <div className="mt-1.5 bg-paper-2 border-l-[3px] border-accent rounded-r-md px-3 py-2 text-[12.5px] leading-relaxed text-ink-mute">
        {context.before && <span>{context.before} </span>}
        <span className="not-italic text-ink bg-accent-soft rounded px-0.5">
          {Q}
          {context.quote}
          {Q}
        </span>
        {context.after && <span> {context.after}</span>}
      </div>
    );
  }

  // Fallback (ingen contextUrl, laddar, eller kontext saknas): dagens rena citatblock.
  return (
    <div className="mt-1.5 bg-paper-2 border-l-[3px] border-accent rounded-r-md px-3 py-2 italic text-[12.5px] leading-relaxed text-ink-soft">
      {Q}
      {quote}
      {Q}
    </div>
  );
}

/**
 * Expanderbar källa-chip: liten pill med ▸/▾-markör som togglar citatblocket under
 * påståendet. Egen useState — varje chip togglar oberoende (krav-rader, referenser).
 * <button> med aria-expanded, inte div onClick, för tangentbord/skärmläsare.
 *
 * `contextUrl` skickas vidare till SourceQuote för sammanhangsvisning (se ovan).
 */
export function KallaChip({
  quote,
  label,
  contextUrl,
}: {
  quote: string;
  label?: string;
  contextUrl?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        // Unikt accessible name per chip — annars blir alla "källa" i
        // skärmläsarens elementlista omöjliga att skilja (routine-fynd #59).
        aria-label={label ? `källa: ${label}` : undefined}
        className="inline-flex items-center gap-0.5 align-middle rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent-ink transition hover:brightness-95"
      >
        källa <span aria-hidden="true">{open ? "▾" : "▸"}</span>
      </button>
      {open && <SourceQuote quote={quote} contextUrl={contextUrl} />}
    </>
  );
}

/**
 * Amber pill för obelagda påståenden (evidens undefined/null efter vaktens reparation).
 * Inte expanderbar — det finns inget citat att visa.
 */
export function FlaggedPill() {
  return (
    // text-flag-ink, inte text-flag: 11px-text på flag-soft kräver AA-kontrast
    // (4.5:1) — dot-färgen --flag räcker inte som textfärg (routine-fynd #59).
    <span className="inline-flex items-center gap-1 align-middle rounded-full bg-flag-soft px-2 py-0.5 text-[11px] font-medium text-flag-ink">
      <span aria-hidden="true">&#9888;</span> obelagd
    </span>
  );
}
