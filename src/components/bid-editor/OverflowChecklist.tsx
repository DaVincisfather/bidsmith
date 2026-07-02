"use client";

import type { OverflowFlag } from "@/lib/pptx-template/budget-types";

interface OverflowChecklistProps {
  flags: OverflowFlag[];
  onJumpToField: (flag: OverflowFlag) => void;
  /** Skriv om ett flaggat fält ≤ tak via skrivmodellen. Utelämnas → ingen knapp. */
  onShorten?: (flag: OverflowFlag) => void;
  /** `${slide}-${fieldPath}` för fältet som just kortas (spinner + disabled). */
  shorteningKey?: string | null;
}

const flagKey = (f: OverflowFlag) => `${f.slide}-${f.fieldPath}`;

export function OverflowChecklist({
  flags,
  onJumpToField,
  onShorten,
  shorteningKey,
}: OverflowChecklistProps) {
  if (flags.length === 0) {
    return (
      <aside className="w-[280px] sticky top-4 self-start rounded-lg border border-green-200 bg-green-50 p-4">
        <h3 className="text-sm font-semibold text-green-900">Pre-export checklist</h3>
        <p className="mt-2 text-sm text-green-800">Inga overflows — redo för export.</p>
      </aside>
    );
  }

  const grouped = new Map<number, OverflowFlag[]>();
  for (const f of flags) {
    const list = grouped.get(f.slide) ?? [];
    list.push(f);
    grouped.set(f.slide, list);
  }
  const sortedSlides = [...grouped.keys()].sort((a, b) => a - b);

  return (
    <aside className="w-[280px] sticky top-4 self-start rounded-lg border border-amber-200 bg-amber-50 p-4">
      <h3 className="text-sm font-semibold text-amber-900">
        Pre-export checklist ({flags.length})
      </h3>
      <p className="mt-1 text-xs text-amber-800">
        Dessa fält är för långa. Klicka för att hoppa till och korrigera.
      </p>
      <div className="mt-3 space-y-3">
        {sortedSlides.map((slide) => (
          <div key={slide}>
            <div className="text-xs font-medium text-amber-900">Slide {slide}</div>
            <ul className="mt-1 space-y-1">
              {grouped.get(slide)!.map((flag) => {
                const busy = shorteningKey === flagKey(flag);
                return (
                  <li key={flagKey(flag)}>
                    <button
                      type="button"
                      onClick={() => onJumpToField(flag)}
                      className="w-full text-left text-xs text-amber-900 hover:bg-amber-100 rounded px-1.5 py-1"
                    >
                      {flag.fieldLabel}{" "}
                      <span className="text-amber-700">
                        ({flag.length}/{flag.budget})
                      </span>
                    </button>
                    {onShorten && (
                      <button
                        type="button"
                        onClick={() => onShorten(flag)}
                        disabled={busy}
                        className="mt-0.5 ml-1.5 text-[11px] text-accent-ink underline
                                   hover:no-underline disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {busy ? "Kortar…" : "Korta ner åt mig"}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </aside>
  );
}
