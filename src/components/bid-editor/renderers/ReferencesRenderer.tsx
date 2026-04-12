"use client";

import { BidReference, StyleGuide } from "@/lib/types";
import { EditableText } from "../EditableText";

interface ReferencesRendererProps {
  title: string;
  references: BidReference[];
  style: StyleGuide;
  onReferenceFieldChange?: (index: number, field: "title" | "description" | "relevance", value: string) => void;
}

export function ReferencesRenderer({ title, references, style, onReferenceFieldChange }: ReferencesRendererProps) {
  const c = style.colors;

  return (
    <div className="py-2 space-y-4">
      <h3 className="text-xl font-bold mb-2" style={{ color: c.primary }}>{title}</h3>
      {references.map((ref, i) => (
        <div key={i} className="rounded-lg border border-gray-200 p-5">
          <div className="flex items-start justify-between mb-2">
            {onReferenceFieldChange ? (
              <EditableText
                value={ref.title}
                onChange={(v) => onReferenceFieldChange(i, "title", v)}
                as="h4"
                className="font-semibold text-gray-900"
              />
            ) : (
              <h4 className="font-semibold text-gray-900">{ref.title}</h4>
            )}
            <span className="text-sm shrink-0 ml-4" style={{ color: c.muted }}>
              {ref.client}, {ref.year}
            </span>
          </div>
          {onReferenceFieldChange ? (
            <>
              <EditableText
                value={ref.description}
                onChange={(v) => onReferenceFieldChange(i, "description", v)}
                as="p"
                className="text-sm text-gray-600 mb-2"
              />
              <EditableText
                value={ref.relevance}
                onChange={(v) => onReferenceFieldChange(i, "relevance", v)}
                as="p"
                className="text-sm italic"
                style={{ color: c.accent }}
              />
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600 mb-2">{ref.description}</p>
              <p className="text-sm italic" style={{ color: c.accent }}>{ref.relevance}</p>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
