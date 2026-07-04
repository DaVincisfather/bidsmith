"use client";

import { useState } from "react";
import { formatUsd, type CostByLabel } from "@/lib/stats";
import { aggregateBuckets } from "@/lib/cost-buckets";

/**
 * Primär kostnadsvy: tre begripliga buckets (analys / konsultmatchning /
 * anbudsgenerering + Övrigt) istället för den långa per-etikett-listan
 * (produktägar-feedback 2026-07-03). Detaljlistan finns kvar men bakom en
 * kollapsad "Visa detaljer"-disclosure — samma <button aria-expanded>-mönster
 * som källa-chippen, för tangentbord/skärmläsare.
 */
export function CostBuckets({ costByLabel }: { costByLabel: CostByLabel[] }) {
  const [showDetails, setShowDetails] = useState(false);

  const buckets = aggregateBuckets(costByLabel).filter((b) => b.count > 0);
  const grandCost = buckets.reduce((s, b) => s + b.costUsd, 0);
  const grandCount = buckets.reduce((s, b) => s + b.count, 0);

  if (costByLabel.length === 0) {
    return <p className="py-4 text-sm text-ink-mute">Ingen data ännu.</p>;
  }

  return (
    <div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-rule text-left text-ink-mute">
            <th className="py-2 font-medium">Kategori</th>
            <th className="py-2 text-right font-medium">Anrop</th>
            <th className="py-2 text-right font-medium">Kostnad</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.bucket} className="border-b border-rule">
              <td className="py-2">{b.bucket}</td>
              <td className="py-2 text-right text-ink-mute">{b.count}</td>
              <td className="py-2 text-right">{formatUsd(b.costUsd)}</td>
            </tr>
          ))}
          <tr className="border-b border-rule font-medium">
            <td className="py-2">Totalt</td>
            <td className="py-2 text-right text-ink-mute">{grandCount}</td>
            <td className="py-2 text-right">{formatUsd(grandCost)}</td>
          </tr>
        </tbody>
      </table>

      <button
        type="button"
        onClick={() => setShowDetails((v) => !v)}
        aria-expanded={showDetails}
        className="mt-3 inline-flex items-center gap-0.5 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent-ink transition hover:brightness-95"
      >
        Visa detaljer <span aria-hidden="true">{showDetails ? "▾" : "▸"}</span>
      </button>

      {showDetails && (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b border-rule text-left text-ink-mute">
              <th className="py-2 font-medium">Typ</th>
              <th className="py-2 text-right font-medium">Anrop</th>
              <th className="py-2 text-right font-medium">Kostnad</th>
            </tr>
          </thead>
          <tbody>
            {costByLabel.map((c) => (
              <tr key={c.label} className="border-b border-rule">
                <td className="py-2">{c.label}</td>
                <td className="py-2 text-right text-ink-mute">{c.count}</td>
                <td className="py-2 text-right">{formatUsd(c.costUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
