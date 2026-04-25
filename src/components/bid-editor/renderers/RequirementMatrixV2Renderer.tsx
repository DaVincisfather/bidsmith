"use client";
import { Fragment, useState } from "react";
import type { BidSectionContent, StyleGuide } from "@/lib/types";

type MatrixContent = Extract<BidSectionContent, { format: "requirement-matrix-v2" }>;

export function RequirementMatrixV2Renderer({
  title, content, style,
}: { title: string; content: MatrixContent; style: StyleGuide }) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const toggle = (i: number) => setExpanded((p) => ({ ...p, [i]: !p[i] }));

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
                <td className="py-2">{r.requirement}</td>
                <td>{r.hurUppfylls}</td>
                <td>{r.referens}</td>
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
                          <span className="font-medium">{c.consultantName}:</span>{" "}
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
                          </span>{" "}
                          — <span className="text-gray-600">{c.evidence}</span>
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
