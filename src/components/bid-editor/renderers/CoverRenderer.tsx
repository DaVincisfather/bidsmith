"use client";

import { EditableText } from "../EditableText";

interface CoverRendererProps {
  title: string;
  client: string;
  date: string;
  onFieldChange?: (field: "title" | "client" | "date", value: string) => void;
}

export function CoverRenderer({ title, client, date, onFieldChange }: CoverRendererProps) {
  return (
    <div
      className="relative w-full aspect-video rounded-lg overflow-hidden bg-white shadow-sm"
      style={{
        backgroundImage: "url(/templates/anbudsmall-v2-cover.png)",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {/* Date — top right (matches {Anbudsdatum} placeholder zone) */}
      <div className="absolute top-[8%] right-[5%]">
        {onFieldChange ? (
          <EditableText
            value={date}
            onChange={(v) => onFieldChange("date", v)}
            as="span"
            className="block text-[10px] text-gray-600"
          />
        ) : (
          <span className="block text-[10px] text-gray-600">{date}</span>
        )}
      </div>

      {/* Client — BIG mid-left ({Kundnamn} zone) */}
      <div className="absolute top-[44%] left-[6.3%] right-[40%]">
        {onFieldChange ? (
          <EditableText
            value={client}
            onChange={(v) => onFieldChange("client", v)}
            as="h2"
            className="text-xl font-bold leading-tight text-gray-900"
          />
        ) : (
          <h2 className="text-xl font-bold leading-tight text-gray-900">{client}</h2>
        )}
      </div>

      {/* Title — subtitle below client ({Upphandlingens namn} zone) */}
      <div className="absolute top-[57%] left-[6.3%] right-[40%]">
        {onFieldChange ? (
          <EditableText
            value={title}
            onChange={(v) => onFieldChange("title", v)}
            as="p"
            className="text-sm text-gray-700"
          />
        ) : (
          <p className="text-sm text-gray-700">{title}</p>
        )}
      </div>
    </div>
  );
}
