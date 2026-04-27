"use client";

import { useState, useTransition } from "react";
import { ACCENT_PRESETS, isValidHex } from "@/lib/organisations";
import { updateAccentAction } from "@/app/organisation/settings/actions";

export function AccentSwatches({ initialAccent }: { initialAccent: string }) {
  const [accent, setAccent] = useState(initialAccent);
  const [hexInput, setHexInput] = useState(initialAccent);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  function handleSwatchClick(hex: string) {
    setAccent(hex);
    setHexInput(hex);
  }

  function handleHexChange(value: string) {
    setHexInput(value);
    if (isValidHex(value)) setAccent(value.toLowerCase());
  }

  function handleSave() {
    if (!isValidHex(hexInput)) {
      setMessage({ type: "error", text: "Ogiltig hex-färg" });
      return;
    }
    const formData = new FormData();
    formData.append("accent_color", hexInput);
    startTransition(async () => {
      const res = await updateAccentAction(formData);
      setMessage(res.ok ? { type: "ok", text: "Accent sparad" } : { type: "error", text: res.error });
    });
  }

  return (
    <div className="border border-gray-200 rounded-lg p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Accentfärg (PPTX)</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Färgen används som accent i exporterade PPTX-anbud. Välj en preset eller klistra in hex.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {ACCENT_PRESETS.map((p) => (
          <button
            type="button"
            key={p.hex}
            aria-label={p.label}
            onClick={() => handleSwatchClick(p.hex)}
            className={
              "w-8 h-8 rounded border-2 transition " +
              (accent.toLowerCase() === p.hex.toLowerCase()
                ? "border-gray-900"
                : "border-gray-200 hover:border-gray-400")
            }
            style={{ background: p.hex }}
          />
        ))}
        <input
          type="text"
          value={hexInput}
          onChange={(e) => handleHexChange(e.target.value)}
          maxLength={7}
          spellCheck={false}
          className="font-mono text-xs border border-gray-300 rounded px-2 py-1 w-24"
          placeholder="#1F2937"
        />
      </div>

      {/* Live preview — HTML/CSS mock-up of how accent looks on a PPTX-style title slide.
          NOT a real PPTX render. */}
      <div className="border border-gray-200 rounded p-3 bg-white">
        <div className="text-xs text-gray-500 mb-2">Förhandsvisning på PPTX-slide:</div>
        <div className="flex items-center gap-3">
          <div className="w-1 h-6 rounded-sm" style={{ background: accent }} />
          <div className="text-sm font-semibold text-gray-900">Anbud till offentlig kund</div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-40"
        >
          Spara accent
        </button>
        {message && (
          <span className={"text-xs " + (message.type === "ok" ? "text-green-700" : "text-red-700")}>
            {message.text}
          </span>
        )}
      </div>
    </div>
  );
}
