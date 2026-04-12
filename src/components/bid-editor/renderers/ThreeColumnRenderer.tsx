"use client";

import { StyleGuide } from "@/lib/types";
import { EditableText } from "../EditableText";

interface Column {
  title: string;
  icon: string;
  body: string;
}

interface ThreeColumnRendererProps {
  title: string;
  columns: Column[];
  style: StyleGuide;
  onColumnChange?: (index: number, field: "title" | "body", value: string) => void;
}

export function ThreeColumnRenderer({
  title,
  columns,
  style,
  onColumnChange,
}: ThreeColumnRendererProps) {
  const c = style.colors;

  return (
    <div className="py-2">
      <h3 className="text-xl font-bold mb-6" style={{ color: c.primary }}>{title}</h3>
      <div className="grid grid-cols-3 gap-6">
        {columns.map((col, i) => (
          <div key={i} className="rounded-lg border border-gray-200 p-6">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm mb-4"
              style={{ backgroundColor: c.secondary }}
            >
              {col.icon}
            </div>
            {onColumnChange ? (
              <>
                <EditableText
                  value={col.title}
                  onChange={(v) => onColumnChange(i, "title", v)}
                  as="h4"
                  className="font-semibold text-gray-900 mb-2"
                />
                <EditableText
                  value={col.body}
                  onChange={(v) => onColumnChange(i, "body", v)}
                  as="p"
                  className="text-sm text-gray-600 leading-relaxed"
                />
              </>
            ) : (
              <>
                <h4 className="font-semibold text-gray-900 mb-2">{col.title}</h4>
                <p className="text-sm text-gray-600 leading-relaxed">{col.body}</p>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
