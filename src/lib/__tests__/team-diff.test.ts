import { describe, it, expect } from "vitest";
import { deriveSwapComparison } from "../team-diff";
import type { ScoredConsultant } from "../types";

const pool = [
  { consultantId: "a", consultantName: "Sara Norén" },
  { consultantId: "b", consultantName: "Aram Tahbaz" },
  { consultantId: "c", consultantName: "Magnus Holmqvist" },
] as ScoredConsultant[];

const prev = (ids: string[], win: number) => ({
  teamConsultantIds: ids,
  result: { winProbability: win },
});

describe("deriveSwapComparison", () => {
  it("returns null when the teams are identical", () => {
    expect(deriveSwapComparison(prev(["a", "c"], 42), { teamConsultantIds: ["a", "c"] }, pool)).toBeNull();
  });

  it("resolves swapped consultants to names and carries the previous win probability", () => {
    const cmp = deriveSwapComparison(prev(["a", "c"], 42), { teamConsultantIds: ["b", "c"] }, pool);
    expect(cmp).toEqual({ removed: ["Sara Norén"], added: ["Aram Tahbaz"], prevWinProbability: 42 });
  });

  it("falls back to 'okänd konsult' for ids missing from the pool", () => {
    const cmp = deriveSwapComparison(prev(["zzz"], 30), { teamConsultantIds: ["b"] }, pool);
    expect(cmp).toEqual({ removed: ["okänd konsult"], added: ["Aram Tahbaz"], prevWinProbability: 30 });
  });

  it("lists multiple differences", () => {
    const cmp = deriveSwapComparison(prev(["a", "c"], 42), { teamConsultantIds: ["b"] }, pool);
    expect(cmp?.removed).toEqual(["Sara Norén", "Magnus Holmqvist"]);
    expect(cmp?.added).toEqual(["Aram Tahbaz"]);
  });
});
