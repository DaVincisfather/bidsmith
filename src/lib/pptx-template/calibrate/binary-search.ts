/**
 * Per-slot budget search (design doc 2026-07-14): every slot advances one step
 * per RENDER round (one render measures the whole deck), so the deck converges
 * in ~5–7 renders. lo = largest known fit, hi = smallest known overflow.
 */

export const MIN_BUDGET = 30;
export const MAX_BUDGET = 1000;

export interface SearchState {
  lo: number;
  hi: number | null;
  candidate: number;
  done: boolean;
  rounds: number;
  alwaysOverflowed: boolean;
}

const clamp = (n: number) => Math.min(MAX_BUDGET, Math.max(MIN_BUDGET, Math.round(n)));

export function initState(guess: number): SearchState {
  return { lo: MIN_BUDGET, hi: null, candidate: clamp(guess), done: false, rounds: 0, alwaysOverflowed: false };
}

export function step(s: SearchState, overflowed: boolean): SearchState {
  if (s.done) return s;
  const rounds = s.rounds + 1;
  let { lo, hi } = s;
  if (overflowed) hi = s.candidate;
  else lo = Math.max(lo, s.candidate);

  // Never overflowed yet: expand upward until something overflows or MAX fits.
  if (hi === null) {
    if (lo >= MAX_BUDGET) return { lo, hi, candidate: lo, done: true, rounds, alwaysOverflowed: false };
    return { lo, hi, candidate: clamp(lo * 2), done: false, rounds, alwaysOverflowed: false };
  }

  const alwaysOverflowed = lo <= MIN_BUDGET && hi <= MIN_BUDGET + 20;
  // Converged when the bracket is inside 10% (min 20 chars) of the fit.
  if (hi - lo <= Math.max(20, lo * 0.1)) {
    return { lo, hi, candidate: lo, done: true, rounds, alwaysOverflowed };
  }
  return { lo, hi, candidate: clamp((lo + hi) / 2), done: false, rounds, alwaysOverflowed };
}

/** Largest known fit, rounded DOWN to nearest 10 (budgets read as round numbers). */
export function finalBudget(s: SearchState): number {
  return Math.max(MIN_BUDGET, Math.floor(s.lo / 10) * 10);
}
