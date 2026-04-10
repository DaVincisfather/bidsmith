"use client";

import { BidSection } from "@/lib/types";

interface BidSectionCardProps {
  section: BidSection;
  onRegenerate?: () => void;
  regenerating?: boolean;
}

function sectionPreview(section: BidSection): string {
  switch (section.content.format) {
    case "prose":
      return section.content.text.substring(0, 120) + (section.content.text.length > 120 ? "..." : "");
    case "bullets":
      return section.content.items.slice(0, 2).join(" | ") + (section.content.items.length > 2 ? " ..." : "");
    case "phases":
      return section.content.phases.map((p) => p.name).join(" → ");
    case "team":
      return section.content.members.map((m) => m.name).join(", ");
    case "references":
      return section.content.references.map((r) => r.title).join(", ");
    case "requirement-matrix": {
      const names = Object.values(section.content.consultantNames ?? {});
      return `${section.content.rows.length} krav × ${names.length || Object.keys(section.content.rows[0]?.coverage ?? {}).length} konsulter`;
    }
    case "cover":
      return `${section.content.title} — ${section.content.client}`;
    case "placeholder":
      return section.content.instruction;
    case "section-divider":
      return `Avsnitt ${section.content.sectionNumber}: ${section.content.subtitle}`;
    case "three-column":
      return section.content.columns.map((c) => c.title).join(" | ");
    case "gantt":
      return section.content.phases.map((p) => p.name).join(" → ");
  }
}

function statusIcon(section: BidSection): string {
  if (section.type === "placeholder") return "\u25A1";
  return "\u2713";
}

function statusColor(section: BidSection): string {
  if (section.type === "placeholder") return "text-gray-400";
  return "text-green-600";
}

export function BidSectionCard({
  section,
  onRegenerate,
  regenerating,
}: BidSectionCardProps) {
  const canRegenerate = section.type === "ai";

  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <span className={`shrink-0 mt-0.5 ${statusColor(section)}`}>
            {statusIcon(section)}
          </span>
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-gray-900">{section.title}</h4>
            <p className="text-xs text-gray-500 mt-1 truncate">
              {sectionPreview(section)}
            </p>
          </div>
        </div>
        {canRegenerate && onRegenerate && (
          <button
            onClick={onRegenerate}
            disabled={regenerating}
            className="shrink-0 text-xs text-gray-500 hover:text-gray-800 border border-gray-300
                       px-2 py-1 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed
                       transition-colors"
          >
            {regenerating ? "Regenererar..." : "Regenerera"}
          </button>
        )}
      </div>
    </div>
  );
}
