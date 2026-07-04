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
