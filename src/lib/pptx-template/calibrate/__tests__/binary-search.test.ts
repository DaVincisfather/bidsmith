import { describe, expect, it } from "vitest";
import { finalBudget, initState, MAX_BUDGET, MIN_BUDGET, step } from "../binary-search";

function converge(guess: number, fitsUpTo: number): ReturnType<typeof initState> {
  let s = initState(guess);
  let rounds = 0;
  while (!s.done && rounds < 20) {
    s = step(s, s.candidate > fitsUpTo);
    rounds++;
  }
  expect(s.done).toBe(true);
  return s;
}

describe("binary search", () => {
  it("clamps the initial candidate into [MIN, MAX]", () => {
    expect(initState(5).candidate).toBe(MIN_BUDGET);
    expect(initState(99999).candidate).toBe(MAX_BUDGET);
  });

  it("converges to just under the true capacity within ~7 rounds", () => {
    const s = converge(300, 480);
    expect(s.rounds).toBeLessThanOrEqual(7);
    const b = finalBudget(s);
    expect(b).toBeGreaterThanOrEqual(380); // within ~20% under true capacity
    expect(b).toBeLessThanOrEqual(480);
  });

  it("expands upward when the guess never overflows, capped at MAX_BUDGET", () => {
    const s = converge(300, 5000);
    expect(finalBudget(s)).toBe(MAX_BUDGET);
  });

  it("collapses to MIN_BUDGET with alwaysOverflowed when nothing fits", () => {
    const s = converge(300, 0);
    expect(finalBudget(s)).toBe(MIN_BUDGET);
    expect(s.alwaysOverflowed).toBe(true);
  });

  it("does NOT set alwaysOverflowed when the minimum budget was tested and fit", () => {
    const s = converge(30, 30); // candidate 30 fits, everything above overflows
    expect(s.alwaysOverflowed).toBe(false);
    expect(finalBudget(s)).toBe(30);
  });

  it("keeps alwaysOverflowed=true when nothing ever fit (unchanged)", () => {
    const s = converge(300, 0);
    expect(s.alwaysOverflowed).toBe(true);
  });

  it("final budget rounds down to nearest 10", () => {
    expect(finalBudget({ lo: 447, hi: 460, candidate: 450, done: true, rounds: 5, alwaysOverflowed: false, everFit: true })).toBe(440);
  });
});
