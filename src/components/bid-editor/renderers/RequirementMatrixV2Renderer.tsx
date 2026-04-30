"use client";
import { Fragment, useState } from "react";
import type { BidSectionContent, StyleGuide } from "@/lib/types";
import { EditableText } from "../EditableText";

type MatrixContent = Extract<BidSectionContent, { format: "requirement-matrix-v2" }>;

export function RequirementMatrixV2Renderer({
  title,
  content,
  style,
  onChange,
}: {
  title: string;
  content: MatrixContent;
  style: StyleGuide;
  onChange?: (next: MatrixContent) => void;
}) {
  const editable = !!onChange;
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const toggle = (i: number) => setExpanded((p) => ({ ...p, [i]: !p[i] }));

  function updateRow(i: number, patch: Partial<MatrixContent["rows"][number]>) {
    if (!onChange) return;
    onChange({
      ...content,
      rows: content.rows.map((r, j) => j === i ? { ...r, ...patch } : r),
    });
  }

  function updateCoverage(rowIdx: number, covIdx: number, patch: Partial<MatrixContent["rows"][number]["coverage"][number]>) {
    if (!onChange) return;
    onChange({
      ...content,
      rows: content.rows.map((r, j) => j === rowIdx
        ? { ...r, coverage: r.coverage.map((c, k) => k === covIdx ? { ...c, ...patch } : c) }
        : r,
      ),
    });
  }

  return (
    <section className="p-6 text-sm">
      <h2 className="text-xl font-semibold mb-4" style={{ color: style.colors.primary }}>{title}</h2>
      <table className="w-full text-left">
        <thead>
          <tr className="border-b">
            <th className="py-2">Krav</th>
            <th>Hur uppfylls</th>
            <th>Referens</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {content.rows.map((r, i) => (
            <Fragment key={i}>
              <tr className="border-b align-top">
                <td className="py-2 pr-2">
                  {editable ? (
                    <EditableText value={r.requirement} onChange={(v) => updateRow(i, { requirement: v })} as="span" />
                  ) : r.requirement}
                </td>
                <td className="pr-2">
                  {editable ? (
                    <EditableText value={r.hurUppfylls} onChange={(v) => updateRow(i, { hurUppfylls: v })} as="span" />
                  ) : r.hurUppfylls}
                </td>
                <td className="pr-2">
                  {editable ? (
                    <EditableText value={r.referens} onChange={(v) => updateRow(i, { referens: v })} as="span" />
                  ) : r.referens}
                </td>
                <td>
                  <button
                    type="button"
                    onClick={() => toggle(i)}
                    className="text-blue-600 hover:underline"
                  >
                    {expanded[i] ? "Dölj coverage" : "Visa coverage"}
                  </button>
                </td>
              </tr>
              {expanded[i] && (
                <tr className="bg-gray-50">
                  <td colSpan={4} className="py-2 px-4">
                    <ul className="space-y-1">
                      {r.coverage.map((c, j) => (
                        <li key={j}>
                          <span className="font-medium">
                            {editable ? (
                              <EditableText value={c.consultantName} onChange={(v) => updateCoverage(i, j, { consultantName: v })} as="span" />
                            ) : c.consultantName}
                          </span>
                          {": "}
                          <span
                            className={
                              c.status === "JA"
                                ? "text-green-700"
                                : c.status === "DELVIS"
                                ? "text-amber-700"
                                : "text-red-700"
                            }
                          >
                            {c.status}
                          </span>
                          {" — "}
                          <span className="text-gray-600">
                            {editable ? (
                              <EditableText value={c.evidence} onChange={(v) => updateCoverage(i, j, { evidence: v })} as="span" />
                            ) : c.evidence}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </section>
  );
}
