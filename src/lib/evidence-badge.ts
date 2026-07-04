/**
 * Ren gate-logik för källa-badgen. Bruten ut ur komponenterna så regeln kan
 * enhets-testas utan DOM och delas mellan analysvyn och konsultprofilen.
 *
 * Evidens = mekaniskt verifierat ordagrant citat (pipeline #54–#58). Saknas det
 * (undefined/null/tom sträng efter vaktens en reparation) är påståendet "obelagt".
 */

/** Ett verifierat citat räknas bara om det är en icke-tom sträng. */
export function hasEvidence(evidence?: string | null): boolean {
  return typeof evidence === "string" && evidence.trim().length > 0;
}

/**
 * Legacy-grinden: om INGEN post i listan bär evidens antas analysen/profilen vara
 * skapad före evidens-featuren — då döljs hela badge-lagret (en vägg av "obelagd"
 * på gamla data vore vilseledande). Ett booleskt värde gatar allt.
 */
export function hasAnyEvidence(items: ReadonlyArray<{ evidence?: string | null }>): boolean {
  return items.some((item) => hasEvidence(item.evidence));
}

/**
 * Versions-medveten badge-grind (migration 011). Avgör om badge-lagret ska visas alls:
 *   - extractionVersion NON-NULL (post-feature-rad): grinden är ALLTID öppen → saknad
 *     evidens visas som amber "obelagd" ÄVEN om raden saknar evidens överallt (den
 *     all-strippade degenererade konsulten visar all-amber i st.f. att gömma badges —
 *     UX-sanning: inget falskt "belagt"-sken, matchningen ser noll grundade claims).
 *   - extractionVersion NULL/undefined (äkta legacy ELLER call site utan versionsdata):
 *     union-heuristiken — visa badges bara om NÅGON post bär evidens. BAKÅTKOMPAT:
 *     parametern är valfri, så anropare som inte kan förse den behåller dagens beteende.
 */
export function showEvidenceBadges(
  items: ReadonlyArray<{ evidence?: string | null }>,
  extractionVersion?: number | null,
): boolean {
  if (extractionVersion != null) return true;
  return hasAnyEvidence(items);
}

/** Per-post badge-tillstånd: "kalla" (expanderbart citat), "flagged" (obelagd), eller "none". */
export type BadgeState = "kalla" | "flagged" | "none";

/**
 * Avgör vilken badge en post ska visa. `showBadges` är legacy-grinden (resultatet av
 * hasAnyEvidence över hela listan) — är den false visas ingenting alls.
 */
export function badgeState(evidence: string | null | undefined, showBadges: boolean): BadgeState {
  if (!showBadges) return "none";
  return hasEvidence(evidence) ? "kalla" : "flagged";
}
