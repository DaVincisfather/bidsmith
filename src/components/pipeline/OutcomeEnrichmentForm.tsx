"use client";

import { useState } from "react";
import type { LossReason, BidOutcome } from "@/lib/types";

interface Props {
  outcome: BidOutcome;
  onSave: (values: {
    competitorName: string;
    lossReason: LossReason | "";
    lossComment: string;
  }) => void;
  onSkip: () => void;
}

const REASONS: Array<{ value: LossReason; label: string }> = [
  { value: "pris", label: "Pris" },
  { value: "erfarenhet", label: "Erfarenhet / referenser" },
  { value: "team", label: "Team-matchning" },
  { value: "kvalitet", label: "Kvalitet i anbud" },
  { value: "relation", label: "Relation / incumbent" },
  { value: "annat", label: "Annat" },
];

const FIELD_CLASSES =
  "w-full rounded-lg border border-rule bg-white px-2.5 py-1.5 text-sm text-ink";

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1 block font-mono text-[9px] uppercase tracking-widest text-ink-mute">
      {children}
    </span>
  );
}

// Berikningsläget efter valt utfall (pipeline-UX-passet 2026-08-16): utfallschip
// + fält i omdesignens formstil. Copy-rättelse i samma pass: detaljerna "tränar"
// ingen modell — de bygger firmans historik (samma correctness-klass som
// rail-/banner-copyn 2026-08-14).
export function OutcomeEnrichmentForm({ outcome, onSave, onSkip }: Props) {
  const [competitorName, setCompetitorName] = useState("");
  const [lossReason, setLossReason] = useState<LossReason | "">("");
  const [lossComment, setLossComment] = useState("");

  const showLossFields = outcome === "lost";

  return (
    <div className="mt-3 border-t border-rule pt-3">
      <span
        className={`mb-2.5 inline-block rounded-full border px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-widest ${
          outcome === "won"
            ? "border-emerald-600 text-emerald-700"
            : "border-red-600 text-red-600"
        }`}
      >
        {outcome === "won" ? "✓ Vunnen" : "✗ Förlorad"}
      </span>
      <div className="grid grid-cols-2 gap-3">
        {showLossFields && (
          <>
            <label className="block">
              <FieldLabel>Mot vem? (valfritt)</FieldLabel>
              <input
                value={competitorName}
                onChange={(e) => setCompetitorName(e.target.value)}
                placeholder="Konkurrentens namn"
                className={FIELD_CLASSES}
              />
            </label>
            <label className="block">
              <FieldLabel>Främsta skäl</FieldLabel>
              <select
                value={lossReason}
                onChange={(e) => setLossReason(e.target.value as LossReason | "")}
                className={FIELD_CLASSES}
              >
                <option value="">— Välj —</option>
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <label className="col-span-2 block">
          <FieldLabel>Kommentar (valfritt)</FieldLabel>
          <textarea
            value={lossComment}
            onChange={(e) => setLossComment(e.target.value)}
            placeholder="Vad lärde vi oss?"
            className={`${FIELD_CLASSES} min-h-[60px] resize-y`}
          />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={() => onSave({ competitorName, lossReason, lossComment })}
          className="rounded-lg bg-ink px-4 py-1.5 text-xs font-semibold text-white
                     transition-colors hover:bg-accent-ink"
        >
          Spara detaljer
        </button>
        <button
          onClick={onSkip}
          className="text-xs text-ink-mute underline hover:no-underline"
        >
          Hoppa över
        </button>
      </div>
    </div>
  );
}
