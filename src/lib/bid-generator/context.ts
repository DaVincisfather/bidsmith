import type {
  RfpAnalysis,
  Consultant,
  ScoredConsultant,
  GoNoGoResult,
} from "@/lib/types";

export interface BidContext {
  analysis: RfpAnalysis;
  teamConsultants: Consultant[];
  scoredConsultants: ScoredConsultant[];
  goNoGoResult: GoNoGoResult;
  userId?: string | null;
}

export function formatContext(ctx: BidContext): string {
  const teamSummary = ctx.teamConsultants
    .map((c) => {
      const score = ctx.scoredConsultants.find(
        (s) => s.consultantId === c.id
      );
      const comps = c.competencies.map((co) => co.competency).join(", ");
      const refs = c.references
        .map((r) => `${r.title} (${r.year}, ${r.sector})`)
        .join("; ");
      // prefilterMiss = defensive 0, not an assessment — don't feed the bid
      // writer a literal "score: 0" for a user-selected team member.
      const scoreText = score
        ? score.prefilterMiss
          ? "ej scorad"
          : String(score.score)
        : "N/A";
      return `- ${c.name} (${c.level}, score: ${scoreText})
  Kompetenser: ${comps}
  Uppdrag: ${refs}
  AI-bedömning: ${score?.reasoning || "N/A"}`;
    })
    .join("\n\n");

  return `## Förfrågningsunderlag (RFP)
${JSON.stringify(ctx.analysis, null, 2)}

## Team
${teamSummary}

## Go/No-Go-bedömning
- Rekommendation: ${ctx.goNoGoResult.recommendation}
- Vinstchans: ${ctx.goNoGoResult.winProbability}%
- Styrkor: ${ctx.goNoGoResult.strengths.join(", ")}
- Luckor: ${ctx.goNoGoResult.gaps.join(", ")}
- Motivering: ${ctx.goNoGoResult.reasoning}`;
}
