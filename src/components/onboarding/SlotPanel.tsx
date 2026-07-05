"use client";

import { useState } from "react";
import type { DraftSlot } from "@/lib/pptx-template/onboarding/draft";

interface SlotPanelProps {
  slot: DraftSlot;
  onDecide: (input: { decision: "confirmed" | "skipped"; token?: string; intent?: string }) => void;
  saving: boolean;
}

/** Strippar klamrar för redigering — användaren skriver namnet, vi bär {}-formatet. */
function tokenName(token: string): string {
  return token.replace(/^\{|\}$/g, "");
}

export function SlotPanel({ slot, onDecide, saving }: SlotPanelProps) {
  // Vald slot byts via key-remount i wizarden (key={source:shapeIndex}) — därför
  // räcker useState-initialvärdet, ingen synk-effekt behövs (och den skulle trigga
  // react-hooks/set-state-in-effect).
  const [name, setName] = useState(tokenName(slot.token));
  const [intent, setIntent] = useState(slot.intent);

  return (
    <div className="space-y-4 border border-rule rounded-lg p-4 bg-paper-2">
      <div>
        <p className="text-xs uppercase tracking-wide text-ink-mute">Befintlig text i rutan</p>
        <p className="mt-1 text-sm text-ink-soft whitespace-pre-wrap">{slot.shapeText || "(tom)"}</p>
      </div>

      <div>
        <label htmlFor="slot-token" className="block text-sm font-medium text-ink-soft">
          Tokennamn
        </label>
        <input
          id="slot-token"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full border border-rule rounded px-3 py-1.5 text-sm bg-paper"
        />
      </div>

      <div>
        <label htmlFor="slot-intent" className="block text-sm font-medium text-ink-soft">
          Syfte — vad ska AI:n skriva här?
        </label>
        <textarea
          id="slot-intent"
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          rows={3}
          maxLength={500}
          className="mt-1 w-full border border-rule rounded px-3 py-1.5 text-sm bg-paper"
        />
      </div>

      <p className="text-xs text-ink-mute">
        Känns igen som <span className="font-medium">{slot.capability}</span>
        {" · "}konfidens: {slot.confidence === "high" ? "hög" : "låg"}.
        Specialiserad fyllning kommer i en senare version — i v1 skrivs innehållet
        som anpassad prosa utifrån syftet ovan.
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={saving || name.trim().length === 0}
          onClick={() =>
            onDecide({ decision: "confirmed", token: `{${name.trim()}}`, intent })
          }
          className="flex-1 bg-ink text-white py-2 rounded font-medium text-sm
                     hover:bg-accent-ink disabled:opacity-50"
        >
          Bekräfta
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => onDecide({ decision: "skipped" })}
          className="flex-1 border border-rule py-2 rounded font-medium text-sm
                     hover:border-accent disabled:opacity-50"
        >
          Skippa
        </button>
      </div>
    </div>
  );
}
