import type {
  RfpAnalysis,
  Consultant,
  ScoredConsultant,
  GoNoGoResult,
} from "@/lib/types";
import type { OrgProfile } from "@/lib/org-profile";

export interface BidContext {
  analysis: RfpAnalysis;
  teamConsultants: Consultant[];
  scoredConsultants: ScoredConsultant[];
  goNoGoResult: GoNoGoResult;
  userId?: string | null;
  // The bid row these bundles generate content for — threaded into
  // ai_call_logs.bid_id so cost per bid is queryable.
  bidId?: string | null;
  /** Avsändarprofil — injiceras FÖRST i cachade systemblocket (stabil per org) */
  profile?: OrgProfile | null;
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

  // Profilblocket bor först i cachedContext (det stabila systemblocket). Per
  // fas 0-resultatet delar bundles med olika output-scheman aldrig cache ändå,
  // men overflow-/format-retries INOM en bundle träffar cachen eftersom profilen
  // är konstant under genereringen.
  const profileBlock = ctx.profile
    ? `## Avsändarprofil
- Företag: ${ctx.profile.companyName}
${ctx.profile.tonality ? `- Tonalitet (följ denna i all text): ${ctx.profile.tonality}\n` : ""}${ctx.profile.boilerplate ? `- Om bolaget (väv in där det är relevant, hitta inte på utöver detta): ${ctx.profile.boilerplate}\n` : ""}
`
    : "";

  return `${profileBlock}## Förfrågningsunderlag (RFP)
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
