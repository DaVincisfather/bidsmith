"use client";

import { useState } from "react";
import { GoNoGoResult, GoNoGoRecommendation, ImprovementSuggestion } from "@/lib/types";

const TEAM_PEDAGOGY_TEXT =
  "Matchningen rankar individer mot kraven. Här bedöms teamet som helhet — täckning och sammansättning — därför kan byten föreslås även när de bäst matchade individerna är valda. Spannet är ett AI-estimat med stor osäkerhet.";

interface GoNoGoResultProps {
  result: GoNoGoResult;
  assessmentId: string;
  /** Page-level action buttons (generate/open/unlock) — supplied by the caller. */
  actions: React.ReactNode;
  /** When set, actionable improvement cards render a "Testa bytet" button. */
  onApplySwap?: (imp: ImprovementSuggestion) => void;
  swapDisabled?: boolean;
  /** The swapIds signature that would undo the swap just applied — a matching
   *  suggestion card renders an explanation instead of the apply button. */
  undoSwapSignature?: { removeId: string; addId: string } | null;
}

function recommendationLabel(rec: GoNoGoRecommendation): string {
  switch (rec) {
    case "go":
      return "Go";
    case "no-go":
      return "No-Go";
    case "go-with-reservations":
      return "Go med förbehåll";
  }
}

function recommendationColor(rec: GoNoGoRecommendation): string {
  switch (rec) {
    case "go":
      return "bg-green-100 text-green-800 border-green-300";
    case "no-go":
      return "bg-red-100 text-red-800 border-red-300";
    case "go-with-reservations":
      return "bg-yellow-100 text-yellow-800 border-yellow-300";
  }
}

function probabilityColor(p: number): string {
  if (p === 0) return "text-ink bg-paper-2";
  if (p >= 70) return "text-green-700 bg-green-50";
  if (p >= 40) return "text-yellow-700 bg-yellow-50";
  return "text-red-700 bg-red-50";
}

export function GoNoGoResultView({
  result,
  actions,
  onApplySwap,
  swapDisabled,
  undoSwapSignature,
}: GoNoGoResultProps) {
  const allMustMet = result.mustRequirements.every((r) => r.met);
  const [showPedagogy, setShowPedagogy] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-display font-normal">Go/No-Go-bedömning</h3>
        <span
          className={`px-3 py-1 rounded-full text-sm font-medium border ${recommendationColor(result.recommendation)}`}
        >
          {recommendationLabel(result.recommendation)}
        </span>
      </div>

      {/* Win probability */}
      <div className={`rounded-lg p-4 ${probabilityColor(result.winProbability)}`}>
        <div className="text-3xl font-bold">{result.winProbability}%</div>
        <div className="text-sm mt-1">
          Uppskattad vinstchans
          {/* text-xs, inte opacity: opacity blandar mot bakgrunden och sänker
              kontrasten under AA (#112-fyndet, samma klass) — nedtoning via
              storlek behåller den uppmätta AA-kontrasten i alla färglägen. */}
          <span className="text-xs"> (AI-estimat)</span>
        </div>
        <p className="text-sm mt-2">{result.winProbabilityReasoning}</p>
      </div>

      {/* Must requirements */}
      <div>
        <h4 className="text-sm font-semibold text-ink-soft mb-2">Ska-krav</h4>
        <div className="space-y-1">
          {result.mustRequirements.map((req, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 text-sm px-3 py-2 rounded ${
                req.met ? "bg-green-50" : "bg-red-50"
              }`}
            >
              <span className="shrink-0 mt-0.5">{req.met ? "✓" : "✗"}</span>
              <div>
                <span className={req.met ? "text-green-800" : "text-red-800"}>
                  {req.requirement}
                </span>
                {req.coveredBy && (
                  <span className="text-ink-mute ml-1">— {req.coveredBy}</span>
                )}
              </div>
            </div>
          ))}
        </div>
        {!allMustMet && (
          <p className="text-sm text-red-600 mt-2 font-medium">
            Ska-krav saknas — vinstchansen bedöms som 0%.
          </p>
        )}
      </div>

      {/* Strengths */}
      {result.strengths.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-ink-soft mb-2">Styrkor</h4>
          <ul className="space-y-1">
            {result.strengths.map((s, i) => (
              <li key={i} className="text-sm text-ink-soft flex items-start gap-2">
                <span className="text-green-500 shrink-0 mt-0.5">+</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Gaps */}
      {result.gaps.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-ink-soft mb-2">Luckor</h4>
          <ul className="space-y-1">
            {result.gaps.map((g, i) => (
              <li key={i} className="text-sm text-ink-soft flex items-start gap-2">
                <span className="text-red-400 shrink-0 mt-0.5">-</span>
                {g}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Improvement suggestions */}
      {(result.improvements.length > 0 || result.poolGap) && (
        <div>
          {result.improvements.length > 0 && (
            <>
              <h4 className="text-sm font-semibold text-ink-soft mb-2 flex items-center gap-1.5">
                Förbättringsförslag
                {/* Pedagogik (smoke-fynd 4, 2026-08-12): individmatchning ≠
                    teamkomposition — utan förklaringen läser förslagen som
                    "ni valde fel", fast användaren valde de bäst matchade.
                    Knapp (inte hover-title): touch-användare måste kunna öppna
                    texten (routine-fynd #117); title behålls för hover. */}
                <button
                  type="button"
                  onClick={() => setShowPedagogy((v) => !v)}
                  aria-expanded={showPedagogy}
                  aria-label="Varför föreslås byten?"
                  title={TEAM_PEDAGOGY_TEXT}
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full
                             border border-ink-mute/50 text-[10px] font-normal text-ink-mute
                             cursor-help select-none hover:border-ink hover:text-ink
                             transition-colors"
                >
                  i
                </button>
              </h4>
              {showPedagogy && (
                <p className="mb-2 text-sm text-ink-mute">{TEAM_PEDAGOGY_TEXT}</p>
              )}
              <div className="space-y-2">
                {result.improvements.map((imp, i) => {
                  const isAdd = imp.swap?.add != null && imp.swap?.remove == null;
                  if (!imp.swap?.add || (!isAdd && !imp.swap?.remove)) return null;
                  const isUndo =
                    !!undoSwapSignature &&
                    imp.swapIds?.removeId === undoSwapSignature.removeId &&
                    imp.swapIds?.addId === undoSwapSignature.addId;
                  return (
                    <div
                      key={i}
                      className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm"
                    >
                      <div className="font-medium text-blue-900">
                        {isAdd ? (
                          <>Lägg till {imp.swap.add}</>
                        ) : (
                          <>Byt {imp.swap.remove} → {imp.swap.add}</>
                        )}{" "}
                        <span className="text-blue-600">
                          {/* Nya rader bär ett spann ("+4–7 %") — tilde vore
                              dubbel osäkerhetsmarkör. Legacy-punktestimat
                              behåller sin "~". */}
                          {imp.estimatedImpactMin != null
                            ? imp.estimatedImpact
                            : `~${imp.estimatedImpact}`}
                          <span className="text-blue-700 text-xs"> (AI-estimat)</span>
                        </span>
                      </div>
                      <p className="text-blue-800 mt-1">{imp.reason}</p>
                      {isUndo ? (
                        <p className="mt-2 text-xs italic text-blue-700">
                          Detta skulle ångra bytet du just gjorde — skillnaden ligger inom
                          bedömningens brusnivå.
                        </p>
                      ) : (
                        onApplySwap &&
                        imp.swapIds?.addId &&
                        (isAdd || imp.swapIds?.removeId) && (
                          <button
                            onClick={() => onApplySwap(imp)}
                            disabled={swapDisabled}
                            className="mt-2 border border-blue-300 text-blue-900 px-3 py-1.5 rounded-lg
                                       text-sm font-medium hover:bg-blue-100 disabled:opacity-50
                                       disabled:cursor-not-allowed transition-colors"
                          >
                            {isAdd ? "Testa tillägget" : "Testa bytet"}
                          </button>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {result.poolGap && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-900">
              {result.improvements.length > 0 ? (
                <>
                  <span className="font-medium">Kvarstående gap</span> (täcks inte av
                  förslagen ovan): {result.poolGap}
                </>
              ) : (
                <>
                  <span className="font-medium">Poolen räcker inte:</span> {result.poolGap}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Reasoning */}
      <div className="border-t border-rule pt-4">
        <p className="text-sm text-ink-soft">{result.reasoning}</p>
      </div>

      {/* Actions */}
      <div className="flex gap-3">{actions}</div>
    </div>
  );
}
