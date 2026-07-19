import Link from "next/link";
import type { PipelineItem } from "@/lib/types";

const BORDER_COLOR: Record<PipelineItem["urgency"], string> = {
  urgent: "var(--urgency-urgent)",
  soon: "var(--urgency-soon)",
  later: "var(--urgency-later)",
};

const DAYS_LABEL_COLOR: Record<PipelineItem["urgency"], string> = {
  urgent: "var(--urgency-urgent)",
  soon: "var(--urgency-soon)",
  later: "#6b7280",
};

function formatSourceMeta(item: PipelineItem): string {
  if (item.source === "upload") return "Egen upload";
  if (item.relevanceScore !== null) return `TED · Score ${item.relevanceScore}`;
  return "TED";
}

export function PipelineRow({ item }: { item: PipelineItem }) {
  const href = item.analysisId ? `/analysis/${item.analysisId}` : "#";
  const weight = item.urgency === "urgent" ? 600 : 400;

  return (
    <Link
      href={href}
      className="block bg-paper rounded-r mb-1.5 px-3 py-2 hover:bg-paper-2 transition-colors"
      style={{ borderLeft: `3px solid ${BORDER_COLOR[item.urgency]}` }}
    >
      <div className="text-sm font-medium text-ink truncate">{item.title}</div>
      <div className="flex justify-between items-baseline mt-0.5">
        <span className="text-xs text-ink-soft">{formatSourceMeta(item)}</span>
        <span
          className="text-xs"
          style={{ color: DAYS_LABEL_COLOR[item.urgency], fontWeight: weight }}
        >
          {item.daysLeft === null
            ? "deadline saknas"
            : item.daysLeft === 0
              ? "Idag"
              : `${item.daysLeft}d kvar`}
        </span>
      </div>
    </Link>
  );
}
