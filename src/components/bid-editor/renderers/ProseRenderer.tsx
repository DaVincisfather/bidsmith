"use client";

import { StyleGuide } from "@/lib/types";
import { EditableText } from "../EditableText";

interface ProseRendererProps {
  title: string;
  text: string;
  style: StyleGuide;
  onFieldChange?: (field: "title" | "text", value: string) => void;
}

export function ProseRenderer({ title, text, style, onFieldChange }: ProseRendererProps) {
  const c = style.colors;

  return (
    <div className="py-2">
      {onFieldChange ? (
        <>
          <EditableText
            value={title}
            onChange={(v) => onFieldChange("title", v)}
            as="h3"
            className="text-xl font-bold mb-4"
            style={{ color: c.primary }}
          />
          <EditableText
            value={text}
            onChange={(v) => onFieldChange("text", v)}
            as="p"
            className="text-base leading-7 text-gray-700 whitespace-pre-wrap"
          />
        </>
      ) : (
        <>
          <h3 className="text-xl font-bold mb-4" style={{ color: c.primary }}>{title}</h3>
          <p className="text-base leading-7 text-gray-700 whitespace-pre-wrap">{text}</p>
        </>
      )}
    </div>
  );
}
