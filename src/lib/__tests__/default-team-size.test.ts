import { describe, it, expect } from "vitest";
import { defaultTeamSize } from "@/lib/default-team-size";

describe("defaultTeamSize", () => {
  it("falls back to 3 when teamSizeHint is null", () => {
    expect(defaultTeamSize({ teamSizeHint: null })).toBe(3);
  });

  it("falls back to 3 when teamSizeHint key is absent (legacy analysis)", () => {
    expect(defaultTeamSize({})).toBe(3);
  });

  it("uses hint.max when the hint is present", () => {
    expect(defaultTeamSize({ teamSizeHint: { min: 1, max: 2 } })).toBe(2);
  });

  it("uses hint.max when min === max", () => {
    expect(defaultTeamSize({ teamSizeHint: { min: 1, max: 1 } })).toBe(1);
  });

  it("clamps hint.max to MAX_TEAM_SIZE", () => {
    expect(defaultTeamSize({ teamSizeHint: { min: 4, max: 9 } })).toBe(5);
  });

  it("falls back to 3 when hint.max is malformed (non-numeric, defeats the TS type)", () => {
    expect(
      defaultTeamSize({ teamSizeHint: { min: 1, max: undefined as unknown as number } }),
    ).toBe(3);
  });
});
