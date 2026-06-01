import Link from "next/link";
import type { BidSummary } from "@/lib/types";

const BORDER_BY_OUTCOME: Record<string, string> = {
  awaiting: "var(--outcome-awaiting)",
  won: "var(--outcome-won)",
  lost: "var(--outcome-lost)",
  cancelled: "var(--outcome-cancelled)",
  "no-bid": "var(--outcome-cancelled)",
};

function outcomeLabel(b: BidSummary): string {
  if (b.outcome === null) return "Väntar beslut";
  if (b.outcome === "won") return "✓ Vunnen";
  if (b.outcome === "lost") return "✗ Förlorad";
  if (b.outcome === "cancelled") return "— Avbröts";
  return "— Inget anbud";
}

function daysSinceExport(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export function SubmittedRow({ bid }: { bid: BidSummary }) {
  const key = bid.outcome ?? "awaiting";
  const borderStyle =
    key === "cancelled" || key === "no-bid"
      ? `3px dashed ${BORDER_BY_OUTCOME[key]}`
      : `3px solid ${BORDER_BY_OUTCOME[key]}`;

  return (
    <Link
      href={`/bids/${bid.id}`}
      className="block bg-paper rounded-r mb-1.5 px-3 py-2 hover:bg-paper-2 transition-colors"
      style={{ borderLeft: borderStyle }}
    >
      <div className="text-sm font-medium text-ink truncate">{bid.title}</div>
      <div className="text-xs text-ink-soft mt-0.5">
        {outcomeLabel(bid)}
        {bid.outcome === null && ` · ${daysSinceExport(bid.exportedAt)}d sen`}
        {bid.outcome === "lost" && bid.competitorName && ` · mot ${bid.competitorName}`}
      </div>
    </Link>
  );
}
