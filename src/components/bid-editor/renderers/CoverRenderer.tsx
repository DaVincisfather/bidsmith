"use client";

import { StyleGuide } from "@/lib/types";
import { EditableText } from "../EditableText";

interface CoverRendererProps {
  title: string;
  client: string;
  date: string;
  style: StyleGuide;
  onFieldChange?: (field: "title" | "client" | "date", value: string) => void;
}

export function CoverRenderer({ title, client, date, style, onFieldChange }: CoverRendererProps) {
  const c = style.colors;

  return (
    <div
      className="relative overflow-hidden rounded-lg py-16 px-12"
      style={{ backgroundColor: c.primary }}
    >
      {/* Decorative accent bar */}
      <div
        className="absolute top-0 left-0 w-full h-1"
        style={{ backgroundColor: c.secondary }}
      />

      <p
        className="text-xs font-bold tracking-[0.3em] uppercase mb-6"
        style={{ color: c.secondaryLight }}
      >
        ANBUD
      </p>

      {onFieldChange ? (
        <EditableText
          value={title}
          onChange={(v) => onFieldChange("title", v)}
          as="h2"
          className="text-3xl font-bold leading-tight mb-8 text-white"
        />
      ) : (
        <h2 className="text-3xl font-bold leading-tight mb-8 text-white">{title}</h2>
      )}

      <div className="w-16 h-0.5 mb-6" style={{ backgroundColor: c.muted }} />

      {onFieldChange ? (
        <>
          <EditableText
            value={client}
            onChange={(v) => onFieldChange("client", v)}
            as="p"
            className="text-lg text-white/80 mb-2"
          />
          <EditableText
            value={date}
            onChange={(v) => onFieldChange("date", v)}
            as="p"
            className="text-sm text-white/60"
          />
        </>
      ) : (
        <>
          <p className="text-lg text-white/80 mb-2">{client}</p>
          <p className="text-sm text-white/60">{date}</p>
        </>
      )}

      {/* Bottom accent */}
      <div
        className="absolute bottom-0 left-0 w-1/2 h-1"
        style={{ backgroundColor: c.secondary }}
      />
    </div>
  );
}
