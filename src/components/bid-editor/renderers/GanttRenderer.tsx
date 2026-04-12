"use client";

import { ExecutionPhase, StyleGuide } from "@/lib/types";

const PHASE_COLORS = ["#E8913A", "#2E8B57", "#2D4A7A", "#7C3AED", "#DC2626"];

interface Milestone {
  label: string;
  afterPhase: number;
}

interface GanttRendererProps {
  title: string;
  phases: ExecutionPhase[];
  milestones?: Milestone[];
  style: StyleGuide;
}

export function GanttRenderer({ title, phases, milestones = [], style }: GanttRendererProps) {
  const c = style.colors;

  function parseWeeks(duration: string): number {
    const m = duration.match(/(\d+)/);
    if (!m) return 4;
    const n = parseInt(m[1], 10);
    if (/månad|month/i.test(duration)) return n * 4;
    return n;
  }

  const weekCounts = phases.map((p) => parseWeeks(p.duration));
  const totalWeeks = weekCounts.reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="py-2">
      <h3 className="text-xl font-bold mb-6" style={{ color: c.primary }}>{title}</h3>
      <div className="space-y-2">
        {phases.map((phase, i) => {
          const startWeek = weekCounts.slice(0, i).reduce((a, b) => a + b, 0);
          const leftPct = (startWeek / totalWeeks) * 100;
          const widthPct = (weekCounts[i] / totalWeeks) * 100;
          const barColor = PHASE_COLORS[i % PHASE_COLORS.length];

          const milestoneHere = milestones.find((m) => m.afterPhase === i + 1);

          return (
            <div key={i} className="flex items-center gap-3">
              <span className="text-xs text-gray-500 w-40 shrink-0 truncate">{phase.name}</span>
              <div className="flex-1 relative h-7 bg-gray-100 rounded">
                <div
                  className="absolute top-0 h-full rounded flex items-center px-2"
                  style={{
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    backgroundColor: barColor,
                  }}
                >
                  <span className="text-[10px] text-white font-medium truncate">{phase.duration}</span>
                </div>
                {milestoneHere && (
                  <div
                    className="absolute top-0 h-full flex items-center"
                    style={{ left: `${leftPct + widthPct}%` }}
                  >
                    <div className="w-3 h-3 rotate-45 -ml-1.5" style={{ backgroundColor: c.secondary }} />
                    <span className="text-[9px] text-gray-500 ml-1 whitespace-nowrap">{milestoneHere.label}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
