"use client";

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

  return (
    <div className="space-y-2">
      <svg
        viewBox={`0 0 ${slideSize.cx} ${slideSize.cy}`}
        className="w-full border border-rule rounded-lg bg-white"
        role="img"
        aria-label={`Slide ${slide.source}`}
      >
        {placeable.map((shape) => {
          const g = shape.geometry!;
          const decision = shape.candidate ? (decisions.get(shape.shapeIndex) ?? "pending") : null;
          const selected = shape.shapeIndex === selectedShapeIndex;
          return (
            <g
              key={shape.shapeIndex}
              data-testid={`shape-${slide.source}-${shape.shapeIndex}`}
              onClick={shape.candidate ? () => onSelect(shape.shapeIndex) : undefined}
              className={shape.candidate ? "cursor-pointer" : undefined}
            >
              <rect
                x={g.x} y={g.y} width={g.cx} height={g.cy}
                fill={decision ? DECISION_FILL[decision] : "transparent"}
                stroke={selected ? "var(--accent)" : "var(--rule)"}
                strokeWidth={(selected ? 2.5 : 0.75) * EMU_PER_PT}
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
