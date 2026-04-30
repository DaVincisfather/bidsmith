"use client";
import type { BidSectionContent, StyleGuide } from "@/lib/types";
import { EditableText } from "../EditableText";

type ReferenceContent = Extract<BidSectionContent, { format: "reference-v2" }>;

export function ReferenceV2Renderer({
  title,
  content,
  style,
  onChange,
}: {
  title: string;
  content: ReferenceContent;
  style: StyleGuide;
  onChange?: (next: ReferenceContent) => void;
}) {
  const editable = !!onChange;

  function updateRef(i: number, patch: Partial<ReferenceContent["references"][number]>) {
    if (!onChange) return;
    onChange({
      ...content,
      references: content.references.map((r, j) => j === i ? { ...r, ...patch } : r),
    });
  }

  function updateContact(i: number, patch: Partial<ReferenceContent["references"][number]["contact"]>) {
    if (!onChange) return;
    onChange({
      ...content,
      references: content.references.map((r, j) => j === i
        ? { ...r, contact: { ...r.contact, ...patch } }
        : r,
      ),
    });
  }

  return (
    <section className="p-6 text-sm">
      <h2 className="text-xl font-semibold mb-4" style={{ color: style.colors.primary }}>{title}</h2>
      <div className="space-y-6">
        {content.references.map((r, i) => (
          <div key={i} className="border-l-4 pl-4" style={{ borderColor: style.colors.accent }}>
            <p className="font-medium">
              {editable ? (
                <EditableText value={r.clientName} onChange={(v) => updateRef(i, { clientName: v })} as="span" />
              ) : r.clientName}
              {" — "}
              {editable ? (
                <EditableText value={r.contextLine} onChange={(v) => updateRef(i, { contextLine: v })} as="span" />
              ) : r.contextLine}
            </p>
            <p className="text-gray-600">
              {editable ? (
                <EditableText value={r.organisation} onChange={(v) => updateRef(i, { organisation: v })} as="span" />
              ) : r.organisation}
              {" · "}
              {editable ? (
                <EditableText value={r.startDate} onChange={(v) => updateRef(i, { startDate: v })} as="span" />
              ) : r.startDate}
              {" – "}
              {editable ? (
                <EditableText value={r.endDate} onChange={(v) => updateRef(i, { endDate: v })} as="span" />
              ) : r.endDate}
            </p>
            <p className="mt-2">
              Scope:{" "}
              {editable ? (
                <EditableText value={r.scope} onChange={(v) => updateRef(i, { scope: v })} as="span" />
              ) : r.scope}
            </p>
            <p>
              Roll och leverans:{" "}
              {editable ? (
                <EditableText value={r.roleAndDelivery} onChange={(v) => updateRef(i, { roleAndDelivery: v })} as="span" />
              ) : r.roleAndDelivery}
            </p>
            <p>
              Resultat:{" "}
              {editable ? (
                <EditableText value={r.result} onChange={(v) => updateRef(i, { result: v })} as="span" />
              ) : r.result}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Kontakt:{" "}
              {editable ? (
                <EditableText value={r.contact.name} onChange={(v) => updateContact(i, { name: v })} as="span" />
              ) : r.contact.name}
              {" · "}
              {editable ? (
                <EditableText value={r.contact.titlePhoneEmail} onChange={(v) => updateContact(i, { titlePhoneEmail: v })} as="span" />
              ) : r.contact.titlePhoneEmail}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
