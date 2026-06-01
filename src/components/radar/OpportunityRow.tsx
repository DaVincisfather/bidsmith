"use client";

import Link from "next/link";

interface OpportunityRowProps {
  id: string;
  title: string;
  buyer: string | null;
  deadline: string | null;
  estimatedValue: number | null;
  relevanceScore: number | null;
  status: string;
  analysisId: string | null;
  tedUrl: string | null;
  onDismiss: (id: string) => void;
  onAnalyze: (id: string) => void;
}

function scoreColor(score: number | null): string {
  if (score === null) return "var(--rule)";
  if (score >= 80) return "oklch(0.42 0.12 25)";
  if (score >= 50) return "oklch(0.62 0.08 30)";
  return "var(--rule)";
}

function formatValue(value: number | null): string {
  if (value === null) return "";
  if (value >= 1_000_000) return `~${(value / 1_000_000).toFixed(1)} MEUR`;
  if (value >= 1_000) return `~${(value / 1_000).toFixed(0)} kEUR`;
  return `~${value} EUR`;
}

function formatDeadline(deadline: string | null): string {
  if (!deadline) return "Ingen deadline";
  return new Date(deadline).toLocaleDateString("sv-SE");
}

export function OpportunityRow({
  id, title, buyer, deadline, estimatedValue, relevanceScore,
  status, analysisId, tedUrl, onDismiss, onAnalyze,
}: OpportunityRowProps) {
  const isAnalyzing = status === "analyzing";
  const isAnalyzed = status === "analyzed" && !!analysisId;
  const titleHref = analysisId ? `/analysis/${analysisId}` : tedUrl;

  return (
    <div className="flex items-center px-4 py-3 border-b border-rule">
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
        style={{ backgroundColor: scoreColor(relevanceScore) }}
      >
        {relevanceScore ?? "–"}
      </div>
      <div className="ml-3 flex-1 min-w-0">
        {analysisId ? (
          <Link
            href={`/analysis/${analysisId}`}
            className="font-semibold text-sm truncate block hover:text-accent-ink hover:underline"
          >
            {title}
          </Link>
        ) : tedUrl ? (
          <a
            href={tedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-sm truncate block hover:text-accent-ink hover:underline"
          >
            {title}
          </a>
        ) : (
          <div className="font-semibold text-sm truncate">{title}</div>
        )}
        <div className="text-xs text-ink-mute mt-0.5">
          {buyer ?? "Okänd köpare"} &bull; {formatDeadline(deadline)}
          {estimatedValue ? ` \u2022 ${formatValue(estimatedValue)}` : ""}
        </div>
      </div>
      <div className="flex gap-2 shrink-0 ml-3">
        {isAnalyzed ? (
          <Link href={`/analysis/${analysisId}`} className="text-xs px-3 py-1.5 rounded-md bg-accent text-paper">
            Visa analys
          </Link>
        ) : (
          <button onClick={() => onAnalyze(id)} disabled={isAnalyzing} className="text-xs px-3 py-1.5 rounded-md bg-accent text-paper disabled:opacity-50">
            {isAnalyzing ? "Analyserar..." : "Analysera"}
          </button>
        )}
        {status !== "dismissed" && (
          <button onClick={() => onDismiss(id)} className="text-xs px-3 py-1.5 rounded-md border border-rule text-ink-soft hover:bg-paper-2">
            Avfärda
          </button>
        )}
        {tedUrl && (
          <a href={tedUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-accent-ink self-center ml-1">
            TED &#8599;
          </a>
        )}
      </div>
    </div>
  );
}
