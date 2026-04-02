"use client";

import { ConsultantSearch } from "./consultant-search";

interface ScoredConsultant {
  consultantId: string;
  consultantName: string;
  level: string;
  score: number;
  reasoning: string;
}

interface SelectedTeam {
  senior: ScoredConsultant | null;
  intermediate: ScoredConsultant | null;
  junior: ScoredConsultant | null;
}

interface TeamProposalProps {
  scoredConsultants: ScoredConsultant[];
  selectedTeam: SelectedTeam;
  onSwap: (level: string, consultant: ScoredConsultant) => void;
}

const LEVEL_ORDER = ["senior", "intermediate", "junior"] as const;
const LEVEL_LABELS: Record<string, string> = {
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
  selectedTeam,
  onSwap,
}: TeamProposalProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Teamförslag</h3>
      {LEVEL_ORDER.map((level) => {
        const options = scoredConsultants.filter((c) => c.level === level);
        if (options.length === 0) return null;

        const selected = selectedTeam[level];
        if (!selected) return null;

        return (
          <div key={level} className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
              <span className="font-medium">{LEVEL_LABELS[level]}</span>
              <span className="text-sm text-gray-400">
                {options.length} tillgängliga
              </span>
            </div>

            <div className="px-4 py-3 space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <ConsultantSearch
                    options={options}
                    selected={selected}
                    onSelect={(c) => onSwap(level, c)}
                  />
                </div>
                <span className={`text-xs font-mono px-2 py-1 rounded shrink-0 ${scoreColor(selected.score)}`}>
                  {selected.score}/100
                </span>
              </div>
              <p className="text-sm text-gray-600">{selected.reasoning}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
