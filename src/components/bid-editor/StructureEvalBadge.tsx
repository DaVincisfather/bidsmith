import type { StructureEvalSummary } from "@/lib/eval/bid-structure";

interface StructureEvalBadgeProps {
  eval: StructureEvalSummary | null;
}

function summarize(eval_: StructureEvalSummary): string {
  const failures = Object.entries(eval_.fields)
    .filter(([, v]) => !v.match)
    .map(([k, v]) => `${k.replace("structure.", "")}: ${v.evidence}`);
  return failures.length === 0
    ? "Alla strukturkontroller godkända"
    : failures.join("\n");
}

export function StructureEvalBadge({ eval: structureEval }: StructureEvalBadgeProps) {
  if (!structureEval) {
    return (
      <div
        className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500"
        title="Strukturutvärdering körs inte för detta anbud (skapat före runtime-evaluator)."
      >
        Struktur: ej utvärderad
      </div>
    );
  }

  if (structureEval.pass) {
    return (
      <div
        className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700 ring-1 ring-inset ring-green-200"
        title={summarize(structureEval)}
      >
        Struktur ✓
      </div>
    );
  }

  const failureCount = Object.values(structureEval.fields).filter((v) => !v.match).length;
  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800 ring-1 ring-inset ring-amber-300"
      title={summarize(structureEval)}
    >
      Struktur: {failureCount} {failureCount === 1 ? "varning" : "varningar"}
    </div>
  );
}
