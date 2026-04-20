"use client";
import type { BidSectionContent, StyleGuide } from "@/lib/types";

type TeamPricingContent = Extract<BidSectionContent, { format: "team-pricing" }>;

export function TeamPricingRenderer({
  title,
  content,
  style,
  onTimprisChange,
}: {
  title: string;
  content: TeamPricingContent;
  style: StyleGuide;
  onTimprisChange?: (memberIndex: number, timpris: number | null) => void;
}) {
  const handleChange = (i: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.trim();
    const next = raw === "" ? null : Number(raw);
    if (next !== null && Number.isNaN(next)) return;
    onTimprisChange?.(i, next);
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
          {content.members.map((m, i) => (
            <tr key={i} className="border-b">
              <td className="py-2">{m.name}</td>
              <td>{m.role}</td>
              <td>{m.omfattningPct}%</td>
              <td>{m.timmar}</td>
              <td>
                <input
                  type="number"
                  min={0}
                  step={10}
                  value={m.timpris ?? ""}
                  placeholder="—"
                  onChange={handleChange(i)}
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
