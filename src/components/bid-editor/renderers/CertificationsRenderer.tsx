"use client";
import type { BidSectionContent, StyleGuide } from "@/lib/types";
import { EditableText } from "../EditableText";

type CertContent = Extract<BidSectionContent, { format: "certifications" }>;

export function CertificationsRenderer({
  title,
  content,
  style,
  onChange,
}: {
  title: string;
  content: CertContent;
  style: StyleGuide;
  onChange?: (next: CertContent) => void;
}) {
  const editable = !!onChange;
  const defaultNames = ["ISO 9001", "ISO 27001", "ISO 14001"];

  function updateCert(i: number, patch: Partial<CertContent["certs"][number]>) {
    if (!onChange) return;
    onChange({
      ...content,
      certs: content.certs.map((c, j) => j === i ? { ...c, ...patch } : c),
    });
  }

  return (
    <section className="p-6 text-sm">
      <h2 className="text-xl font-semibold mb-4" style={{ color: style.colors.primary }}>{title}</h2>
      <div className="grid grid-cols-2 gap-4">
        {content.certs.map((c, i) => {
          const displayName = c.name ?? defaultNames[i] ?? "Övrig";
          return (
            <div key={i} className="border rounded p-3">
              <p className="font-medium">
                {editable ? (
                  <EditableText
                    value={c.name ?? ""}
                    onChange={(v) => updateCert(i, { name: v })}
                    as="span"
                    placeholder={displayName}
                  />
                ) : displayName}
              </p>
              {(editable || c.description) && (
                <p className="text-gray-600">
                  {editable ? (
                    <EditableText
                      value={c.description ?? ""}
                      onChange={(v) => updateCert(i, { description: v })}
                      as="span"
                      placeholder="Beskrivning"
                    />
                  ) : c.description}
                </p>
              )}
              <p>
                Nummer:{" "}
                {editable ? (
                  <EditableText value={c.number} onChange={(v) => updateCert(i, { number: v })} as="span" />
                ) : c.number}
              </p>
              <p>
                Giltig t.o.m.:{" "}
                {editable ? (
                  <EditableText value={c.validUntil} onChange={(v) => updateCert(i, { validUntil: v })} as="span" />
                ) : c.validUntil}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
