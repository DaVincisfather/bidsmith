"use client";

interface ScoredConsultant {
  consultantId: string;
  consultantName: string;
  level: string;
  score: number;
  reasoning: string;
}

interface TeamProposalProps {
  scoredConsultants: ScoredConsultant[];
  selectedIds: Set<string>;
  onToggle: (consultantId: string) => void;
  disabled?: boolean;
}

const LEVEL_ORDER = ["expert", "senior", "intermediate", "junior"] as const;
const LEVEL_LABELS: Record<string, string> = {
  expert: "Expert",
  senior: "Senior",
  intermediate: "Medel",
  junior: "Junior",
};

function scoreColor(score: number): string {
  if (score >= 80) return "bg-green-100 text-green-700";
  if (score >= 60) return "bg-blue-100 text-blue-700";
  if (score >= 40) return "bg-yellow-100 text-yellow-700";
  return "bg-gray-100 text-gray-500";
}

export function TeamProposal({
  scoredConsultants,
  selectedIds,
  onToggle,
  disabled = false,
}: TeamProposalProps) {
  const byLevel: Record<string, ScoredConsultant[]> = {};
  for (const c of scoredConsultants) {
    if (!byLevel[c.level]) byLevel[c.level] = [];
    byLevel[c.level].push(c);
  }

  // Sort each level by score desc
  for (const level of Object.keys(byLevel)) {
    byLevel[level].sort((a, b) => b.score - a.score);
  }

  const teamCount = selectedIds.size;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Teamförslag</h3>
        <span className="text-sm text-gray-500">
          {teamCount} konsult{teamCount !== 1 ? "er" : ""} valda
        </span>
      </div>

      {LEVEL_ORDER.map((level) => {
        const consultants = byLevel[level];
        if (!consultants || consultants.length === 0) return null;

        return (
          <div key={level} className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2 bg-gray-50 flex items-center justify-between">
              <span className="font-medium text-sm">{LEVEL_LABELS[level]}</span>
              <span className="text-xs text-gray-400">
                {consultants.filter((c) => selectedIds.has(c.consultantId)).length} / {consultants.length}
              </span>
            </div>

            <div className="divide-y divide-gray-100">
              {consultants.map((c) => {
                const selected = selectedIds.has(c.consultantId);
                return (
                  <div
                    key={c.consultantId}
                    className={`px-4 py-3 flex items-start gap-3 ${
                      selected ? "bg-blue-50/50" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => onToggle(c.consultantId)}
                      disabled={disabled}
                      className="mt-1 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm ${selected ? "font-medium" : "text-gray-600"}`}>
                          {c.consultantName}
                        </span>
                        <span className={`text-xs font-mono px-2 py-0.5 rounded shrink-0 ${scoreColor(c.score)}`}>
                          {c.score}/100
                        </span>
                      </div>
                      {selected && (
                        <p className="text-sm text-gray-500 mt-1">{c.reasoning}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
