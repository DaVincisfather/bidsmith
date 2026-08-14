"use client";

import Link from "next/link";

// C-topbaren ur den godkända mockupen (notes/2026-08-14-editor-redesign-mockup.html):
// flödessteg som pills + dnr + dokumentnamn + status/sparad + åtgärdsknapparna,
// med anbudsmetadata-raden under. Ersätter FlowNav ENDAST på anbudssidan —
// analys-/go-no-go-sidorna behåller FlowNav (spec 2026-08-14).

export interface EditorTopbarProps {
  /** null för legacy-anbud utan kopplad analys — stegen döljs då. */
  analysisId: string | null;
  gonogoEnabled: boolean;
  /** Diarienummer ur analysen; null döljer fältet. */
  diaryNumber: string | null;
  docName: string;
  status: string;
  /** HH:MM för senast lyckade autosave; null före första sparningen. */
  savedAt: string | null;
  saving: boolean;
  downloadingMd: boolean;
  submitting: boolean;
  onExport: () => void;
  onSubmit: () => void;
  /** Nudge efter export (inlämningssplitten #116) — visas under metadata-raden. */
  showExportNudge: boolean;
  senderName: string | null;
  /** Sista anbudsdag (analysens deadline); null döljer fältet. */
  deadline: string | null;
  /** Anbudsdatum ur cover-sektionen; null döljer fältet. */
  bidDate: string | null;
}

const STATUS_META: Record<string, { label: string; dot: string }> = {
  draft: { label: "Utkast", dot: "bg-flag" },
  exported: { label: "Inlämnad", dot: "bg-emerald-600" },
  generating: { label: "Genereras", dot: "bg-ink-mute" },
  failed: { label: "Misslyckad", dot: "bg-red-600" },
};

export function EditorTopbar({
  analysisId,
  gonogoEnabled,
  diaryNumber,
  docName,
  status,
  savedAt,
  saving,
  downloadingMd,
  submitting,
  onExport,
  onSubmit,
  showExportNudge,
  senderName,
  deadline,
  bidDate,
}: EditorTopbarProps) {
  const statusMeta = STATUS_META[status] ?? { label: status, dot: "bg-ink-mute" };
  const isReady = status === "draft" || status === "exported";
  const metaFields = [
    { k: "Avsändare", v: senderName },
    { k: "Sista anbudsdag", v: deadline },
    { k: "Anbudsdatum", v: bidDate },
  ].filter((f): f is { k: string; v: string } => f.v != null && f.v !== "");

  return (
    <header className="border-b border-rule bg-white">
      <div className="flex items-center gap-3.5 px-5 py-2">
        {analysisId && (
          <nav aria-label="Anbudsflöde" className="flex gap-0.5 font-mono text-[10px]">
            <Link
              href={`/analysis/${analysisId}`}
              className="px-2.5 py-1 rounded-md text-ink-soft hover:text-ink transition-colors"
            >
              1 ANALYS
            </Link>
            {gonogoEnabled ? (
              <Link
                href={`/analysis/${analysisId}/go-no-go`}
                className="px-2.5 py-1 rounded-md text-ink-soft hover:text-ink transition-colors"
              >
                2 GO/NO-GO
              </Link>
            ) : (
              <span
                aria-disabled="true"
                title="Lås teamet först"
                className="px-2.5 py-1 rounded-md text-ink-mute/60 cursor-not-allowed"
              >
                2 GO/NO-GO
              </span>
            )}
            <span aria-current="step" className="px-2.5 py-1 rounded-md bg-accent text-white font-bold">
              3 ANBUD
            </span>
          </nav>
        )}
        {diaryNumber && <span className="font-mono text-[11px] text-ink-mute">{diaryNumber}</span>}
        <span className="text-sm font-semibold truncate">{docName}</span>
        <div className="flex-1" />
        <span aria-hidden className={`h-2 w-2 rounded-full ${statusMeta.dot}`} />
        <span role="status" className="font-mono text-[10px] uppercase tracking-wider text-ink-soft whitespace-nowrap">
          {statusMeta.label}
          {saving ? " · Sparar..." : savedAt ? ` · Sparad ${savedAt}` : ""}
        </span>
        {isReady && (
          <>
            {status === "draft" && (
              <button
                onClick={onSubmit}
                disabled={submitting}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-rule bg-white
                           hover:border-accent hover:text-accent disabled:opacity-40
                           disabled:cursor-not-allowed transition-colors whitespace-nowrap"
              >
                {submitting ? "Markerar..." : "Markera som inlämnad"}
              </button>
            )}
            <button
              onClick={onExport}
              disabled={downloadingMd}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-ink text-white border border-ink
                         hover:bg-accent-ink hover:border-accent-ink disabled:opacity-40
                         disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              {downloadingMd ? "Exporterar..." : "Exportera (MD)"}
            </button>
          </>
        )}
      </div>
      {metaFields.length > 0 && (
        <div className="flex gap-6 px-5 py-1.5 border-t border-rule bg-paper font-mono text-[10px] text-ink-mute">
          {metaFields.map((f) => (
            <span key={f.k}>
              <span className="uppercase tracking-wider mr-1.5">{f.k}</span>
              <span className="text-ink-soft font-medium">{f.v}</span>
            </span>
          ))}
        </div>
      )}
      {showExportNudge && (
        <p role="status" className="px-5 py-1.5 border-t border-rule text-xs text-ink-mute">
          Filen är nedladdad. När anbudet har lämnats in — markera det som inlämnat så följs utfallet upp.
        </p>
      )}
    </header>
  );
}
