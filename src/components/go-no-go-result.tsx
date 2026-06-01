"use client";

import { GoNoGoResult, GoNoGoRecommendation } from "@/lib/types";

interface GoNoGoResultProps {
  result: GoNoGoResult;
  assessmentId: string;
  onUnlock: () => void;
  onProceedToBid: () => void;
  bidLoading?: boolean;
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
  onUnlock,
  onProceedToBid,
  bidLoading,
}: GoNoGoResultProps) {
  const allMustMet = result.mustRequirements.every((r) => r.met);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Go/No-Go-bedömning</h3>
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
          <span className="opacity-60"> (AI-estimat)</span>
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
      {result.improvements.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-ink-soft mb-2">
            Förbättringsförslag
          </h4>
          <div className="space-y-2">
            {result.improvements.map((imp, i) => (
              <div
                key={i}
                className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm"
              >
                <div className="font-medium text-blue-900">
                  Byt {imp.swap.remove} → {imp.swap.add}{" "}
                  <span className="text-blue-600">{imp.estimatedImpact}</span>
                </div>
                <p className="text-blue-800 mt-1">{imp.reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reasoning */}
      <div className="border-t border-rule pt-4">
        <p className="text-sm text-ink-soft">{result.reasoning}</p>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onUnlock}
          className="flex-1 border border-rule text-ink-soft px-4 py-2 rounded-lg text-sm font-medium
                     hover:bg-paper-2 transition-colors"
        >
          Tillbaka till team
        </button>
        <button
          onClick={onProceedToBid}
          disabled={bidLoading}
          className="flex-1 bg-ink text-white px-4 py-2 rounded-lg text-sm font-medium
                     hover:bg-accent-ink disabled:bg-rule disabled:cursor-not-allowed transition-colors"
        >
          {bidLoading ? "Genererar anbud..." : "Gå vidare till anbud"}
        </button>
      </div>
    </div>
  );
}
