"use client";

import { RequirementRow, StyleGuide } from "@/lib/types";

interface MatrixRendererProps {
  title: string;
  rows: RequirementRow[];
  consultantNames: Record<string, string>;
  style: StyleGuide;
}

export function MatrixRenderer({ title, rows, consultantNames, style }: MatrixRendererProps) {
  const c = style.colors;
  const consultantIds = Object.keys(consultantNames);

  const priorityLabel: Record<string, string> = {
    must: "Skall",
    should: "Bör",
    "nice-to-have": "Meriterande",
  };

  const priorityColor: Record<string, string> = {
    must: c.primary,
    should: c.secondary,
    "nice-to-have": c.muted,
  };

  return (
    <div className="py-2 overflow-x-auto">
      <h3 className="text-xl font-bold mb-4" style={{ color: c.primary }}>{title}</h3>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="text-left py-2 px-3 font-semibold text-gray-500 border-b-2" style={{ borderColor: c.primary }}>
              Krav
            </th>
            <th className="text-center py-2 px-3 font-semibold text-gray-500 border-b-2 w-24" style={{ borderColor: c.primary }}>
              Prioritet
            </th>
            {consultantIds.map((id) => (
              <th
                key={id}
                className="text-center py-2 px-3 font-semibold border-b-2 w-28"
                style={{ color: c.primary, borderColor: c.primary }}
              >
                {consultantNames[id]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? "bg-gray-50/50" : ""}>
              <td className="py-2 px-3 text-gray-700">{row.requirement}</td>
              <td className="py-2 px-3 text-center">
                <span
                  className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: priorityColor[row.priority] }}
                >
                  {priorityLabel[row.priority] ?? row.priority}
                </span>
              </td>
              {consultantIds.map((id) => (
                <td key={id} className="py-2 px-3 text-center text-lg">
                  {row.coverage[id] ? (
                    <span style={{ color: c.accent }}>&#10003;</span>
                  ) : (
                    <span className="text-gray-300">&mdash;</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
