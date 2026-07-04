"use client";

import { hasEvidence, hasAnyEvidence } from "@/lib/evidence-badge";

// Svenska citationstecken (U+201D i båda ändar) — omsluter det ordagranna citatet.
const Q = "”";

/**
 * Rent citatblock (inget sammanhang, ingen fetch). Behålls som KÄLLVYNS fallback:
 * när source-view-hämtningen fallerar visar SourceViewer ändå det klickade citatet
 * ordagrant via denna komponent (och kalla-chip-testet lockar renderingen).
 * Inline-utfällning i chippen är borttagen — chippen öppnar nu källvyn i stället.
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
 * Källa-chip: liten pill som ÖPPNAR källvyn (slide-over) i stället för att fälla ut
 * inline. Klicket lyfts till ägaren via `onShowSource(quote)` — analysvyn resp.
 * konsultprofilen äger en SourceViewer-instans och landar användaren direkt i
 * källdokumentet med citatet markerat. <button> med unikt aria-label per chip
 * (annars blir alla "källa" oskiljbara i skärmläsarens elementlista, routine #59).
 */
export function KallaChip({
  quote,
  label,
  onShowSource,
}: {
  quote: string;
  label?: string;
  onShowSource: (quote: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onShowSource(quote)}
      aria-label={label ? `Visa källa: ${label}` : "Visa källa"}
      className="inline-flex items-center gap-0.5 align-middle rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent-ink transition hover:brightness-95"
    >
      källa <span aria-hidden="true">→</span>
    </button>
  );
}

/**
 * Amber pill för obelagda påståenden (evidens undefined/null efter vaktens reparation).
 * Inte klickbar — det finns inget citat att visa.
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

/**
 * Trust-receipt: aggregatrad överst i kravsektionen / konsultprofilen. Räknar hur
 * många påståenden som är ordagrant belagda i källan (mekaniskt, inte AI-bedömt).
 * Beräknas helt klient-sida ur posternas evidence-fält — ingen endpoint behövs.
 * Döljs av samma legacy-grind som badgarna (bär ingen post evidens → null), så gamla
 * analyser/profiler skrivna före evidens-featuren inte visar en missvisande "0 av N".
 */
export function TrustReceipt({
  items,
}: {
  items: ReadonlyArray<{ evidence?: string | null }>;
}) {
  if (!hasAnyEvidence(items)) return null;
  const total = items.length;
  const proven = items.filter((i) => hasEvidence(i.evidence)).length;
  const unproven = total - proven;
  return (
    <p className="text-xs text-ink-mute leading-relaxed mb-3">
      <span className="font-medium text-ink-soft">{proven}</span> av {total}{" "}
      påståenden ordagrant belagda i källdokumentet — mekaniskt verifierade, inte
      AI-bedömda
      {unproven > 0 && <span> · {unproven} obelagda</span>}
    </p>
  );
}
