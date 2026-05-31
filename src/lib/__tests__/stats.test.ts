import { describe, it, expect } from "vitest";
import {
  periodStart,
  aggregate,
  formatUsd,
  formatPct,
  parsePeriod,
} from "@/lib/stats";

describe("periodStart", () => {
  const now = new Date("2026-05-31T12:00:00.000Z");

  it("returns null for 'all'", () => {
    expect(periodStart("all", now)).toBeNull();
  });

  it("returns now-30d for '30d'", () => {
    expect(periodStart("30d", now)).toBe("2026-05-01T12:00:00.000Z");
  });

  it("returns Jan 1 (UTC) of current year for 'ytd'", () => {
    expect(periodStart("ytd", now)).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("parsePeriod", () => {
  it("accepts known values", () => {
    expect(parsePeriod("30d")).toBe("30d");
    expect(parsePeriod("ytd")).toBe("ytd");
    expect(parsePeriod("all")).toBe("all");
  });
  it("falls back to 'all' for invalid/undefined", () => {
    expect(parsePeriod("bogus")).toBe("all");
    expect(parsePeriod(undefined)).toBe("all");
  });
});

describe("formatUsd / formatPct", () => {
  it("formats usd to 2 decimals", () => {
    expect(formatUsd(42.1)).toBe("$42.10");
  });
  it("formats pct rounded, null → dash", () => {
    expect(formatPct(0.364)).toBe("36%");
    expect(formatPct(null)).toBe("—");
  });
});

describe("aggregate", () => {
  const emails = new Map([
    ["user-aaaa1111", "stefan@example.se"],
    ["user-bbbb2222", "kollega@example.se"],
  ]);

  it("merges cost-only, bids-only and mixed users", () => {
    const cost = [
      { user_id: "user-aaaa1111", cost_usd: 38.2 },
      { user_id: "user-bbbb2222", cost_usd: 3.9 },
    ];
    const bids = [
      { created_by: "user-aaaa1111", outcome: "won" },
      { created_by: "user-aaaa1111", outcome: "lost" },
      { created_by: "user-cccc3333", outcome: "won" }, // bids-only, no email
    ];
    const result = aggregate(cost, bids, emails, "all");

    expect(result.totalCostUsd).toBeCloseTo(42.1);
    expect(result.bidsSubmitted).toBe(3);
    expect(result.wins).toBe(2);
    expect(result.losses).toBe(1);
    expect(result.winRate).toBeCloseTo(2 / 3);

    // sorted by cost desc
    expect(result.perUser[0].userId).toBe("user-aaaa1111");
    expect(result.perUser[0].email).toBe("stefan@example.se");
    expect(result.perUser[0].winRate).toBeCloseTo(0.5);

    // bids-only user falls back to userId prefix (no email)
    const cccc = result.perUser.find((u) => u.userId === "user-cccc3333");
    expect(cccc?.costUsd).toBe(0);
    expect(cccc?.email).toBe("user-ccc");
  });

  it("win-rate is null when no wins or losses", () => {
    const result = aggregate(
      [{ user_id: "user-aaaa1111", cost_usd: 1 }],
      [{ created_by: "user-aaaa1111", outcome: "no-bid" }],
      emails,
      "all"
    );
    expect(result.bidsSubmitted).toBe(1);
    expect(result.winRate).toBeNull();
    expect(result.perUser[0].winRate).toBeNull();
  });

  it("buckets null user_id / created_by as 'Okänd'", () => {
    const result = aggregate(
      [{ user_id: null, cost_usd: 5 }],
      [{ created_by: null, outcome: "won" }],
      emails,
      "all"
    );
    const unknown = result.perUser.find((u) => u.userId === "unknown");
    expect(unknown?.email).toBe("Okänd");
    expect(unknown?.costUsd).toBe(5);
    expect(unknown?.wins).toBe(1);
  });
});
