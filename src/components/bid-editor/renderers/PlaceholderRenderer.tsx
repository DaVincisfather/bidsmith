"use client";

import { StyleGuide } from "@/lib/types";
import { EditableText } from "../EditableText";

interface PlaceholderRendererProps {
  title: string;
  instruction: string;
  style: StyleGuide;
  onFieldChange?: (field: "instruction", value: string) => void;
}

export function PlaceholderRenderer({ title, instruction, style, onFieldChange }: PlaceholderRendererProps) {
  return (
    <div className="border-2 border-dashed border-gray-300 rounded-lg p-8">
      <h3 className="text-lg font-semibold text-gray-400 mb-2">{title}</h3>
      {onFieldChange ? (
        <EditableText
          value={instruction}
          onChange={(v) => onFieldChange("instruction", v)}
          as="p"
          className="text-sm text-gray-400 italic"
        />
      ) : (
        <p className="text-sm text-gray-400 italic">{instruction}</p>
      )}
    </div>
  );
}
