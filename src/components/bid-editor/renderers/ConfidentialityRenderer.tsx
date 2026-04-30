"use client";
import type { BidSectionContent, StyleGuide } from "@/lib/types";
import { EditableText } from "../EditableText";

type ConfContent = Extract<BidSectionContent, { format: "confidentiality" }>;

export function ConfidentialityRenderer({
  title,
  content,
  style,
  onChange,
}: {
  title: string;
  content: ConfContent;
  style: StyleGuide;
  onChange?: (next: ConfContent) => void;
}) {
  const editable = !!onChange;

  function updateRow(i: number, patch: Partial<ConfContent["secrecyRows"][number]>) {
    if (!onChange) return;
    onChange({
      ...content,
      secrecyRows: content.secrecyRows.map((r, j) => j === i ? { ...r, ...patch } : r),
    });
  }

  return (
    <section className="p-6 text-sm">
      <h2 className="text-xl font-semibold mb-4" style={{ color: style.colors.primary }}>{title}</h2>
      <p className="mb-3">
        <span className="font-medium">OSL-referens: </span>
        {editable ? (
          <EditableText
            value={content.oslReference}
            onChange={(v) => onChange!({ ...content, oslReference: v })}
            as="span"
            placeholder="—"
          />
        ) : (content.oslReference || "—")}
      </p>
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
              <tr key={i} className="border-b align-top">
                <td className="py-2 pr-2">
                  {editable ? (
                    <EditableText value={row.reference} onChange={(v) => updateRow(i, { reference: v })} as="span" />
                  ) : row.reference}
                </td>
                <td className="pr-2">
                  {editable ? (
                    <EditableText value={row.scope} onChange={(v) => updateRow(i, { scope: v })} as="span" />
                  ) : row.scope}
                </td>
                <td>
                  {editable ? (
                    <EditableText value={row.justification} onChange={(v) => updateRow(i, { justification: v })} as="span" />
                  ) : row.justification}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
