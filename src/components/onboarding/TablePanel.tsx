"use client";

import { useState } from "react";
import type { DraftTable } from "@/lib/pptx-template/onboarding/draft";
import { TABLE_COLUMN_ROLES, type TableColumnRole } from "@/lib/pptx-template/template-profile";

const ROLE_LABELS: Record<TableColumnRole, string> = {
  krav: "Krav",
  uppfyllnad: "Uppfyllnad",
  referens: "Referens",
  status: "Status",
  ignorera: "Ignorera",
};

/** Hur många rader förhandsvisningen visar — räcker för att se rubrikrad +
 *  mallrad + ett par exempel utan att panelen växer okontrollerat. */
const PREVIEW_ROWS = 4;

interface TablePanelProps {
  table: DraftTable;
  onDecide: (input: { headerRows: number; templateRowIndex: number; columns: TableColumnRole[] }) => void;
  saving: boolean;
}

export function TablePanel({ table, onDecide, saving }: TablePanelProps) {
  // Samma icke-synk-init som SlotPanel: vald tabell byts via key-remount i
  // wizarden, så useState-initialvärdet räcker.
  const [headerRows, setHeaderRows] = useState(table.decision?.headerRows ?? 1);
  const [templateRowIndex, setTemplateRowIndex] = useState(
    table.decision?.templateRowIndex ?? Math.min(headerRows, Math.max(table.rows.length - 1, 0)),
  );
  const [columns, setColumns] = useState<TableColumnRole[]>(
    table.decision?.columns ?? table.gridColsEmu.map(() => "ignorera"),
  );

  function setColumn(colIndex: number, role: TableColumnRole) {
    setColumns((cols) => cols.map((c, i) => (i === colIndex ? role : c)));
  }

  return (
    <div className="space-y-4 border border-rule rounded-lg p-4 bg-paper-2">
      <div>
        <p className="text-xs uppercase tracking-wide text-ink-mute">
          Tabell {table.frameIndex + 1} — {table.gridColsEmu.length} kolumner · {table.rows.length} rader
        </p>
        {table.decision?.confirmed && (
          <p className="mt-1 text-xs text-accent">Bekräftad som kravmatris</p>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="text-xs border-collapse">
          <tbody>
            {table.rows.slice(0, PREVIEW_ROWS).map((row, r) => (
              <tr key={r}>
                {row.cellTexts.map((text, c) => (
                  <td
                    key={c}
                    className="border border-rule px-2 py-1 text-ink-soft whitespace-pre-wrap max-w-[10rem] align-top"
                  >
                    {text || "(tom)"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            htmlFor={`table-${table.frameIndex}-header-rows`}
            className="block text-sm font-medium text-ink-soft"
          >
            Antal rubrikrader
          </label>
          <input
            id={`table-${table.frameIndex}-header-rows`}
            type="number"
            min={0}
            max={table.rows.length}
            value={headerRows}
            onChange={(e) => setHeaderRows(Number(e.target.value))}
            className="mt-1 w-full border border-rule rounded px-3 py-1.5 text-sm bg-paper"
          />
        </div>
        <div>
          <label
            htmlFor={`table-${table.frameIndex}-template-row`}
            className="block text-sm font-medium text-ink-soft"
          >
            Mallrad (klonas per krav)
          </label>
          <select
            id={`table-${table.frameIndex}-template-row`}
            value={templateRowIndex}
            onChange={(e) => setTemplateRowIndex(Number(e.target.value))}
            className="mt-1 w-full border border-rule rounded px-3 py-1.5 text-sm bg-paper"
          >
            {table.rows.map((row, i) => (
              <option key={i} value={i}>
                Rad {i + 1} — {row.cellTexts.join(" · ").slice(0, 40) || "(tom)"}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-ink-soft">Kolumnroller</p>
        <div className="grid grid-cols-2 gap-2">
          {columns.map((role, i) => (
            <div key={i}>
              <label htmlFor={`table-${table.frameIndex}-col-${i}`} className="block text-xs text-ink-mute">
                Kolumn {i + 1}
              </label>
              <select
                id={`table-${table.frameIndex}-col-${i}`}
                value={role}
                onChange={(e) => setColumn(i, e.target.value as TableColumnRole)}
                className="mt-1 w-full border border-rule rounded px-2 py-1 text-sm bg-paper"
              >
                {TABLE_COLUMN_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-ink-mute">
        Kravet för bekräftelse: exakt en Krav-kolumn och minst en Uppfyllnad- eller
        Status-kolumn. Mallraden klonas en gång per ska-krav vid generering.
      </p>

      <button
        type="button"
        disabled={saving}
        onClick={() => onDecide({ headerRows, templateRowIndex, columns })}
        className="w-full bg-ink text-white py-2 rounded font-medium text-sm
                   hover:bg-accent-ink disabled:opacity-50"
      >
        Bekräfta
      </button>
    </div>
  );
}
