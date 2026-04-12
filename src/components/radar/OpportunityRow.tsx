"use client";

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
  if (score === null) return "#ccc";
  if (score >= 80) return "#1F5E63";
  if (score >= 50) return "#8FAF9A";
  return "#ccc";
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
  const isLowRelevance = relevanceScore !== null && relevanceScore < 50;
  const isAnalyzing = status === "analyzing";

  return (
    <div
      className="flex items-center px-4 py-3 border-b border-gray-100"
      style={{ opacity: isLowRelevance ? 0.6 : 1 }}
    >
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
        style={{ backgroundColor: scoreColor(relevanceScore) }}
      >
        {relevanceScore ?? "–"}
      </div>
      <div className="ml-3 flex-1 min-w-0">
        <div className="font-semibold text-sm truncate">{title}</div>
        <div className="text-xs text-gray-500 mt-0.5">
          {buyer ?? "Okänd köpare"} &bull; {formatDeadline(deadline)}
          {estimatedValue ? ` \u2022 ${formatValue(estimatedValue)}` : ""}
        </div>
      </div>
      <div className="flex gap-2 shrink-0 ml-3">
        {isAnalyzing && analysisId ? (
          <a href={`/analysis/${analysisId}`} className="text-xs px-3 py-1.5 rounded-md bg-[#1F5E63] text-white">
            Visa analys
          </a>
        ) : (
          <button onClick={() => onAnalyze(id)} disabled={isAnalyzing} className="text-xs px-3 py-1.5 rounded-md bg-[#1F5E63] text-white disabled:opacity-50">
            {isAnalyzing ? "Analyserar..." : "Analysera"}
          </button>
        )}
        {status !== "dismissed" && (
          <button onClick={() => onDismiss(id)} className="text-xs px-3 py-1.5 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50">
            Avfärda
          </button>
        )}
        {tedUrl && (
          <a href={tedUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#1F5E63] self-center ml-1">
            TED &#8599;
          </a>
        )}
      </div>
    </div>
  );
}
