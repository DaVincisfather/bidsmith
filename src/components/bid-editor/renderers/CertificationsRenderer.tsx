"use client";
import type { BidSectionContent, StyleGuide } from "@/lib/types";

type CertContent = Extract<BidSectionContent, { format: "certifications" }>;

export function CertificationsRenderer({
  title, content, style,
}: { title: string; content: CertContent; style: StyleGuide }) {
  const defaultNames = ["ISO 9001", "ISO 27001", "ISO 14001"];
  return (
    <section className="p-6 text-sm">
      <h2 className="text-xl font-semibold mb-4" style={{ color: style.colors.primary }}>{title}</h2>
      <div className="grid grid-cols-2 gap-4">
        {content.certs.map((c, i) => (
          <div key={i} className="border rounded p-3">
            <p className="font-medium">{c.name ?? defaultNames[i] ?? "Övrig"}</p>
            {c.description && <p className="text-gray-600">{c.description}</p>}
            <p>Nummer: {c.number}</p>
            <p>Giltig t.o.m.: {c.validUntil}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
