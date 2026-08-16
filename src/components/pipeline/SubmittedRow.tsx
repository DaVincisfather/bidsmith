import Link from "next/link";
import type { AwaitingEntry } from "@/lib/pipeline";

function daysSinceExport(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function formatExportDate(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
}

// Väntar-beslut-kortet (pipeline-UX-passet 2026-08-16): railen visar numera
// bara ODÖMDA anbud som kort — avgjorda bor i arkivsektionen. En rad per
// analys; "senaste av N"-badgen bär dubblettkollapsen (legacy-rader från före
// en-analys-ett-anbud-regeln #103 finns kvar i datat och arkivet).
export function SubmittedRow({ entry }: { entry: AwaitingEntry }) {
  const { bid, versionsCount } = entry;
  return (
    <Link
      href={`/bids/${bid.id}`}
      className="mb-2 block rounded-xl border border-rule bg-white px-3 py-2.5 shadow-sm
                 transition-colors hover:border-ink-mute"
      style={{ borderLeft: "3px solid var(--outcome-awaiting)" }}
    >
      <div className="line-clamp-2 text-[13px] font-medium leading-snug text-ink">{bid.title}</div>
      <div className="mt-1.5 flex items-center gap-2 font-mono text-[9px] text-ink-mute">
        <span>
          Inlämnat {formatExportDate(bid.exportedAt)} · {daysSinceExport(bid.exportedAt)} d sen
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
