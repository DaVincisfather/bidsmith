"use client";
import type { BidSectionContent, StyleGuide } from "@/lib/types";
import { EditableText } from "../EditableText";

type TeamPricingContent = Extract<BidSectionContent, { format: "team-pricing" }>;
type Member = TeamPricingContent["members"][number];

export function TeamPricingRenderer({
  title,
  content,
  style,
  onTimprisChange,
  onMemberFieldChange,
}: {
  title: string;
  content: TeamPricingContent;
  style: StyleGuide;
  onTimprisChange?: (memberIndex: number, timpris: number | null) => void;
  onMemberFieldChange?: (memberIndex: number, field: "name" | "role" | "omfattningPct" | "timmar", value: string) => void;
}) {
  const editableText = !!onMemberFieldChange;

  const handleTimprisChange = (i: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.trim();
    const next = raw === "" ? null : Number(raw);
    if (next !== null && Number.isNaN(next)) return;
    onTimprisChange?.(i, next);
  };

  const handleNumberFieldChange = (i: number, field: "omfattningPct" | "timmar") => (value: string) => {
    if (!onMemberFieldChange) return;
    onMemberFieldChange(i, field, value);
  };

  return (
    <section className="p-6 text-sm">
      <h2 className="text-xl font-semibold mb-4" style={{ color: style.colors.primary }}>{title}</h2>
      <table className="w-full text-left">
        <thead>
          <tr className="border-b">
            <th className="py-2">Konsult</th>
            <th>Roll</th>
            <th>Omf %</th>
            <th>Timmar</th>
            <th>Timpris (SEK)</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {content.members.map((m: Member, i: number) => (
            <tr key={i} className="border-b">
              <td className="py-2 pr-2">
                {editableText ? (
                  <EditableText value={m.name} onChange={(v) => onMemberFieldChange!(i, "name", v)} as="span" />
                ) : m.name}
              </td>
              <td className="pr-2">
                {editableText ? (
                  <EditableText value={m.role} onChange={(v) => onMemberFieldChange!(i, "role", v)} as="span" />
                ) : m.role}
              </td>
              <td className="pr-2">
                {editableText ? (
                  <span>
                    <EditableText value={String(m.omfattningPct)} onChange={handleNumberFieldChange(i, "omfattningPct")} as="span" />
                    <span>%</span>
                  </span>
                ) : `${m.omfattningPct}%`}
              </td>
              <td className="pr-2">
                {editableText ? (
                  <EditableText value={String(m.timmar)} onChange={handleNumberFieldChange(i, "timmar")} as="span" />
                ) : m.timmar}
              </td>
              <td>
                <input
                  type="number"
                  min={0}
                  step={10}
                  value={m.timpris ?? ""}
                  placeholder="—"
                  onChange={handleTimprisChange(i)}
                  className={`w-24 border rounded px-2 py-1 ${m.timpris === null ? "border-amber-400 bg-amber-50" : ""}`}
                />
              </td>
              <td>{m.total === null ? "—" : m.total.toLocaleString("sv-SE")}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3}></td>
            <td className="pt-2 font-medium">{content.summary?.totalTimmar ?? 0}</td>
            <td></td>
            <td className="pt-2 font-medium">
              {content.summary?.totalPris === null || content.summary?.totalPris === undefined
                ? "—"
                : content.summary.totalPris.toLocaleString("sv-SE")}
            </td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}
