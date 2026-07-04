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
 *
 * VERSIONS-DISKRIMINATOR (migration 011): `extractionVersion` skiljer nu "extraherad före
 * featuren" (NULL) från "extraherad av evidens-generationen men allt strippat" (NON-NULL).
 * Är den non-null är grinden ALLTID på — se residual-noten på funktionen.
 */
import { hasEvidence, hasAnyEvidence } from "./evidence-badge";

/**
 * Per-konsult: applicera över kompetenser + referenser med GEMENSAM grind
 * (grind över UNIONEN av båda arrayerna — en konsult med evidens på kompetenser men
 * inte referenser är post-feature: referenser utan evidens är då flaggade och faller).
 *
 * `extractionVersion` (migration 011, valfri för bakåtkompat):
 *   - NON-NULL → raden extraherades av evidens-generationen. Grinden är ALLTID på:
 *     varje evidens-lös post filtreras bort ÄVEN om raden saknar evidens överallt. Det
 *     STÄNGER den tidigare residualen: en all-strippad degenererad konsult (fel fil som
 *     CV; competencies.min(1) tvingar fram en fabricerad-men-flaggad post) ger nu noll
 *     grundade claims in i AI-input i st.f. att släppas igenom som "legacy".
 *   - NULL/undefined → äkta legacy (rad skriven före versionskolumnen) ELLER call site
 *     utan versionsdata: union-heuristiken (passthrough vid noll evidens någonstans).
 *
 * KVARVARANDE RESIDUAL (nu temporal + krympande): rader extraherade POST-feature men FÖRE
 * migration 011 bär extraction_version NULL och är fortsatt oskiljbara från äkta legacy
 * tills de laddas upp på nytt (upsert stämplar då aktuell version). Ingen backfill görs —
 * versionen kan inte härledas i efterhand. För rader skrivna EFTER att detta shippat är
 * residualen STÄNGD.
 */
export function groundedConsultantClaims<
  C extends { evidence?: string | null },
  R extends { evidence?: string | null },
>(
  c: { competencies: C[]; references: R[] },
  extractionVersion?: number | null,
): { competencies: C[]; references: R[] } {
  // Post-feature-rad (version non-null): grinden alltid på. Äkta legacy (version null)
  // utan evidens någonstans: passthrough (union-heuristiken).
  if (extractionVersion == null && !hasAnyEvidence([...c.competencies, ...c.references])) {
    return { competencies: c.competencies, references: c.references };
  }
  return {
    competencies: c.competencies.filter((i) => hasEvidence(i.evidence)),
    references: c.references.filter((i) => hasEvidence(i.evidence)),
  };
}
