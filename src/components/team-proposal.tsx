"use client";

import { useState } from "react";

interface ConsultantMatch {
  consultantId: string;
  consultantName: string;
  level: string;
  score: number;
  reasoning: string;
}

interface TeamProposalData {
  senior: ConsultantMatch[];
  intermediate: ConsultantMatch[];
  junior: ConsultantMatch[];
}

interface AllConsultant {
  id: string;
  name: string;
  level: string;
}

interface TeamProposalProps {
  matchId: string;
  proposal: TeamProposalData;
  allConsultants: AllConsultant[];
  onSwap: (matchId: string, newProposal: TeamProposalData) => void;
  swapping: boolean;
}

const LEVEL_ORDER = ["senior", "intermediate", "junior"] as const;
const LEVEL_LABELS: Record<string, string> = {
  senior: "Senior",
  intermediate: "Medel",
  junior: "Junior",
};

export function TeamProposal({
  matchId,
  proposal,
  allConsultants,
  onSwap,
  swapping,
}: TeamProposalProps) {
  const [expandedLevel, setExpandedLevel] = useState<string | null>(null);

  function handleSwap(level: string, index: number, newConsultantId: string) {
    const consultant = allConsultants.find((c) => c.id === newConsultantId);
    if (!consultant) return;

    const newProposal = { ...proposal };
    const levelKey = level as keyof TeamProposalData;
    const updated = [...newProposal[levelKey]];
    updated[index] = {
      ...updated[index],
      consultantId: newConsultantId,
      consultantName: consultant.name,
    };
    newProposal[levelKey] = updated;

    onSwap(matchId, newProposal);
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Teamförslag</h3>
      {LEVEL_ORDER.map((level) => {
        const matches = proposal[level];
        if (matches.length === 0) return null;

        const available = allConsultants.filter((c) => c.level === level);

        return (
          <div key={level} className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setExpandedLevel(expandedLevel === level ? null : level)}
              className="w-full px-4 py-3 bg-gray-50 flex items-center justify-between text-left"
            >
              <span className="font-medium">{LEVEL_LABELS[level]}</span>
              <span className="text-sm text-gray-400">{matches.length} konsult(er)</span>
            </button>

            <div className="divide-y divide-gray-100">
              {matches.map((match, idx) => (
                <div key={match.consultantId} className="px-4 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-3">
                      <span className="font-medium">{match.consultantName}</span>
                      <span className="text-xs font-mono bg-gray-200 px-2 py-0.5 rounded">
                        {match.score}/100
                      </span>
                    </div>
                    <select
                      value={match.consultantId}
                      onChange={(e) => handleSwap(level, idx, e.target.value)}
                      disabled={swapping}
                      className="text-xs border border-gray-200 rounded px-2 py-1"
                    >
                      {available.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="text-sm text-gray-600">{match.reasoning}</p>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
