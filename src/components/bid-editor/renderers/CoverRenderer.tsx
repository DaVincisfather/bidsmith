"use client";

import { EditableText } from "../EditableText";

interface CoverRendererProps {
  title: string;
  client: string;
  date: string;
  onFieldChange?: (field: "title" | "client" | "date", value: string) => void;
}

// Dokumenthuvudet ur den godkända mockupen (editor-omdesignen 2026-08-14):
// typografiskt kort — kicker + kundnamn som Fraunces-H1 + upphandlingens namn
// som undertitel. Ersätter PPTX-slide-previewn (bakgrundsbild + absolut-
// positionerad text); datamodellen (cover-sektionens content) är orörd och
// alla tre fälten förblir redigerbara.
export function CoverRenderer({ title, client, date, onFieldChange }: CoverRendererProps) {
  return (
    <div>
      <div className="mb-3.5 flex items-baseline gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-accent">
        <span>Anbud ·</span>
        {onFieldChange ? (
          <EditableText
            value={date}
            onChange={(v) => onFieldChange("date", v)}
            as="span"
          />
        ) : (
          <span>{date}</span>
        )}
      </div>
      {onFieldChange ? (
        <EditableText
          value={client}
          onChange={(v) => onFieldChange("client", v)}
          as="h1"
          className="font-display text-[40px] font-medium leading-[1.08] tracking-tight text-ink"
        />
      ) : (
        <h1 className="font-display text-[40px] font-medium leading-[1.08] tracking-tight text-ink">
          {client}
        </h1>
      )}
      {onFieldChange ? (
        <EditableText
          value={title}
          onChange={(v) => onFieldChange("title", v)}
          as="p"
          className="mt-2 font-display text-[19px] text-ink-soft"
        />
      ) : (
        <p className="mt-2 font-display text-[19px] text-ink-soft">{title}</p>
      )}
    </div>
  );
}
