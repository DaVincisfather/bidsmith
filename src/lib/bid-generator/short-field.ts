/** Fields at or under this budget are VALUES (a name, a date, a number), not
 *  prose. Shared by the generator (kortfältsregeln — value or empty, never
 *  apology prose) and the bid editor (short fields carry no UI surface).
 *  Dependency-free on purpose: imported by client components.
 *  Design docs 2026-07-14 (calibration loop) + 2026-07-15 (editor slim). */
export const SHORT_FIELD_MAX_CHARS = 80;

export function isShortBudget(budgetChars: number | undefined): boolean {
  return budgetChars !== undefined && budgetChars <= SHORT_FIELD_MAX_CHARS;
}
