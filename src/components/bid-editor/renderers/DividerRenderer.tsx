"use client";

import { StyleGuide } from "@/lib/types";
import { EditableText } from "../EditableText";

interface DividerRendererProps {
  sectionNumber: number;
  title: string;
  subtitle: string;
  style: StyleGuide;
  onFieldChange?: (field: "title" | "subtitle", value: string) => void;
}

export function DividerRenderer({ sectionNumber, title, subtitle, style, onFieldChange }: DividerRendererProps) {
  const c = style.colors;

  return (
    <div
      className="rounded-lg py-10 px-12 flex items-center gap-8"
      style={{ backgroundColor: c.primaryLight }}
    >
      <span
        className="text-5xl font-bold shrink-0"
        style={{ color: c.secondary }}
      >
        {String(sectionNumber).padStart(2, "0")}
      </span>
      <div>
        {onFieldChange ? (
          <>
            <EditableText
              value={title}
              onChange={(v) => onFieldChange("title", v)}
              as="h3"
              className="text-xl font-bold text-white"
            />
            <EditableText
              value={subtitle}
              onChange={(v) => onFieldChange("subtitle", v)}
              as="p"
              className="text-sm text-white/70 mt-1"
            />
          </>
        ) : (
          <>
            <h3 className="text-xl font-bold text-white">{title}</h3>
            <p className="text-sm text-white/70 mt-1">{subtitle}</p>
          </>
        )}
      </div>
    </div>
  );
}
