"use client";

import { StyleGuide } from "@/lib/types";
import { EditableText } from "../EditableText";

interface BulletsRendererProps {
  title: string;
  items: string[];
  style: StyleGuide;
  onFieldChange?: (field: "title", value: string) => void;
  onItemChange?: (index: number, value: string) => void;
  onItemAdd?: () => void;
  onItemRemove?: (index: number) => void;
}

export function BulletsRenderer({
  title,
  items,
  style,
  onFieldChange,
  onItemChange,
  onItemAdd,
  onItemRemove,
}: BulletsRendererProps) {
  const c = style.colors;

  return (
    <div className="py-2">
      {onFieldChange ? (
        <EditableText
          value={title}
          onChange={(v) => onFieldChange("title", v)}
          as="h3"
          className="text-xl font-bold mb-4"
          style={{ color: c.primary }}
        />
      ) : (
        <h3 className="text-xl font-bold mb-4" style={{ color: c.primary }}>{title}</h3>
      )}

      <ul className="space-y-3">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-3 group">
            <span
              className="mt-2 w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: c.secondary }}
            />
            {onItemChange ? (
              <EditableText
                value={item}
                onChange={(v) => onItemChange(i, v)}
                as="span"
                className="text-base leading-7 text-gray-700 flex-1"
              />
            ) : (
              <span className="text-base leading-7 text-gray-700">{item}</span>
            )}
            {onItemRemove && (
              <button
                onClick={() => onItemRemove(i)}
                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 text-sm transition-opacity"
              >
                &times;
              </button>
            )}
          </li>
        ))}
      </ul>

      {onItemAdd && (
        <button
          onClick={onItemAdd}
          className="mt-3 text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          + Ny punkt
        </button>
      )}
    </div>
  );
}
