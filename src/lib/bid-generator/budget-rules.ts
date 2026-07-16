/**
 * Budgetregler — overflow-loopens whitelistade ratt (design
 * notes/2026-07-15-overflow-loop-design.md). Generella regler ovanpå profilens
 * uppmätta budgetChars (säkerhetsfaktor, enrads-hantering, MAX-slot-behandling).
 * Forskarloopen vrider här, aldrig i profilens uppmätta värden.
 */
import { SHORT_FIELD_MAX_CHARS } from "./short-field";

/**
 * loop(varv 3): säkerhetsfaktor på prosa-slots. Varv 1–2 visade att modellen
 * levererar ~1,1–1,25× den mjuka "ca X tecken"-instruktionen, och budgetarna är
 * box-exakta (binärsökta till precis-får-plats) — varje överdrag blir alltså
 * overflow. Faktorn sänker BEGÄRAN så att leveransen landar inom den uppmätta
 * budgeten; min-fill-gaten mäter mot profilens fulla budget och går fortfarande
 * fritt i regel — men variansbandet NUDDAR golvet: varv 3 såg 283/600 (0,47 <
 * 0,5) på {Läsanvisning 2}. Faktorn får därför INTE sänkas under 0,85 utan ny
 * mätserie; overflow-svansen ägs av enforcement-spåret, inte mer nedskalning.
 *
 * Kortfält (<= SHORT_FIELD_MAX_CHARS) rörs INTE: de är värdefält utan
 * överdragsproblem (chip-klustret på slide 8 är ett kalibreringsgolv-fel —
 * MIN_BUDGET=30 ljuger om ~3-teckensboxar — och ägs av omkalibrering, inte av
 * generationsregler). Golvet SHORT_FIELD_MAX_CHARS+1 hindrar faktorn från att
 * flippa en prosa-slot till kortfältsklassning nedströms (isShortBudget läser
 * det transformerade värdet).
 */
export const PROSE_BUDGET_FACTOR = 0.85;

export function effectiveBudget(
  budgetChars: number | undefined,
): number | undefined {
  if (budgetChars === undefined) return undefined;
  if (budgetChars <= SHORT_FIELD_MAX_CHARS) return budgetChars;
  const scaled = Math.floor((budgetChars * PROSE_BUDGET_FACTOR) / 10) * 10;
  return Math.max(SHORT_FIELD_MAX_CHARS + 1, scaled);
}
