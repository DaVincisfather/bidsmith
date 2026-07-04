"use client";

import { useState } from "react";
import { RfpAnalysis } from "@/lib/types";
import { qualificationRequirements, deliverableRequirements } from "@/lib/requirement-kind";
import { hasAnyEvidence, badgeState } from "@/lib/evidence-badge";
import { KallaChip, FlaggedPill } from "@/components/kalla-chip";

interface AnalysisResultProps {
  analysis: RfpAnalysis;
  fileName: string;
}

const PRIORITY_LABELS: Record<string, string> = {
  must: "Ska",
  should: "Bör",
  nice: "Meriterande",
};

const PRIORITY_CLASSES: Record<string, string> = {
  must: "bg-red-50 text-red-700 border-red-100",
  should: "bg-amber-50 text-amber-700 border-amber-100",
  nice: "bg-emerald-50 text-emerald-700 border-emerald-100",
};

export function AnalysisResult({ analysis, fileName }: AnalysisResultProps) {
  const [expanded, setExpanded] = useState(false);
  const hasBackground = Boolean(analysis.background?.trim());
  // Ska/bör-krav = äkta kvalifikationskrav; leverabler visas separat. Delad util så
  // partitionsregeln inte driftar mellan vy, go/no-go och bid-bundles.
  const qualifications = qualificationRequirements(analysis.requirements);
  const deliverables = deliverableRequirements(analysis.requirements);
  // Legacy-grind: bär ingen post i HELA analysen evidens är den skapad före evidens-
  // featuren — visa då inga badges alls (en vägg av "obelagd" vore vilseledande).
  const showBadges = hasAnyEvidence(analysis.requirements);

  return (
    <div className="space-y-10">
      {/* Header */}
      <header>
        <p className="text-xs font-mono text-ink-mute mb-2">{fileName}</p>
        <h1 className="text-3xl font-display font-normal tracking-tight text-ink">
          {analysis.title}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {analysis.client && (
            <span className="text-ink-soft">
              <span className="text-ink-mute">Kund</span>{" "}
              <span className="font-medium">{analysis.client}</span>
            </span>
          )}
          {analysis.deadline && (
            <span className="text-ink-soft">
              <span className="text-ink-mute">Deadline</span>{" "}
              <span className="font-medium">{analysis.deadline}</span>
            </span>
          )}
          {analysis.estimatedScope && (
            <span className="text-ink-soft">
              <span className="text-ink-mute">Omfattning</span>{" "}
              <span className="font-medium">{analysis.estimatedScope}</span>
            </span>
          )}
        </div>
      </header>

      {/* Sammanfattning — callout, drar blicken */}
      <section>
        <div className="border-l-2 border-accent pl-5 py-1">
          <p className="text-base leading-relaxed text-ink">
            {analysis.summary}
          </p>
          {expanded && hasBackground && (
            <p className="text-sm leading-relaxed text-ink-soft mt-3">
              {analysis.background}
            </p>
          )}
          {hasBackground && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="mt-3 text-xs text-ink-mute hover:text-ink underline-offset-2 hover:underline"
            >
              {expanded ? "Visa mindre" : "Se mer"}
            </button>
          )}
        </div>
      </section>

      {/* Kravmatris */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-[11px] font-mono font-semibold uppercase tracking-wider text-ink-mute">
            Ska-/bör-krav
          </h2>
          <span className="text-xs text-ink-mute">
            {qualifications.length} krav
          </span>
        </div>
        <div className="border-t border-rule">
          {qualifications.map((req, i) => (
            <div
              key={i}
              className="border-b border-rule py-3 grid grid-cols-[84px_1fr] sm:grid-cols-[84px_140px_1fr] gap-x-4 gap-y-1 items-start"
            >
              <span
                className={`text-[11px] font-medium px-2 py-0.5 rounded border inline-flex items-center justify-center w-fit ${PRIORITY_CLASSES[req.priority] ?? "bg-paper-2 text-ink-soft border-rule"}`}
              >
                {PRIORITY_LABELS[req.priority] ?? req.priority}
              </span>
              <span className="hidden sm:block text-xs text-ink-mute pt-1">
                {req.category}
              </span>
              <div className="col-span-2 sm:col-span-1">
                <p className="inline text-sm text-ink-soft leading-relaxed">
                  {req.description}
                </p>{" "}
                {badgeState(req.evidence, showBadges) === "kalla" && (
                  <KallaChip quote={req.evidence!} label={req.description.slice(0, 60)} />
                )}
                {badgeState(req.evidence, showBadges) === "flagged" && <FlaggedPill />}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Leveranser — vad uppdraget ska producera (separerat från ska/bör-krav; hör
          hemma i genomförandeplanen, inte i kravmatrisen). */}
      {deliverables.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-[11px] font-mono font-semibold uppercase tracking-wider text-ink-mute">
              Leveranser
            </h2>
            <span className="text-xs text-ink-mute">{deliverables.length} leverabler</span>
          </div>
          <div className="border-t border-rule">
            {deliverables.map((req, i) => (
              <div
                key={i}
                className="border-b border-rule py-3 grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-x-4 gap-y-1 items-start"
              >
                <span className="hidden sm:block text-xs text-ink-mute pt-0.5">
                  {req.category}
                </span>
                <p className="text-sm text-ink-soft leading-relaxed">{req.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Utvärderingskriterier */}
      {analysis.evaluationCriteria.length > 0 && (
        <section>
          <h2 className="text-[11px] font-mono font-semibold uppercase tracking-wider text-ink-mute mb-3">
            Utvärderingskriterier
          </h2>
          <div className="border-t border-rule">
            {analysis.evaluationCriteria.map((crit, i) => (
              <div
                key={i}
                className="border-b border-rule py-3 flex items-start gap-4"
              >
                <span className="text-xs font-mono text-ink-mute w-12 shrink-0 pt-1">
                  {crit.weight !== null ? `${crit.weight}%` : "—"}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {crit.name}
                  </p>
                  <p className="text-sm text-ink-soft mt-0.5 leading-relaxed">
                    {crit.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Kompetenser */}
      {analysis.requiredCompetencies.length > 0 && (
        <section>
          <h2 className="text-[11px] font-mono font-semibold uppercase tracking-wider text-ink-mute mb-3">
            Efterfrågade kompetenser
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {analysis.requiredCompetencies.map((comp, i) => (
              <span
                key={i}
                className="text-xs text-ink-soft bg-paper-2 px-2 py-1 rounded"
              >
                {comp}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Att observera */}
      {analysis.redFlags.length > 0 && (
        <section>
          <h2 className="text-[11px] font-mono font-semibold uppercase tracking-wider text-ink-mute mb-3">
            Att observera
          </h2>
          <div className="border-l-2 border-amber-400 pl-4 space-y-2">
            {analysis.redFlags.map((flag, i) => (
              <p key={i} className="text-sm text-ink-soft leading-relaxed">
                {flag}
              </p>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
