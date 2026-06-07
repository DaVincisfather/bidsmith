import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  periodStart,
  aggregate,
  formatUsd,
  formatPct,
  parsePeriod,
  getWorkspaceStats,
} from "@/lib/stats";
import { createServiceClient } from "@/lib/supabase";

vi.mock("@/lib/supabase", () => ({ createServiceClient: vi.fn() }));

// Thenable query stub: any chain method returns `this`, awaiting yields { data, error }.
function thenable(rows: unknown[]) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "gte", "not", "is", "in"]) b[m] = () => b;
  b.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
    resolve({ data: rows, error: null });
  return b;
}

// The bids table serves two queries; route by select() columns
// (only the pending query selects "status").
function bidsThenable(bidRows: unknown[], pendingRows: unknown[]) {
  let rows = bidRows;
  const b: Record<string, unknown> = {};
  b.select = (cols: string) => {
    if (typeof cols === "string" && cols.includes("status")) rows = pendingRows;
    return b;
  };
  for (const m of ["gte", "not", "is", "in"]) b[m] = () => b;
  b.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
    resolve({ data: rows, error: null });
  return b;
}

function clientStub(opts: {
  costRows: unknown[];
  bidRows: unknown[];
  pendingRows?: unknown[];
  listUsers: ReturnType<typeof vi.fn>;
}) {
  return {
    from: (table: string) =>
      table === "ai_call_logs"
        ? thenable(opts.costRows)
        : bidsThenable(opts.bidRows, opts.pendingRows ?? []),
    auth: { admin: { listUsers: opts.listUsers } },
  };
}

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

  it("buckets pending bids per user and counts the total", () => {
    const pending = [
      { id: "b1", created_by: "user-aaaa1111", status: "draft" as const, title: "RFP Alfa" },
      { id: "b2", created_by: "user-aaaa1111", status: "exported" as const, title: "RFP Beta" },
      { id: "b3", created_by: "user-bbbb2222", status: "draft" as const, title: "RFP Gamma" },
    ];
    const result = aggregate([], [], emails, "all", pending);

    expect(result.pendingCount).toBe(3);
    const a = result.perUser.find((u) => u.userId === "user-aaaa1111");
    expect(a?.pending.map((p) => p.title)).toEqual(["RFP Alfa", "RFP Beta"]);
    const b = result.perUser.find((u) => u.userId === "user-bbbb2222");
    expect(b?.pending).toEqual([{ id: "b3", title: "RFP Gamma", status: "draft" }]);
  });

  it("pending bids do not affect bidsSubmitted / wins / losses", () => {
    const result = aggregate(
      [],
      [{ created_by: "user-aaaa1111", outcome: "won" }],
      emails,
      "all",
      [{ id: "b1", created_by: "user-aaaa1111", status: "draft" as const, title: "RFP X" }]
    );
    expect(result.bidsSubmitted).toBe(1);
    expect(result.wins).toBe(1);
    expect(result.perUser.find((u) => u.userId === "user-aaaa1111")?.pending).toHaveLength(1);
  });

  it("buckets pending with null created_by as 'Okänd' and surfaces pending-only users", () => {
    const result = aggregate([], [], emails, "all", [
      { id: "b1", created_by: null, status: "exported" as const, title: "RFP Noll" },
    ]);
    const unknown = result.perUser.find((u) => u.userId === "unknown");
    expect(unknown?.email).toBe("Okänd");
    expect(unknown?.pending).toHaveLength(1);
    expect(unknown?.costUsd).toBe(0);
  });
});

describe("getWorkspaceStats", () => {
  beforeEach(() => vi.mocked(createServiceClient).mockReset());

  it("maps user_id → email when listUsers succeeds", async () => {
    const listUsers = vi.fn().mockResolvedValue({
      data: { users: [{ id: "user-aaaa1111", email: "stefan@example.se" }] },
      error: null,
    });
    vi.mocked(createServiceClient).mockReturnValue(
      clientStub({
        costRows: [{ user_id: "user-aaaa1111", cost_usd: 10 }],
        bidRows: [{ created_by: "user-aaaa1111", outcome: "won" }],
        listUsers,
      }) as never
    );

    const stats = await getWorkspaceStats("all");
    expect(stats.perUser[0].email).toBe("stefan@example.se");
    expect(stats.totalCostUsd).toBe(10);
    expect(stats.wins).toBe(1);
  });

  it("degrades to userId prefix when listUsers throws", async () => {
    const listUsers = vi.fn().mockRejectedValue(new Error("forbidden"));
    vi.mocked(createServiceClient).mockReturnValue(
      clientStub({
        costRows: [{ user_id: "user-aaaa1111", cost_usd: 5 }],
        bidRows: [],
        listUsers,
      }) as never
    );

    const stats = await getWorkspaceStats("all");
    expect(stats.perUser[0].email).toBe("user-aaa");
  });

  it("maps pending bids and falls back to 'Namnlös RFP' when title is missing", async () => {
    const listUsers = vi.fn().mockResolvedValue({
      data: { users: [{ id: "user-aaaa1111", email: "stefan@example.se" }] },
      error: null,
    });
    vi.mocked(createServiceClient).mockReturnValue(
      clientStub({
        costRows: [],
        bidRows: [],
        pendingRows: [
          { id: "b1", created_by: "user-aaaa1111", status: "draft", analyses: { analysis: { title: "RFP Alfa" } } },
          { id: "b2", created_by: "user-aaaa1111", status: "exported", analyses: { analysis: {} } },
        ],
        listUsers,
      }) as never
    );

    const stats = await getWorkspaceStats("all");
    expect(stats.pendingCount).toBe(2);
    const a = stats.perUser.find((u) => u.userId === "user-aaaa1111");
    expect(a?.pending[0]).toEqual({ id: "b1", title: "RFP Alfa", status: "draft" });
    expect(a?.pending[1].title).toBe("Namnlös RFP");
  });
});
