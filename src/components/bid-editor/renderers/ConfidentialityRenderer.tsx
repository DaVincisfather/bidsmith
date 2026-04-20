"use client";
import type { BidSectionContent, StyleGuide } from "@/lib/types";

type ConfContent = Extract<BidSectionContent, { format: "confidentiality" }>;

export function ConfidentialityRenderer({
  title, content, style,
}: { title: string; content: ConfContent; style: StyleGuide }) {
  return (
    <section className="p-6 text-sm">
      <h2 className="text-xl font-semibold mb-4" style={{ color: style.colors.primary }}>{title}</h2>
      <p className="mb-3"><span className="font-medium">OSL-referens:</span> {content.oslReference || "—"}</p>
      {content.secrecyRows.length === 0 ? (
        <p className="text-gray-500 italic">Inga sekretessuppgifter identifierade</p>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr className="border-b">
              <th className="py-2">Referens</th>
              <th>Omfattning</th>
              <th>Motivering</th>
            </tr>
          </thead>
          <tbody>
            {content.secrecyRows.map((row, i) => (
              <tr key={i} className="border-b">
                <td className="py-2">{row.reference}</td>
                <td>{row.scope}</td>
                <td>{row.justification}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
