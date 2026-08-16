import Link from "next/link";
import type { PipelineItem } from "@/lib/types";

const DOT_COLOR: Record<PipelineItem["urgency"], string> = {
  urgent: "var(--urgency-urgent)",
  soon: "var(--urgency-soon)",
  later: "var(--urgency-later)",
};

function formatSourceMeta(item: PipelineItem): string {
  if (item.source === "upload") return "Egen upload";
  if (item.relevanceScore !== null) return `TED · Score ${item.relevanceScore}`;
  return "TED";
}

function deadlineLabel(item: PipelineItem): string {
  if (item.daysLeft === null) return "deadline saknas";
  if (item.daysLeft === 0) return "Idag";
  return `${item.daysLeft} d kvar`;
}

// Aktiva-RFP-kortet i railen (pipeline-UX-passet 2026-08-16): kort-DNA:t från
// editor-omdesignen, urgency som punkt i mono-metaraden i stället för
// vänsterkantfärg.
export function PipelineRow({ item }: { item: PipelineItem }) {
  const href = item.analysisId ? `/analysis/${item.analysisId}` : "#";
  return (
    <Link
      href={href}
      className="mb-2 block rounded-xl border border-rule bg-white px-3 py-2.5 shadow-sm
                 transition-colors hover:border-ink-mute"
    >
      <div className="line-clamp-2 text-[13px] font-medium leading-snug text-ink">{item.title}</div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 font-mono text-[9px] text-ink-mute">
        <span
          aria-hidden
          className="h-[7px] w-[7px] shrink-0 rounded-full"
          style={{ background: DOT_COLOR[item.urgency] }}
        />
        <span className={item.urgency === "urgent" ? "font-bold text-ink-soft" : ""}>
          {deadlineLabel(item)}
        </span>
        <span>· {formatSourceMeta(item)}</span>
      </div>
    </Link>
  );
}
