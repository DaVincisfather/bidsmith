/**
 * Per-slot budget search (design doc 2026-07-14): every slot advances one step
 * per RENDER round (one render measures the whole deck), so the deck converges
 * in ~5–7 renders. lo = largest known fit, hi = smallest known overflow.
 * alwaysOverflowed = no tested candidate ever fit (observed evidence, not
 * inferred from bracket position — lo can sit at MIN_BUDGET both as an
 * untested floor and as a verified fit).
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
  /** true once ANY tested candidate fit — the evidence behind alwaysOverflowed. */
  everFit: boolean;
}

const clamp = (n: number) => Math.min(MAX_BUDGET, Math.max(MIN_BUDGET, Math.round(n)));

export function initState(guess: number): SearchState {
  return { lo: MIN_BUDGET, hi: null, candidate: clamp(guess), done: false, rounds: 0, alwaysOverflowed: false, everFit: false };
}

export function step(s: SearchState, overflowed: boolean): SearchState {
  if (s.done) return s;
  const rounds = s.rounds + 1;
  const everFit = s.everFit || !overflowed;
  let { lo, hi } = s;
  if (overflowed) hi = s.candidate;
  else lo = Math.max(lo, s.candidate);

  // Never overflowed yet: expand upward until something overflows or MAX fits.
  if (hi === null) {
    // A fit necessarily occurred on this path, so alwaysOverflowed stays false.
    if (lo >= MAX_BUDGET) return { lo, hi, candidate: lo, done: true, rounds, alwaysOverflowed: false, everFit };
    return { lo, hi, candidate: clamp(lo * 2), done: false, rounds, alwaysOverflowed: false, everFit };
  }

  // Converged when the bracket is inside 10% (min 20 chars) of the fit.
  if (hi - lo <= Math.max(20, lo * 0.1)) {
    return { lo, hi, candidate: lo, done: true, rounds, alwaysOverflowed: !everFit, everFit };
  }
  return { lo, hi, candidate: clamp((lo + hi) / 2), done: false, rounds, alwaysOverflowed: !everFit, everFit };
}

/** Largest known fit, rounded DOWN to nearest 10 (budgets read as round numbers). */
export function finalBudget(s: SearchState): number {
  return Math.max(MIN_BUDGET, Math.floor(s.lo / 10) * 10);
}
