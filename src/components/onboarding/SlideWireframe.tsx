"use client";

import { useState } from "react";
import type { WireframeSlide } from "@/lib/pptx-template/onboarding/draft";

export type SlotDecision = "confirmed" | "skipped" | "pending";

// SVG:ns viewBox är i EMU — webbläsaren skalar, ingen enhetskonvertering.
// 1 pt = 12700 EMU (för streck/typografi i EMU-rymden).
const EMU_PER_PT = 12700;

// Färgtokens ur globals.css (app-restylen) — samma konvention som
// PipelineRow/OpportunityRow: referera root-variablerna direkt (oklch()
// och hex fungerar båda fint i SVG:s fill/stroke), inte @theme-aliasen
// som bara finns för Tailwind-klassgenerering.
const DECISION_FILL: Record<SlotDecision, string> = {
  confirmed: "var(--accent-soft)",
  skipped: "transparent",
  pending: "var(--flag-soft)", // varningston — kräver ställningstagande
};

interface SlideWireframeProps {
  slide: WireframeSlide;
  slideSize: { cx: number; cy: number };
  selectedShapeIndex: number | null;
  decisions: ReadonlyMap<number, SlotDecision>;
  onSelect: (shapeIndex: number) => void;
}

export function SlideWireframe({
  slide,
  slideSize,
  selectedShapeIndex,
  decisions,
  onSelect,
}: SlideWireframeProps) {
  const placeable = slide.shapes.filter((s) => s.geometry !== null);
  const floating = slide.shapes.filter((s) => s.geometry === null && s.candidate);
  // Tangentbordsfokus på kandidat-<g> — SVG saknar :focus-visible-stöd via
  // Tailwind-klasser på gruppnivå, så fokus markeras med samma stroke-
  // förstärkning som selected (state i stället för CSS).
  const [focusedShapeIndex, setFocusedShapeIndex] = useState<number | null>(null);

  return (
    <div className="space-y-2">
      <svg
        viewBox={`0 0 ${slideSize.cx} ${slideSize.cy}`}
        className="w-full border border-rule rounded-lg bg-white"
        // group, inte img: SVG:n har interaktiva barn (kandidat-<g> med
        // role="button") — role="img" gömmer dem för hjälpmedel.
        role="group"
        aria-label={`Slide ${slide.source}`}
      >
        {placeable.map((shape) => {
          const g = shape.geometry!;
          const decision = shape.candidate ? (decisions.get(shape.shapeIndex) ?? "pending") : null;
          const selected = shape.shapeIndex === selectedShapeIndex;
          const focused = shape.shapeIndex === focusedShapeIndex;
          const emphasized = selected || focused;
          return (
            <g
              key={shape.shapeIndex}
              data-testid={`shape-${slide.source}-${shape.shapeIndex}`}
              onClick={shape.candidate ? () => onSelect(shape.shapeIndex) : undefined}
              className={shape.candidate ? "cursor-pointer focus:outline-none" : undefined}
              // Tangentbordsstöd: <g> är inte fokuserbar av sig själv —
              // role/tabIndex/Enter/Space gör kandidaterna likvärdiga med
              // de geometri-lösa <button>-raderna under.
              role={shape.candidate ? "button" : undefined}
              tabIndex={shape.candidate ? 0 : undefined}
              aria-label={shape.candidate ? `Textruta: ${shape.text.slice(0, 48)}` : undefined}
              onKeyDown={
                shape.candidate
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault(); // Space scrollar annars sidan
                        onSelect(shape.shapeIndex);
                      }
                    }
                  : undefined
              }
              onFocus={shape.candidate ? () => setFocusedShapeIndex(shape.shapeIndex) : undefined}
              onBlur={shape.candidate ? () => setFocusedShapeIndex(null) : undefined}
            >
              <rect
                x={g.x} y={g.y} width={g.cx} height={g.cy}
                fill={decision ? DECISION_FILL[decision] : "transparent"}
                stroke={emphasized ? "var(--accent)" : "var(--rule)"}
                strokeWidth={(emphasized ? 2.5 : 0.75) * EMU_PER_PT}
                strokeDasharray={decision === "skipped" ? `${2 * EMU_PER_PT} ${2 * EMU_PER_PT}` : undefined}
              />
              <text
                x={g.x + 4 * EMU_PER_PT}
                y={g.y + 14 * EMU_PER_PT}
                fontSize={10 * EMU_PER_PT}
                fill="var(--ink-soft)"
              >
                {shape.text.slice(0, 48)}
              </text>
            </g>
          );
        })}
      </svg>
      {floating.length > 0 && (
        <div className="text-sm text-ink-soft">
          <p className="font-medium text-ink-mute text-xs uppercase tracking-wide">
            Rutor utan position (ärvd geometri)
          </p>
          <ul className="mt-1 space-y-1">
            {floating.map((shape) => (
              <li key={shape.shapeIndex}>
                <button
                  type="button"
                  onClick={() => onSelect(shape.shapeIndex)}
                  className={`underline-offset-2 hover:underline ${
                    shape.shapeIndex === selectedShapeIndex ? "text-accent font-medium" : ""
                  }`}
                >
                  {shape.text || "(tom textruta)"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
