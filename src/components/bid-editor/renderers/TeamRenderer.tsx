"use client";

import { TeamPresentation, StyleGuide } from "@/lib/types";
import { EditableText } from "../EditableText";

interface TeamRendererProps {
  members: TeamPresentation[];
  style: StyleGuide;
  onMemberFieldChange?: (index: number, field: "role" | "relevantExperience", value: string) => void;
}

export function TeamRenderer({ members, style, onMemberFieldChange }: TeamRendererProps) {
  const c = style.colors;

  return (
    <div className="py-2 grid grid-cols-2 gap-4">
      {members.map((member, i) => (
        <div key={i} className="rounded-lg border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
              style={{ backgroundColor: c.primary }}
            >
              {member.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
            </div>
            <div>
              <p className="font-semibold text-gray-900">{member.name}</p>
              {onMemberFieldChange ? (
                <EditableText
                  value={member.role}
                  onChange={(v) => onMemberFieldChange(i, "role", v)}
                  as="p"
                  className="text-sm"
                  style={{ color: c.secondary }}
                />
              ) : (
                <p className="text-sm" style={{ color: c.secondary }}>{member.role}</p>
              )}
            </div>
          </div>
          {onMemberFieldChange ? (
            <EditableText
              value={member.relevantExperience}
              onChange={(v) => onMemberFieldChange(i, "relevantExperience", v)}
              as="p"
              className="text-sm text-gray-600 mb-3"
            />
          ) : (
            <p className="text-sm text-gray-600 mb-3">{member.relevantExperience}</p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {member.keyCompetencies.map((comp, j) => (
              <span
                key={j}
                className="text-xs px-2 py-0.5 rounded-full"
                style={{ backgroundColor: c.light, color: c.primary }}
              >
                {comp}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
