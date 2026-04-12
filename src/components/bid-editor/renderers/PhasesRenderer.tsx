"use client";

import { ExecutionPhase, StyleGuide } from "@/lib/types";
import { EditableText } from "../EditableText";

const PHASE_COLORS = ["#1F5E63", "#8FAF9A", "#2D7A7F", "#5B8A72", "#3D8A8A"];

interface PhasesRendererProps {
  phases: ExecutionPhase[];
  style: StyleGuide;
  onPhaseFieldChange?: (phaseIndex: number, field: keyof ExecutionPhase, value: string) => void;
}

export function PhasesRenderer({ phases, style, onPhaseFieldChange }: PhasesRendererProps) {
  const c = style.colors;

  return (
    <div className="py-2 space-y-4">
      {phases.map((phase, i) => {
        const barColor = PHASE_COLORS[i % PHASE_COLORS.length];
        return (
          <div key={i} className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-6 py-3 flex items-center gap-3" style={{ backgroundColor: barColor }}>
              {onPhaseFieldChange ? (
                <EditableText
                  value={phase.name}
                  onChange={(v) => onPhaseFieldChange(i, "name", v)}
                  as="h4"
                  className="font-bold text-white text-sm"
                />
              ) : (
                <h4 className="font-bold text-white text-sm">{phase.name}</h4>
              )}
              {phase.duration && (
                <span className="ml-auto text-xs text-white/80 shrink-0">{phase.duration}</span>
              )}
            </div>
            <div className="px-6 py-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-semibold text-gray-500 text-xs uppercase tracking-wide mb-1">Mål</p>
                {onPhaseFieldChange ? (
                  <EditableText
                    value={phase.objective}
                    onChange={(v) => onPhaseFieldChange(i, "objective", v)}
                    as="p"
                    className="text-gray-700"
                  />
                ) : (
                  <p className="text-gray-700">{phase.objective}</p>
                )}
              </div>
              <div>
                <p className="font-semibold text-gray-500 text-xs uppercase tracking-wide mb-1">Leverabler</p>
                <ul className="space-y-1">
                  {phase.deliverables.map((d, j) => (
                    <li key={j} className="flex items-start gap-2 text-gray-700">
                      <span style={{ color: barColor }}>&#10003;</span> {d}
                    </li>
                  ))}
                </ul>
              </div>
              {phase.risks && phase.risks.length > 0 && (
                <div className="col-span-2">
                  <p className="font-semibold text-gray-500 text-xs uppercase tracking-wide mb-1">Risker</p>
                  <ul className="space-y-1">
                    {phase.risks.map((r, j) => (
                      <li key={j} className="flex items-start gap-2 text-gray-600 text-xs">
                        <span className="text-red-400">&#9888;</span> {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {phase.hoursEstimate && (
                <div className="col-span-2 text-xs text-gray-400">
                  Uppskattade timmar: {phase.hoursEstimate}h
                  {phase.period && <> &middot; {phase.period}</>}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
