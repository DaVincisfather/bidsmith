import Link from "next/link";

export type FlowStep = "analysis" | "gonogo" | "bid";

interface FlowNavProps {
  analysisId: string;
  active: FlowStep;
  /** true when a go/no-go assessment exists for the analysis */
  gonogoEnabled: boolean;
  /** bid id when a bid exists (draft/failed/exported) — enables the Anbud step */
  bidId: string | null;
  bidFailed?: boolean;
}

interface StepDef {
  key: FlowStep;
  label: string;
  href: string;
  enabled: boolean;
  hint?: string;
}

export function FlowNav({ analysisId, active, gonogoEnabled, bidId, bidFailed = false }: FlowNavProps) {
  const steps: StepDef[] = [
    {
      key: "analysis",
      label: "Analys & team",
      href: `/analysis/${analysisId}`,
      enabled: true,
    },
    {
      key: "gonogo",
      label: "Go/No-Go",
      href: `/analysis/${analysisId}/go-no-go`,
      enabled: gonogoEnabled,
      hint: "Lås teamet först",
    },
    {
      key: "bid",
      label: bidFailed ? "Anbud (misslyckad generering)" : "Anbud",
      href: bidId ? `/bids/${bidId}` : "#",
      enabled: bidId !== null,
      hint: "Kör Go/No-Go och generera först",
    },
  ];

  return (
    <nav aria-label="Anbudsflöde" className="border-b border-rule bg-paper">
      <ol className="max-w-3xl mx-auto px-6 flex items-center text-sm">
        {steps.map((s, i) => (
          <li key={s.key} className="flex items-center">
            {i > 0 && (
              <span aria-hidden className="text-ink-mute px-2">
                →
              </span>
            )}
            {s.key === active ? (
              <span
                aria-current="step"
                className="px-1 py-2.5 font-medium text-ink border-b-2 border-accent"
              >
                {s.label}
              </span>
            ) : s.enabled ? (
              <Link
                href={s.href}
                className="px-1 py-2.5 text-ink-soft hover:text-ink transition-colors"
              >
                {s.label}
              </Link>
            ) : (
              <span
                aria-disabled="true"
                title={s.hint}
                className="px-1 py-2.5 text-ink-mute/60 cursor-not-allowed"
              >
                {s.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
