import { afterEach, describe, expect, it, vi } from "vitest";
import { daysUntil, stockholmToday } from "../pipeline";

afterEach(() => vi.useRealTimers());

describe("stockholmToday / daysUntil timezone", () => {
  it("reports the Stockholm calendar day, not the UTC day, just after local midnight (CEST)", () => {
    // 2026-07-15 00:30 Stockholm (CEST, UTC+2) = 2026-07-14 22:30 UTC.
    // UTC-based code would call it the 14th; Stockholm-local is the 15th.
    vi.setSystemTime(new Date("2026-07-14T22:30:00Z"));
    expect(stockholmToday()).toBe("2026-07-15");
  });

  it("a deadline that passed locally yesterday is negative, not 0 (no false 'Idag')", () => {
    // Local day is the 15th; a deadline of the 14th is one day past.
    vi.setSystemTime(new Date("2026-07-14T22:30:00Z"));
    expect(daysUntil("2026-07-14")).toBe(-1);
    expect(daysUntil("2026-07-15")).toBe(0);
    expect(daysUntil("2026-07-16")).toBe(1);
  });
});
