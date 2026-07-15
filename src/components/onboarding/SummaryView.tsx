"use client";

import type { DraftSlot } from "@/lib/pptx-template/onboarding/draft";
import { fastSlideSources } from "@/lib/pptx-template/onboarding/draft-logic";

interface SummaryViewProps {
  slots: DraftSlot[];
  confirmed: number;
  saving: boolean;
  uiError: string | null;
  onBack: () => void;
  onComplete: () => void;
}

function decisionLabel(decision: DraftSlot["decision"]): string {
  if (decision === "confirmed") return "Bekräftad";
  if (decision === "skipped") return "Skippad";
  return "Ej beslutad";
}

export function SummaryView({ slots, confirmed, saving, uiError, onBack, onComplete }: SummaryViewProps) {
  const pending = slots.filter((s) => s.decision === "pending").length;
  // Visas explicit så fast-beslutet syns innan onboardingen låses.
  const fastSlides = fastSlideSources(slots);
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-display">Sammanfattning</h2>
      {pending > 0 && (
        <div className="bg-amber-50 border border-amber-300 text-amber-900 px-4 py-3 rounded text-sm">
          {pending === 1
            ? "1 textruta är ej beslutad — den lämnas orörd i mallen (samma som Skippa)."
            : `${pending} textrutor är ej beslutade — de lämnas orörda i mallen (samma som Skippa).`}
        </div>
      )}
      {fastSlides.length > 0 && (
        <p className="text-sm text-ink-soft">
          Fasta slides (originaltexten behålls i alla anbud): {fastSlides.map((n) => `#${n}`).join(", ")}
        </p>
      )}
      <table className="w-full text-sm border border-rule rounded-lg overflow-hidden">
        <thead className="bg-paper-2">
          <tr>
            <th className="text-left px-3 py-2 font-medium text-ink-soft">Slide</th>
            <th className="text-left px-3 py-2 font-medium text-ink-soft">Token</th>
            <th className="text-left px-3 py-2 font-medium text-ink-soft">Syfte</th>
            <th className="text-left px-3 py-2 font-medium text-ink-soft">Beslut</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-rule">
          {slots.map((s) => (
            <tr key={`${s.source}:${s.shapeIndex}`}>
              <td className="px-3 py-2 text-ink-soft">#{s.source}</td>
              <td className="px-3 py-2">{s.token}</td>
              <td className="px-3 py-2 text-ink-soft">{s.intent}</td>
              <td className="px-3 py-2">{decisionLabel(s.decision)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {uiError && <p className="text-sm text-red-700">{uiError}</p>}
      <div className="flex gap-3">
        <button type="button" onClick={onBack}
          className="border border-rule py-2 px-4 rounded font-medium text-sm hover:border-accent">
          Tillbaka
        </button>
        <button type="button" onClick={onComplete} disabled={saving || confirmed === 0}
          title={confirmed === 0 ? "minst en textruta måste bekräftas" : undefined}
          className="bg-ink text-white py-2 px-6 rounded font-medium text-sm hover:bg-accent-ink disabled:opacity-50">
          {saving ? "Slutför…" : `Slutför onboarding (${confirmed} bekräftade)`}
        </button>
      </div>
    </div>
  );
}
