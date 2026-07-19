"use client";

import type { TemplateDefect, TemplateMeasurement } from "@/lib/pptx-template/template-profile";

interface HealthReportProps {
  measurement: TemplateMeasurement;
  knownDefects: TemplateDefect[];
  onAccept: (sig: { slide: number; checkId: string; shape: string }) => void;
  saving: boolean;
  uiError: string | null;
}

/** Visas när measurement finns — resultatet av det lokala COM-mätpasset.
 *  Presentationell (mirror av SlotPanel/SummaryView): fetchen lever i
 *  wizarden, denna komponenten bara renderar props + anropar onAccept. */
export function HealthReport({ measurement, knownDefects, onAccept, saving, uiError }: HealthReportProps) {
  const open = knownDefects.filter((d) => d.status === "open");
  const warnings = Object.entries(measurement.slotWarnings).filter(([, w]) => w.length > 0);

  return (
    <div className="border border-rule rounded-lg p-6 max-w-2xl space-y-4">
      <div>
        <p className="text-sm font-medium">Hälsorapport — malldefekter</p>
        <p className="mt-1 text-sm text-ink-soft">
          Mätt {new Date(measurement.measuredAt).toLocaleString("sv-SE")}. Varje rad nedan är
          en defekt som redan finns i den tomma mallen — acceptera den, eller åtgärda boxen
          i mallen och kör mätningen igen.
        </p>
      </div>

      {knownDefects.length === 0 ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="text-sm font-semibold text-green-900">Klar för aktivering</p>
          <p className="mt-1 text-sm text-green-800">Inga malldefekter hittades vid mätningen.</p>
        </div>
      ) : (
        <>
          {open.length === 0 && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <p className="text-sm font-semibold text-green-900">Klar för aktivering</p>
              <p className="mt-1 text-sm text-green-800">
                Alla {knownDefects.length} malldefekter är accepterade.
              </p>
            </div>
          )}
          <table className="w-full text-sm border border-rule rounded-lg overflow-hidden">
            <thead className="bg-paper-2">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-ink-soft">Slide</th>
                <th className="text-left px-3 py-2 font-medium text-ink-soft">Ruta</th>
                <th className="text-left px-3 py-2 font-medium text-ink-soft">Kontroll</th>
                <th className="text-left px-3 py-2 font-medium text-ink-soft">Åtgärdsförslag</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {knownDefects.map((d) => {
                const accepted = d.status === "accepted";
                return (
                  <tr key={`${d.slide}|${d.checkId}|${d.shape}`} className={accepted ? "opacity-50" : undefined}>
                    <td className="px-3 py-2 text-ink-soft">#{d.slide}</td>
                    <td className="px-3 py-2 text-ink-soft">{d.shape}</td>
                    <td className="px-3 py-2 text-ink-soft">{d.checkId}</td>
                    <td className="px-3 py-2">{d.suggestion}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {accepted ? (
                        <span className="text-xs text-green-700">Accepterad ✓</span>
                      ) : (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => onAccept({ slide: d.slide, checkId: d.checkId, shape: d.shape })}
                          className="border border-rule py-1 px-2.5 rounded text-xs font-medium
                                     hover:border-accent disabled:opacity-50"
                        >
                          Acceptera
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {uiError && <p className="text-sm text-red-700">{uiError}</p>}

      {measurement.unresolved.length > 0 && (
        <p className="text-xs text-amber-800">
          {measurement.unresolved.length} token mättes aldrig (geometri-fallback):{" "}
          {measurement.unresolved.join(", ")}
        </p>
      )}

      {warnings.length > 0 && (
        <div className="text-xs text-ink-mute space-y-1">
          <p className="font-medium text-ink-soft">Kalibreringsvarningar (informativa, blockerar inte):</p>
          <ul className="space-y-0.5">
            {warnings.map(([token, w]) => (
              <li key={token}>
                {token}: {w.join("; ")}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
