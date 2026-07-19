"use client";

import { useState } from "react";

interface MeasurementStepProps {
  templateId: string;
}

/** Onboardad mall utan mätning — visas mellan "complete" (draft → onboarded)
 *  och det lokala COM-mätpasset (onboarding-measure design 2026-07-19).
 *  Presentationell: ingen fetch här, wizarden pollar GET var 10:e sekund
 *  tills measurement dyker upp (samma mönster som klassificeringspollen). */
export function MeasurementStep({ templateId }: MeasurementStepProps) {
  const [copied, setCopied] = useState(false);
  const command = `npm run onboarding:measure -- ${templateId} --write`;

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Urklipp kan nekas av webbläsaren — knappen blir bara overksam, inget
      // att visa användaren för (kommandot står redan synligt i rutan).
    }
  }

  return (
    <div className="border border-rule rounded-lg p-6 max-w-xl space-y-4">
      <p className="text-sm font-medium">Mallen behöver mätas lokalt</p>
      <p className="text-sm text-ink-soft">
        Bidsmith mäter mallens textrutor mot verklig PowerPoint-rendering för att
        hitta mallens egna defekter innan aktivering. Kör kommandot nedan på en
        dator med PowerPoint installerat — <strong>PowerPoint måste vara stängt</strong>{" "}
        under körningen. Passet tar några minuter.
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 bg-paper-2 border border-rule rounded px-3 py-2 text-xs font-mono overflow-x-auto">
          {command}
        </code>
        <button
          type="button"
          onClick={copyCommand}
          className="border border-rule py-2 px-3 rounded text-xs font-medium hover:border-accent shrink-0"
        >
          {copied ? "Kopierat ✓" : "Kopiera"}
        </button>
      </div>
      <p className="text-sm text-ink-mute">
        Sidan uppdateras automatiskt när mätningen är klar.
      </p>
    </div>
  );
}
