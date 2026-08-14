"use client";

import { ExecutionPhase } from "@/lib/types";
import { EditableText } from "../EditableText";

// Vertikal tidslinje ur den godkända mockupen (editor-omdesignen 2026-08-14):
// numrerade noder på en accent-linje i stället för PPTX-slide-färgbalkarna.
// Alla tidigare redigerbara fält (namn, varaktighet, mål, leverabler, risker,
// timmar, period) förblir redigerbara via EditableText.

interface PhasesRendererProps {
  phases: ExecutionPhase[];
  onChange?: (phases: ExecutionPhase[]) => void;
}

export function PhasesRenderer({ phases, onChange }: PhasesRendererProps) {
  const editable = !!onChange;

  function updatePhase(i: number, patch: Partial<ExecutionPhase>) {
    if (!onChange) return;
    onChange(phases.map((p, j) => j === i ? { ...p, ...patch } : p));
  }

  function updateDeliverable(i: number, dIdx: number, value: string) {
    if (!onChange) return;
    onChange(phases.map((p, j) => j === i
      ? { ...p, deliverables: p.deliverables.map((d, k) => k === dIdx ? value : d) }
      : p,
    ));
  }

  function updateRisk(i: number, rIdx: number, value: string) {
    if (!onChange) return;
    onChange(phases.map((p, j) => j === i
      ? { ...p, risks: (p.risks ?? []).map((r, k) => k === rIdx ? value : r) }
      : p,
    ));
  }

  function updateHours(i: number, value: string) {
    if (!onChange) return;
    // Number("") === 0 — ett tömt fält ska inte tyst bli 0 timmar
    // (routine-fynd #122).
    if (value.trim() === "") return;
    const num = Number(value);
    if (!Number.isFinite(num)) return;
    updatePhase(i, { hoursEstimate: num });
  }

  return (
    <div className="relative mt-2 pl-[34px]">
      <div aria-hidden className="absolute bottom-2 left-[11px] top-2 w-0.5 bg-rule" />
      {phases.map((phase, i) => (
        <div key={i} className="relative pb-8 last:pb-0">
          <div
            aria-hidden
            className="absolute -left-[34px] top-0 flex h-6 w-6 items-center justify-center
                       rounded-full border-2 border-accent bg-white font-mono text-[11px]
                       font-bold text-accent"
          >
            {i + 1}
          </div>

          <div className="flex items-baseline gap-3">
            {editable ? (
              <EditableText
                value={phase.name}
                onChange={(v) => updatePhase(i, { name: v })}
                as="h3"
                className="font-display text-[17px] font-medium text-ink"
              />
            ) : (
              <h3 className="font-display text-[17px] font-medium text-ink">{phase.name}</h3>
            )}
            {(editable || phase.duration) && (
              <span className="rounded-full bg-accent-soft px-2 py-0.5 font-mono text-[10px] text-accent">
                {editable ? (
                  <EditableText
                    value={phase.duration}
                    onChange={(v) => updatePhase(i, { duration: v })}
                    as="span"
                    placeholder="Varaktighet"
                  />
                ) : phase.duration}
              </span>
            )}
            {(editable || phase.hoursEstimate !== undefined) && (
              <span className="ml-auto shrink-0 font-mono text-[10px] text-ink-mute">
                {editable ? (
                  <EditableText
                    value={String(phase.hoursEstimate ?? "")}
                    onChange={(v) => updateHours(i, v)}
                    as="span"
                    placeholder="h"
                  />
                ) : phase.hoursEstimate}{" "}
                h
              </span>
            )}
          </div>

          <div className="mt-2 max-w-[38rem] text-sm leading-relaxed text-ink-soft">
            {editable ? (
              <EditableText
                value={phase.objective}
                onChange={(v) => updatePhase(i, { objective: v })}
                as="p"
              />
            ) : (
              <p>{phase.objective}</p>
            )}
          </div>

          {phase.deliverables.length > 0 && (
            <ul className="mt-2.5 space-y-1.5">
              {phase.deliverables.map((d, j) => (
                <li key={j} className="flex items-baseline gap-2 text-[13px] text-ink-soft">
                  <span aria-hidden className="text-[11px] text-accent">✓</span>
                  {editable ? (
                    <EditableText
                      value={d}
                      onChange={(v) => updateDeliverable(i, j, v)}
                      as="span"
                    />
                  ) : d}
                </li>
              ))}
            </ul>
          )}

          {phase.risks && phase.risks.length > 0 && (
            <ul className="mt-2.5 space-y-1">
              {phase.risks.map((r, j) => (
                <li key={j} className="flex items-baseline gap-2 text-xs text-ink-mute">
                  <span className="shrink-0 font-mono text-[10px] text-flag">⚠ RISK</span>
                  {editable ? (
                    <EditableText
                      value={r}
                      onChange={(v) => updateRisk(i, j, v)}
                      as="span"
                    />
                  ) : r}
                </li>
              ))}
            </ul>
          )}

          {(editable || phase.period) && (
            <div className="mt-2 font-mono text-[10px] text-ink-mute">
              Period:{" "}
              {editable ? (
                <EditableText
                  value={phase.period ?? ""}
                  onChange={(v) => updatePhase(i, { period: v })}
                  as="span"
                  placeholder="—"
                />
              ) : phase.period}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
