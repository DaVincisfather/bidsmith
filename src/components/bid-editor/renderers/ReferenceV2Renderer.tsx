"use client";
import type { BidSectionContent, StyleGuide } from "@/lib/types";

type ReferenceContent = Extract<BidSectionContent, { format: "reference-v2" }>;

export function ReferenceV2Renderer({
  title, content, style,
}: { title: string; content: ReferenceContent; style: StyleGuide }) {
  return (
    <section className="p-6 text-sm">
      <h2 className="text-xl font-semibold mb-4" style={{ color: style.colors.primary }}>{title}</h2>
      <div className="space-y-6">
        {content.references.map((r, i) => (
          <div key={i} className="border-l-4 pl-4" style={{ borderColor: style.colors.accent }}>
            <p className="font-medium">{r.clientName} — {r.contextLine}</p>
            <p className="text-gray-600">{r.organisation} · {r.startDate} – {r.endDate}</p>
            <p className="mt-2">Scope: {r.scope}</p>
            <p>Roll och leverans: {r.roleAndDelivery}</p>
            <p>Resultat: {r.result}</p>
            <p className="text-xs text-gray-500 mt-1">Kontakt: {r.contact.name} · {r.contact.titlePhoneEmail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
