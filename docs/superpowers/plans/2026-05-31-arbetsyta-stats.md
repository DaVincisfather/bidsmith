# Arbetsyta-hub + org-statistik Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/arbetsyta` hub landing page and a `/arbetsyta/statistik` org-statistics view (token cost, bids submitted, win-rate, per user + total) over existing `ai_call_logs` and `bids` data.

**Architecture:** Server Components query Supabase directly via `createServiceClient()`. A pure aggregation module (`src/lib/stats.ts`) does the reduce-in-JS work and is unit-tested in isolation; the period toggle is a `searchParams` link that re-renders the server. No client fetch, no new API routes, no migration.

**Tech Stack:** Next.js 16 (App Router, async `searchParams`), Tailwind v4, Supabase JS (service-role), Vitest.

**Spec:** `docs/superpowers/specs/2026-05-31-arbetsyta-stats-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/stats.ts` (new) | Types, `periodStart`, `aggregate` (pure), `getWorkspaceStats` (IO), `parsePeriod`, formatters |
| `src/lib/__tests__/stats.test.ts` (new) | Unit tests for the pure + IO logic |
| `src/app/arbetsyta/page.tsx` (new) | Hub landing: Konsulter + Statistik cards |
| `src/app/arbetsyta/statistik/page.tsx` (new) | Statistics view with period toggle + per-user table |
| `src/app/layout.tsx` (modify) | Swap top-nav `Konsulter` link → `Arbetsyta` |

---

## Task 1: Pure stats core (types, period, aggregate, formatters)

Pure functions only — no Supabase IO. This is the testable heart of the feature.

**Files:**
- Create: `src/lib/stats.ts`
- Test: `src/lib/__tests__/stats.test.ts`

- [ ] **Step 1: Write the failing tests for the pure core**

Create `src/lib/__tests__/stats.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- stats`
Expected: FAIL — `src/lib/stats.ts` does not exist / exports undefined.

- [ ] **Step 3: Implement the pure core in `src/lib/stats.ts`**

```ts
export type StatsPeriod = "all" | "30d" | "ytd";

export interface UserStats {
  userId: string;
  email: string;
  costUsd: number;
  bidsSubmitted: number;
  wins: number;
  losses: number;
  winRate: number | null;
}

export interface WorkspaceStats {
  period: StatsPeriod;
  totalCostUsd: number;
  bidsSubmitted: number;
  wins: number;
  losses: number;
  winRate: number | null;
  perUser: UserStats[];
}

export interface CostRow {
  user_id: string | null;
  cost_usd: number | string;
}

export interface BidRow {
  created_by: string | null;
  outcome: string | null;
}

const UNKNOWN_USER = "unknown";

export function periodStart(period: StatsPeriod, now: Date = new Date()): string | null {
  if (period === "all") return null;
  if (period === "30d") {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - 30);
    return d.toISOString();
  }
  // ytd: Jan 1 (UTC) of the current year
  return new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();
}

export function parsePeriod(raw: string | string[] | undefined): StatsPeriod {
  return raw === "30d" || raw === "ytd" ? raw : "all";
}

function winRate(wins: number, losses: number): number | null {
  const denom = wins + losses;
  return denom === 0 ? null : wins / denom;
}

export function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function formatPct(n: number | null): string {
  return n === null ? "—" : `${Math.round(n * 100)}%`;
}

export function aggregate(
  costRows: CostRow[],
  bidRows: BidRow[],
  emailById: Map<string, string>,
  period: StatsPeriod
): WorkspaceStats {
  const byUser = new Map<
    string,
    { costUsd: number; bidsSubmitted: number; wins: number; losses: number }
  >();
  const ensure = (id: string) => {
    let u = byUser.get(id);
    if (!u) {
      u = { costUsd: 0, bidsSubmitted: 0, wins: 0, losses: 0 };
      byUser.set(id, u);
    }
    return u;
  };

  for (const r of costRows) {
    const id = r.user_id ?? UNKNOWN_USER;
    ensure(id).costUsd += Number(r.cost_usd) || 0;
  }
  for (const r of bidRows) {
    if (r.outcome == null) continue; // query already filters; defensive
    const u = ensure(r.created_by ?? UNKNOWN_USER);
    u.bidsSubmitted += 1;
    if (r.outcome === "won") u.wins += 1;
    else if (r.outcome === "lost") u.losses += 1;
  }

  const perUser: UserStats[] = [...byUser.entries()]
    .map(([userId, u]) => ({
      userId,
      email:
        userId === UNKNOWN_USER
          ? "Okänd"
          : emailById.get(userId) ?? userId.slice(0, 8),
      costUsd: u.costUsd,
      bidsSubmitted: u.bidsSubmitted,
      wins: u.wins,
      losses: u.losses,
      winRate: winRate(u.wins, u.losses),
    }))
    .sort((a, b) => b.costUsd - a.costUsd);

  const totalCostUsd = perUser.reduce((s, u) => s + u.costUsd, 0);
  const bidsSubmitted = perUser.reduce((s, u) => s + u.bidsSubmitted, 0);
  const wins = perUser.reduce((s, u) => s + u.wins, 0);
  const losses = perUser.reduce((s, u) => s + u.losses, 0);

  return {
    period,
    totalCostUsd,
    bidsSubmitted,
    wins,
    losses,
    winRate: winRate(wins, losses),
    perUser,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- stats`
Expected: PASS (all `periodStart`, `parsePeriod`, format, `aggregate` tests green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/stats.ts src/lib/__tests__/stats.test.ts
git commit -m "feat(stats): pure aggregation core for workspace statistics"
```

---

## Task 2: IO layer — `getWorkspaceStats` + email loading

Adds the Supabase query + `auth.admin.listUsers()` email mapping on top of the pure core.

**Files:**
- Modify: `src/lib/stats.ts`
- Modify: `src/lib/__tests__/stats.test.ts`

- [ ] **Step 1: Write the failing IO tests**

Add to the top of `src/lib/__tests__/stats.test.ts` (imports + mock), and a new `describe` block.

Add `getWorkspaceStats` to the existing import from `@/lib/stats`, then add:

```ts
import { vi, beforeEach } from "vitest";
import { createServiceClient } from "@/lib/supabase";

vi.mock("@/lib/supabase", () => ({ createServiceClient: vi.fn() }));

// Thenable query-builder stub: select/gte/not chain, awaits to { data, error }.
function queryStub(rows: unknown[]) {
  const b: Record<string, unknown> = {};
  b.select = () => b;
  b.gte = () => b;
  b.not = () => b;
  b.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
    resolve({ data: rows, error: null });
  return b;
}

function clientStub(opts: {
  costRows: unknown[];
  bidRows: unknown[];
  listUsers: ReturnType<typeof vi.fn>;
}) {
  return {
    from: (table: string) =>
      queryStub(table === "ai_call_logs" ? opts.costRows : opts.bidRows),
    auth: { admin: { listUsers: opts.listUsers } },
  };
}

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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- stats`
Expected: FAIL — `getWorkspaceStats` is not exported.

- [ ] **Step 3: Implement the IO layer in `src/lib/stats.ts`**

Add the import at the top of the file:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase";
```

Append these functions:

```ts
async function loadEmails(supabase: SupabaseClient): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    // One page of 1000 covers the demo. Loop pages if the user count grows.
    const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (error || !data) return map;
    for (const u of data.users) {
      if (u.email) map.set(u.id, u.email);
    }
  } catch {
    // Degrade: aggregate() falls back to a userId prefix.
  }
  return map;
}

export async function getWorkspaceStats(period: StatsPeriod): Promise<WorkspaceStats> {
  const supabase = createServiceClient();
  const start = periodStart(period);

  let costQuery = supabase.from("ai_call_logs").select("user_id, cost_usd");
  if (start) costQuery = costQuery.gte("created_at", start);
  const { data: costRows } = await costQuery;

  let bidQuery = supabase
    .from("bids")
    .select("created_by, outcome")
    .not("outcome", "is", null);
  if (start) bidQuery = bidQuery.gte("created_at", start);
  const { data: bidRows } = await bidQuery;

  const emailById = await loadEmails(supabase);

  return aggregate(
    (costRows as CostRow[]) ?? [],
    (bidRows as BidRow[]) ?? [],
    emailById,
    period
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- stats`
Expected: PASS (both new `getWorkspaceStats` tests + all Task 1 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/stats.ts src/lib/__tests__/stats.test.ts
git commit -m "feat(stats): getWorkspaceStats IO layer with email mapping + degrade"
```

---

## Task 3: Arbetsyta landing page

**Files:**
- Create: `src/app/arbetsyta/page.tsx`

- [ ] **Step 1: Write the landing page**

```tsx
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase";
import { getWorkspaceStats, formatUsd } from "@/lib/stats";

export default async function ArbetsytaPage() {
  const supabase = createServiceClient();
  const [{ count }, stats] = await Promise.all([
    supabase.from("consultants").select("id", { count: "exact", head: true }),
    getWorkspaceStats("all"),
  ]);

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-2xl font-bold mb-8">Arbetsyta</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <Link
            href="/consultants"
            className="block rounded-lg border border-gray-200 p-6 hover:border-gray-400"
          >
            <h2 className="text-lg font-semibold">Konsulter</h2>
            <p className="mt-1 text-sm text-gray-500">{count ?? 0} konsulter</p>
          </Link>
          <Link
            href="/arbetsyta/statistik"
            className="block rounded-lg border border-gray-200 p-6 hover:border-gray-400"
          >
            <h2 className="text-lg font-semibold">Statistik</h2>
            <p className="mt-1 text-sm text-gray-500">
              {formatUsd(stats.totalCostUsd)} · {stats.bidsSubmitted} anbud
            </p>
          </Link>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no type errors in `src/app/arbetsyta/page.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/app/arbetsyta/page.tsx
git commit -m "feat(arbetsyta): hub landing page with Konsulter + Statistik cards"
```

---

## Task 4: Statistik page with period toggle

**Files:**
- Create: `src/app/arbetsyta/statistik/page.tsx`

- [ ] **Step 1: Write the statistics page**

Note: in Next 16 the App Router passes `searchParams` as a Promise — await it.

```tsx
import Link from "next/link";
import {
  getWorkspaceStats,
  parsePeriod,
  formatUsd,
  formatPct,
  type StatsPeriod,
} from "@/lib/stats";

const PERIODS: { key: StatsPeriod; label: string }[] = [
  { key: "all", label: "Allt" },
  { key: "30d", label: "30 dgr" },
  { key: "ytd", label: "I år" },
];

export default async function StatistikPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: rawPeriod } = await searchParams;
  const period = parsePeriod(rawPeriod);
  const stats = await getWorkspaceStats(period);

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Statistik</h1>
          <div className="flex gap-1 text-sm">
            {PERIODS.map((p) => (
              <Link
                key={p.key}
                href={`/arbetsyta/statistik?period=${p.key}`}
                className={
                  p.key === period
                    ? "rounded bg-gray-900 px-3 py-1 text-white"
                    : "rounded px-3 py-1 text-gray-500 hover:text-gray-900"
                }
              >
                {p.label}
              </Link>
            ))}
          </div>
        </div>

        <p className="mb-8 text-sm text-gray-700">
          Total: {formatUsd(stats.totalCostUsd)} · {stats.bidsSubmitted} anbud ·
          win-rate {formatPct(stats.winRate)} ({stats.wins} W / {stats.losses} L)
        </p>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-2 font-medium">Användare</th>
              <th className="py-2 text-right font-medium">Kostnad</th>
              <th className="py-2 text-right font-medium">Anbud</th>
              <th className="py-2 text-right font-medium">W / L</th>
              <th className="py-2 text-right font-medium">Win-rate</th>
            </tr>
          </thead>
          <tbody>
            {stats.perUser.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-4 text-gray-400">
                  Ingen data ännu.
                </td>
              </tr>
            ) : (
              stats.perUser.map((u) => (
                <tr key={u.userId} className="border-b border-gray-100">
                  <td className="py-2">{u.email}</td>
                  <td className="py-2 text-right">{formatUsd(u.costUsd)}</td>
                  <td className="py-2 text-right">{u.bidsSubmitted}</td>
                  <td className="py-2 text-right">
                    {u.wins} / {u.losses}
                  </td>
                  <td className="py-2 text-right">{formatPct(u.winRate)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/arbetsyta/statistik/page.tsx
git commit -m "feat(arbetsyta): statistics view with period toggle + per-user table"
```

---

## Task 5: Nav — swap Konsulter link for Arbetsyta

**Files:**
- Modify: `src/app/layout.tsx:41-43`

- [ ] **Step 1: Replace the Konsulter nav link**

Find:

```tsx
            <Link href="/consultants" className="text-sm text-gray-500 hover:text-gray-900">
              Konsulter
            </Link>
```

Replace with:

```tsx
            <Link href="/arbetsyta" className="text-sm text-gray-500 hover:text-gray-900">
              Arbetsyta
            </Link>
```

(`/consultants` stays reachable via the Konsulter card on `/arbetsyta`.)

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat(nav): replace Konsulter top-nav link with Arbetsyta"
```

---

## Task 6: Full verification + manual smoke

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass (the 5 pre-existing live-API failures that need `ANTHROPIC_API_KEY` are not regressions — confirm no NEW failures and that `stats` tests are green).

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: exit 0; `/arbetsyta` and `/arbetsyta/statistik` appear in the route list.

- [ ] **Step 3: Manual smoke (requires `.env.local` + dev server)**

Run: `npm run dev`, then in the browser:
- Top nav shows `Arbetsyta` (not `Konsulter`).
- `/arbetsyta` shows two cards; Konsulter card → `/consultants`, Statistik card → `/arbetsyta/statistik`.
- `/arbetsyta/statistik`: total line renders, period toggle (`Allt / 30 dgr / I år`) changes the URL `?period=` and re-renders, per-user table shows emails (or `Okänd` row if applicable).

Expected: all of the above behave as described; no console errors.

- [ ] **Step 4: Final commit (if any smoke fixes were needed)**

```bash
git add -A
git commit -m "fix(arbetsyta): smoke-test corrections"
```

(Skip if no fixes were needed.)

---

## Self-Review Notes

- **Spec coverage:** routes (T3,T4), data module (T1,T2), nav swap (T5), email-via-listUsers + degrade (T2), null-user bucket + win-rate null + cost/bids-only union (T1 tests), period toggle (T4), verification (T6). All spec sections covered.
- **No migration / no profiles table / no per-bid cost:** honored — out of scope per spec.
- **Type consistency:** `StatsPeriod`, `UserStats`, `WorkspaceStats`, `CostRow`, `BidRow`, `aggregate`, `getWorkspaceStats`, `parsePeriod`, `formatUsd`, `formatPct` consistent across tasks.
