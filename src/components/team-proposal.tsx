"use client";

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
  proposal: TeamProposalData;
  allConsultants: AllConsultant[];
  onLocalSwap: (newProposal: TeamProposalData) => void;
  dirty: boolean;
}

const LEVEL_ORDER = ["senior", "intermediate", "junior"] as const;
const LEVEL_LABELS: Record<string, string> = {
  senior: "Senior",
  intermediate: "Medel",
  junior: "Junior",
};

export function TeamProposal({
  proposal,
  allConsultants,
  onLocalSwap,
  dirty,
}: TeamProposalProps) {
  function handleSwap(level: string, index: number, newConsultantId: string) {
    const consultant = allConsultants.find((c) => c.id === newConsultantId);
    if (!consultant) return;

    const levelKey = level as keyof TeamProposalData;
    const updated = [...proposal[levelKey]];
    updated[index] = {
      ...updated[index],
      consultantId: newConsultantId,
      consultantName: consultant.name,
    };

    onLocalSwap({
      ...proposal,
      [levelKey]: updated,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h3 className="text-lg font-semibold">Teamförslag</h3>
        {dirty && (
          <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">
            Ej utvärderat
          </span>
        )}
      </div>
      {LEVEL_ORDER.map((level) => {
        const matches = proposal[level];
        if (matches.length === 0) return null;

        const available = allConsultants.filter((c) => c.level === level);

        return (
          <div key={level} className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
              <span className="font-medium">{LEVEL_LABELS[level]}</span>
              <span className="text-sm text-gray-400">{matches.length} konsult(er)</span>
            </div>

            <div className="divide-y divide-gray-100">
              {matches.map((match, idx) => (
                <div key={`${level}-${idx}`} className="px-4 py-3">
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
