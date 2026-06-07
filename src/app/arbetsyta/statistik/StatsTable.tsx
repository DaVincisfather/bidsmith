"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { formatUsd, formatPct, type UserStats } from "@/lib/stats";

const STATUS_LABEL: Record<string, string> = {
  draft: "Utkast",
  exported: "Exporterat",
};

export function StatsTable({ perUser }: { perUser: UserStats[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (perUser.length === 0) {
    return <p className="py-4 text-sm text-ink-mute">Ingen data ännu.</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-rule text-left text-ink-mute">
          <th className="py-2 font-medium">Användare</th>
          <th className="py-2 text-right font-medium">Kostnad</th>
          <th className="py-2 text-right font-medium">Anbud</th>
          <th className="py-2 text-right font-medium">W / L</th>
          <th className="py-2 text-right font-medium">Win-rate</th>
          <th className="py-2 text-right font-medium">Pågående</th>
        </tr>
      </thead>
      <tbody>
        {perUser.map((u) => {
          const hasPending = u.pending.length > 0;
          const isOpen = expanded.has(u.userId);
          return (
            <Fragment key={u.userId}>
              <tr
                className={`border-b border-rule ${hasPending ? "cursor-pointer" : ""}`}
                onClick={hasPending ? () => toggle(u.userId) : undefined}
              >
                <td className="py-2">{u.email}</td>
                <td className="py-2 text-right">{formatUsd(u.costUsd)}</td>
                <td className="py-2 text-right">{u.bidsSubmitted}</td>
                <td className="py-2 text-right">
                  {u.wins} / {u.losses}
                </td>
                <td className="py-2 text-right">{formatPct(u.winRate)}</td>
                <td className="py-2 text-right">
                  {hasPending ? (
                    <span className="text-ink">
                      {u.pending.length} {isOpen ? "▾" : "▸"}
                    </span>
                  ) : (
                    <span className="text-ink-mute">0</span>
                  )}
                </td>
              </tr>
              {isOpen && hasPending && (
                <tr className="border-b border-rule bg-paper-2">
                  <td colSpan={6} className="px-2 py-3">
                    <div className="flex flex-wrap gap-2">
                      {u.pending.map((p) => (
                        <Link
                          key={p.id}
                          href={`/bids/${p.id}`}
                          className="inline-flex items-center gap-2 rounded-full border border-rule bg-paper px-3 py-1 text-xs hover:border-ink"
                        >
                          <span className="text-ink">{p.title}</span>
                          <span className="rounded bg-paper-2 px-1.5 py-0.5 text-[10px] text-ink-mute">
                            {STATUS_LABEL[p.status] ?? p.status}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
