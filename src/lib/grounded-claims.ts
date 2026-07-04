/**
 * Fas C — noll-hallucinationsspåret, policy A (produktägarbeslut 2026-07-04):
 * en konsult-claim vars `evidence` strippats av runtime-vakten ("overifierbar även
 * efter ett reparationsförsök") får INTE påverka matchning, go/no-go eller anbudstext.
 * Den filtreras bort vid varje serialiserings-gräns mot AI-input. Konsekvens per
 * konstruktion: matchningsmotiveringar kan bara citera grundade fakta — de ser
 * aldrig de obelagda.
 *
 * Legacy-grind (kritisk): konsulter extraherade FÖRE evidens-featuren bär `evidence`
 * null på ALLT — de får INTE behandlas som flaggade (det skulle döda matchningen för
 * hela den befintliga poolen). Samma grind som UI:t (evidence-badge.ts hasAnyEvidence):
 * bara när en konsult HAR minst en evidens-bärande post räknas saknad evidens som flaggad.
 */
import { hasEvidence, hasAnyEvidence } from "./evidence-badge";

/**
 * Per-konsult: applicera över kompetenser + referenser med GEMENSAM legacy-grind
 * (grind över UNIONEN av båda arrayerna — en konsult med evidens på kompetenser men
 * inte referenser är post-feature: referenser utan evidens är då flaggade och faller).
 *
 * Kvarvarande residual (ärligt dokumenterad; även flaggad av routine på #56): en
 * konsult vars extraktion kördes POST-feature men där ALLA poster strippades (t.ex.
 * degenererat underlag — fel fil uppladdad som CV, competencies.min(1) tvingar fram en
 * fabricerad-men-flaggad post) har i datat ingen evidens någonstans → unionen ser inget
 * → grinden kan inte skilja den från en äkta legacy-konsult och släpper igenom allt.
 * Diskrimineringen är temporal (nya uppladdningar är post-feature) och synlig i UI:t
 * (all-amber via samma legacy-grind döljer badges). En framtida diskriminator
 * (extraktions-timestamp/versionskolumn) är fixen — se ROADMAP backlog. Byggs INTE nu.
 */
export function groundedConsultantClaims<
  C extends { evidence?: string | null },
  R extends { evidence?: string | null },
>(c: { competencies: C[]; references: R[] }): { competencies: C[]; references: R[] } {
  // Grind över unionen: bär konsulten evidens NÅGONSTANS är den post-feature.
  if (!hasAnyEvidence([...c.competencies, ...c.references])) {
    return { competencies: c.competencies, references: c.references };
  }
  return {
    competencies: c.competencies.filter((i) => hasEvidence(i.evidence)),
    references: c.references.filter((i) => hasEvidence(i.evidence)),
  };
}
