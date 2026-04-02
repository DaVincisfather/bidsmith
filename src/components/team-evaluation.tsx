interface RequirementCoverage {
  met: number;
  total: number;
  details: string[];
}

interface TeamEvaluationData {
  overallFit: string;
  gaps: string[];
  requirementCoverage: {
    must: RequirementCoverage;
    should: RequirementCoverage;
    niceToHave: RequirementCoverage;
  };
}

interface TeamEvaluationProps {
  evaluation: TeamEvaluationData;
  comparison?: string;
}

function CoverageBar({ label, coverage }: { label: string; coverage: RequirementCoverage }) {
  const pct = coverage.total > 0 ? Math.round((coverage.met / coverage.total) * 100) : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-gray-500">
          {coverage.met}/{coverage.total} ({pct}%)
        </span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-gray-900 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      {coverage.details?.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {coverage.details.map((d, i) => (
            <li key={i} className="text-xs text-gray-500">{d}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TeamEvaluation({ evaluation, comparison }: TeamEvaluationProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Teambedömning</h3>

      {/* Comparison banner */}
      {comparison && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded text-sm">
          {comparison}
        </div>
      )}

      {/* Overall fit */}
      <p className="text-gray-700">{evaluation.overallFit}</p>

      {/* Requirement coverage */}
      <div className="space-y-3">
        <CoverageBar label="Ska-krav" coverage={evaluation.requirementCoverage.must} />
        <CoverageBar label="Bör-krav" coverage={evaluation.requirementCoverage.should} />
        <CoverageBar label="Meriterande" coverage={evaluation.requirementCoverage.niceToHave} />
      </div>

      {/* Gaps */}
      {evaluation.gaps.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-1">Saknas i teamet</h4>
          <ul className="space-y-1">
            {evaluation.gaps.map((gap, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="text-amber-500 shrink-0">!</span>
                <span className="text-gray-600">{gap}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
