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

export function OutcomeEnrichmentForm({ outcome, onSave, onSkip }: Props) {
  const [competitorName, setCompetitorName] = useState("");
  const [lossReason, setLossReason] = useState<LossReason | "">("");
  const [lossComment, setLossComment] = useState("");

  const showLossFields = outcome === "lost";

  return (
    <div className="bg-white border border-gray-200 rounded-md p-3.5 mt-2 text-sm">
      <p className="text-xs text-gray-600 italic mb-3">
        💡 Valfria detaljer — tränar modellen. Hoppa över om du inte vet.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {showLossFields && (
          <>
            <label className="block">
              <span className="block text-xs text-gray-700 mb-1 font-medium">Vem vann?</span>
              <input
                value={competitorName}
                onChange={(e) => setCompetitorName(e.target.value)}
                placeholder="Konkurrentens namn"
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
              />
            </label>
            <label className="block">
              <span className="block text-xs text-gray-700 mb-1 font-medium">Varför förlorade vi?</span>
              <select
                value={lossReason}
                onChange={(e) => setLossReason(e.target.value as LossReason | "")}
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
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
        <label className="block col-span-2">
          <span className="block text-xs text-gray-700 mb-1 font-medium">Fri kommentar</span>
          <textarea
            value={lossComment}
            onChange={(e) => setLossComment(e.target.value)}
            placeholder="Vad lärde vi oss?"
            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm min-h-[60px] resize-y"
          />
        </label>
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => onSave({ competitorName, lossReason, lossComment })}
          className="px-3 py-1.5 bg-black text-white rounded text-xs"
        >
          Spara
        </button>
        <button
          onClick={onSkip}
          className="px-3 py-1.5 border border-gray-300 text-gray-600 rounded text-xs"
        >
          Hoppa över
        </button>
      </div>
    </div>
  );
}
