import Link from "next/link";
import type { RailBidEntry } from "@/lib/pipeline";

function daysSinceExport(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
}

// Väntar-beslut-kortet i flikvarianten (Stefans val 2026-08-16, anti-slop-
// justeringen): rent kort utan statuschip och utan den grå kantlisten —
// sektionsrubriken bär tillståndet. "senaste av N"-badgen bär dubblett-
// kollapsen (superseded-semantiken i splitDashboard).
export function SubmittedRow({ entry }: { entry: RailBidEntry }) {
  const { bid, versionsCount } = entry;
  return (
    <Link
      href={`/bids/${bid.id}`}
      className="mb-2 block rounded-xl border border-rule bg-white px-3 py-2.5 shadow-sm
                 transition-colors hover:border-ink-mute"
    >
      <div className="line-clamp-2 text-[13px] font-medium leading-snug text-ink">{bid.title}</div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-[9px] text-ink-mute">
        <span>
          Inlämnat {formatShortDate(bid.exportedAt)} · {daysSinceExport(bid.exportedAt)} d sen
        </span>
        {versionsCount > 1 && (
          <span className="rounded-full border border-rule bg-paper-2 px-1.5 py-px text-[8px]">
            senaste av {versionsCount}
          </span>
        )}
      </div>
    </Link>
  );
}

const ARCHIVE_GLYPH: Record<string, { char: string; cls: string }> = {
  won: { char: "✓", cls: "text-emerald-600" },
  lost: { char: "✗", cls: "text-red-600" },
  cancelled: { char: "—", cls: "text-ink-mute" },
  "no-bid": { char: "—", cls: "text-ink-mute" },
};

// Arkivrad: tyst textrad — inte kortform. Avgjort är ett annat mentalt läge
// än pågående och ska inte se ut som arbete (Stefans anti-slop-kritik).
export function ArchiveRow({ entry }: { entry: RailBidEntry }) {
  const { bid } = entry;
  const glyph = ARCHIVE_GLYPH[bid.outcome ?? "cancelled"];
  return (
    <Link
      href={`/bids/${bid.id}`}
      className="flex items-baseline gap-2 px-0.5 py-1 text-[11.5px] text-ink-mute transition-colors hover:text-ink-soft"
    >
      <span aria-hidden className={`w-2.5 shrink-0 font-mono text-[9px] ${glyph.cls}`}>
        {glyph.char}
      </span>
      <span className="truncate">{bid.title}</span>
      {bid.outcomeLoggedAt && (
        <span className="ml-auto shrink-0 font-mono text-[8px]">
          {formatShortDate(bid.outcomeLoggedAt)}
        </span>
      )}
    </Link>
  );
}
