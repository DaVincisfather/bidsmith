/**
 * Budgetregler — overflow-loopens whitelistade ratt (design
 * notes/2026-07-15-overflow-loop-design.md). Generella regler ovanpå profilens
 * uppmätta budgetChars (säkerhetsfaktor, enrads-hantering, MAX-slot-behandling).
 * BASLÄGE: identitet — harness-bygget ändrar inget beteende; forskarloopen
 * vrider här, aldrig i profilens uppmätta värden.
 */
export function effectiveBudget(
  budgetChars: number | undefined,
): number | undefined {
  return budgetChars;
}
