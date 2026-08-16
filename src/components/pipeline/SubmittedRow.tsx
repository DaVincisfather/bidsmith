import Link from "next/link";
import type { RailBidEntry } from "@/lib/pipeline";
import type { LossReason } from "@/lib/types";

function daysSinceExport(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
}

const LOSS_REASON_LABEL: Record<LossReason, string> = {
  pris: "Pris",
  erfarenhet: "Erfarenhet",
  team: "Team",
  kvalitet: "Kvalitet",
  relation: "Relation",
  annat: "Annat",
};

const OUTCOME_CHIP: Record<string, { label: string; cls: string }> = {
  won: { label: "✓ Vunnen", cls: "border-emerald-600 text-emerald-700" },
  lost: { label: "✗ Förlorad", cls: "border-red-600 text-red-600" },
  cancelled: { label: "— Avbröts", cls: "border-rule text-ink-mute" },
  "no-bid": { label: "— Inget anbud", cls: "border-rule text-ink-mute" },
};

function VersionsBadge({ count }: { count: number }) {
  if (count <= 1) return null;
  return (
    <span className="rounded-full border border-rule bg-paper-2 px-1.5 py-px text-[8px]">
      {count} versioner
    </span>
  );
}

// Railens anbudskort i chips-varianten (Stefans val 2026-08-16,
// beautifului.dev filter table-mönstret): en gemensam kortform där
// statuschipen bär tillståndet — väntar beslut respektive avgjord.
export function SubmittedRow({ entry }: { entry: RailBidEntry }) {
  const { bid, versionsCount } = entry;
  return (
    <Link
      href={`/bids/${bid.id}`}
      className="mb-2 block rounded-xl border border-rule bg-white px-3 py-2.5 shadow-sm
                 transition-colors hover:border-ink-mute"
    >
      <div className="line-clamp-2 text-[13px] font-medium leading-snug text-ink">{bid.title}</div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 font-mono text-[9px] text-ink-mute">
        <span className="rounded-full border border-[color:var(--outcome-awaiting)] px-1.5 py-px text-[8px] uppercase tracking-wider text-slate-500">
          Väntar beslut
        </span>
        <span>
          Inlämnat {formatShortDate(bid.exportedAt)} · {daysSinceExport(bid.exportedAt)} d sen
        </span>
        <VersionsBadge count={versionsCount} />
      </div>
    </Link>
  );
}

export function DecidedRow({ entry }: { entry: RailBidEntry }) {
  const { bid, versionsCount } = entry;
  const chip = OUTCOME_CHIP[bid.outcome ?? "cancelled"];
  const metaParts = [
    bid.outcome === "lost" && bid.competitorName ? `mot ${bid.competitorName}` : null,
    bid.outcome === "lost" && bid.lossReason ? LOSS_REASON_LABEL[bid.lossReason] : null,
    bid.outcomeLoggedAt ? `Loggat ${formatShortDate(bid.outcomeLoggedAt)}` : null,
  ].filter(Boolean);
  return (
    <Link
      href={`/bids/${bid.id}`}
      className="mb-2 block rounded-xl border border-rule bg-white px-3 py-2.5 shadow-sm
                 transition-colors hover:border-ink-mute"
    >
      <div className="line-clamp-2 text-[13px] font-medium leading-snug text-ink">{bid.title}</div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 font-mono text-[9px] text-ink-mute">
        <span className={`rounded-full border px-1.5 py-px text-[8px] uppercase tracking-wider ${chip.cls}`}>
          {chip.label}
        </span>
        {metaParts.length > 0 && <span>{metaParts.join(" · ")}</span>}
        <VersionsBadge count={versionsCount} />
      </div>
    </Link>
  );
}
