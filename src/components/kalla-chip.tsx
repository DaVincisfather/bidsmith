"use client";

import { useState } from "react";

// Svenska citationstecken (U+201D i båda ändar) — omsluter det ordagranna citatet.
const Q = "”";

/**
 * Citatblocket som fälls ut under ett påstående. Delas av KallaChip (krav + referenser)
 * och kompetens-chippen i konsultprofilen så markup:en inte dupliceras.
 */
export function SourceQuote({ quote }: { quote: string }) {
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
 */
export function KallaChip({ quote, label }: { quote: string; label?: string }) {
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
      {open && <SourceQuote quote={quote} />}
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
