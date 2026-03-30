import { RfpAnalysis } from "@/lib/types";

interface AnalysisResultProps {
  analysis: RfpAnalysis;
  fileName: string;
}

export function AnalysisResult({ analysis, fileName }: AnalysisResultProps) {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <p className="text-sm text-gray-400 mb-1">{fileName}</p>
        <h1 className="text-2xl font-bold">{analysis.title}</h1>
        <div className="flex gap-4 mt-2 text-sm text-gray-500">
          {analysis.client && <span>Kund: {analysis.client}</span>}
          {analysis.deadline && <span>Deadline: {analysis.deadline}</span>}
        </div>
      </div>

      {/* Summary */}
      <section>
        <h2 className="text-lg font-semibold mb-2">Sammanfattning</h2>
        <p className="text-gray-700">{analysis.summary}</p>
      </section>

      {/* Estimated Scope */}
      {analysis.estimatedScope && (
        <section>
          <h2 className="text-lg font-semibold mb-2">Uppskattad omfattning</h2>
          <p className="text-gray-700">{analysis.estimatedScope}</p>
        </section>
      )}

      {/* Requirements */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Krav</h2>
        <div className="space-y-2">
          {analysis.requirements.map((req, i) => (
            <div
              key={i}
              className="flex items-start gap-3 p-3 bg-gray-50 rounded"
            >
              <span
                className={`text-xs font-medium px-2 py-1 rounded shrink-0 ${
                  req.priority === "must"
                    ? "bg-red-100 text-red-700"
                    : req.priority === "should"
                      ? "bg-yellow-100 text-yellow-700"
                      : "bg-green-100 text-green-700"
                }`}
              >
                {req.priority === "must"
                  ? "Ska"
                  : req.priority === "should"
                    ? "Bor"
                    : "Meriterande"}
              </span>
              <div>
                <span className="text-xs text-gray-400">{req.category}</span>
                <p className="text-sm">{req.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Evaluation Criteria */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Utvarderingskriterier</h2>
        <div className="space-y-3">
          {analysis.evaluationCriteria.map((crit, i) => (
            <div key={i} className="p-3 bg-gray-50 rounded">
              <div className="flex justify-between items-center mb-1">
                <span className="font-medium">{crit.name}</span>
                <span className="text-sm font-mono bg-gray-200 px-2 py-0.5 rounded">
                  {crit.weight}%
                </span>
              </div>
              <p className="text-sm text-gray-600">{crit.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Competencies */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Efterfragade kompetenser</h2>
        <div className="flex flex-wrap gap-2">
          {analysis.requiredCompetencies.map((comp, i) => (
            <span
              key={i}
              className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm"
            >
              {comp}
            </span>
          ))}
        </div>
      </section>

      {/* Red Flags */}
      {analysis.redFlags.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Att observera</h2>
          <ul className="space-y-1">
            {analysis.redFlags.map((flag, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="text-amber-500 shrink-0">!</span>
                <span className="text-gray-700">{flag}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
