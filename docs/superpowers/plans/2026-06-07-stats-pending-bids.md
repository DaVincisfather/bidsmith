# Pending Bids in Statistics — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show in-progress bids (draft + exported, no outcome) on `/arbetsyta/statistik` — a workspace total plus a per-user expandable list linking to each bid.

**Architecture:** Extend the pure `aggregate()` in `src/lib/stats.ts` to bucket pending bids per user and count the total (new optional param, no breaking change). Add a non-period-filtered query in `getWorkspaceStats()`. Split the per-user table out of the server component `page.tsx` into a small client component `StatsTable` that owns expand/collapse state.

**Tech Stack:** Next.js 16 (App Router, RSC), TypeScript (strict), Tailwind v4, Supabase JS, Vitest + @testing-library/react (jsdom).

**Spec:** `docs/superpowers/specs/2026-06-07-stats-pending-bids-design.md`

**Commands:** test = `npm test`, single file = `npx vitest run <path>`, typecheck = `npx tsc --noEmit`, lint = `npm run lint`, build = `npm run build`, dev = `npm run dev`.

---

## File Structure

- Modify `src/lib/stats.ts` — new types (`PendingBid`, `PendingRow`), `aggregate()` buckets pending, `getWorkspaceStats()` runs the pending query.
- Modify `src/lib/__tests__/stats.test.ts` — extend query stub to route the second `bids` query; new logic + mapping tests.
- Create `src/app/arbetsyta/statistik/StatsTable.tsx` — client component, table + expander.
- Create `src/app/arbetsyta/statistik/__tests__/StatsTable.test.tsx` — component test.
- Modify `src/app/arbetsyta/statistik/page.tsx` — pending plutt in summary, render `<StatsTable>`.

---

## Task 1: Data model + `aggregate()` pending bucketing

**Files:**
- Modify: `src/lib/stats.ts`
- Test: `src/lib/__tests__/stats.test.ts`

- [ ] **Step 1: Write the failing tests**

Add these three tests inside the existing `describe("aggregate", () => { ... })` block in `src/lib/__tests__/stats.test.ts`, after the last `it(...)` (keep the existing `emails` map in scope):

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/stats.test.ts`
Expected: FAIL — `aggregate` is called with a 5th arg the impl ignores; `result.pendingCount` is `undefined` and `u.pending` is `undefined`.

- [ ] **Step 3: Add the new types**

In `src/lib/stats.ts`, after the `StatsPeriod` type (line 4), add:

```ts
export interface PendingBid {
  id: string;
  title: string;
  status: "draft" | "exported";
}

export interface PendingRow {
  id: string;
  created_by: string | null;
  status: "draft" | "exported";
  title: string;
}
```

In the same file, add `pending: PendingBid[];` to the `UserStats` interface (after `winRate`), and add `pendingCount: number;` to the `WorkspaceStats` interface (after `winRate`).

- [ ] **Step 4: Bucket pending bids inside `aggregate()`**

Change the `aggregate` signature to take an optional `pendingRows` last:

```ts
export function aggregate(
  costRows: CostRow[],
  bidRows: BidRow[],
  emailById: Map<string, string>,
  period: StatsPeriod,
  pendingRows: PendingRow[] = []
): WorkspaceStats {
```

Add `pending: PendingBid[]` to the accumulator map's value type and its initializer. The `byUser` map declaration becomes:

```ts
  const byUser = new Map<
    string,
    { costUsd: number; bidsSubmitted: number; wins: number; losses: number; pending: PendingBid[] }
  >();
```

and the `ensure` initializer becomes:

```ts
      u = { costUsd: 0, bidsSubmitted: 0, wins: 0, losses: 0, pending: [] };
```

After the existing `for (const r of bidRows)` loop, add:

```ts
  for (const r of pendingRows) {
    ensure(r.created_by ?? UNKNOWN_USER).pending.push({
      id: r.id,
      title: r.title,
      status: r.status,
    });
  }
```

In the `perUser` `.map(...)`, add `pending: u.pending,` to the returned object (after `winRate`).

Add `pendingCount` to the return. Before the `return {`, add:

```ts
  const pendingCount = pendingRows.length;
```

and add `pendingCount,` to the returned object (after `winRate`).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/stats.test.ts`
Expected: PASS — all aggregate tests (old + 3 new) green. The existing `getWorkspaceStats` tests still pass (pending defaults to `[]`).

- [ ] **Step 6: Commit**

```bash
git add src/lib/stats.ts src/lib/__tests__/stats.test.ts
git commit -m "feat: bucket pending bids per user in aggregate()"
```

---

## Task 2: `getWorkspaceStats()` pending query + title mapping

**Files:**
- Modify: `src/lib/stats.ts`
- Test: `src/lib/__tests__/stats.test.ts`

- [ ] **Step 1: Update the test query stub to serve the second `bids` query**

In `src/lib/__tests__/stats.test.ts`, replace the existing `queryStub` and `clientStub` helpers (the block from `function queryStub` through the end of `clientStub`) with:

```ts
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
```

- [ ] **Step 2: Write the failing test**

Add this test inside the existing `describe("getWorkspaceStats", () => { ... })` block, after the last `it(...)`:

```ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/stats.test.ts`
Expected: FAIL — `stats.pendingCount` is `0` (no pending query yet), `a?.pending` is `[]`.

- [ ] **Step 4: Add the pending query + mapping in `getWorkspaceStats()`**

In `src/lib/stats.ts`, add this local type just above the `getWorkspaceStats` function:

```ts
interface PendingQueryRow {
  id: string;
  created_by: string | null;
  status: string;
  analyses: unknown; // !inner join: { analysis: RfpAnalysis } — cast on read (mirrors dashboard route)
}
```

Inside `getWorkspaceStats`, after the `const { data: bidRows } = await bidQuery;` block and before `const emailById = ...`, add (note: NO `created_at` filter — pending ignores the period):

```ts
  const { data: pendingRaw } = await supabase
    .from("bids")
    .select("id, created_by, status, analyses!inner(analysis)")
    .is("outcome", null)
    .in("status", ["draft", "exported"]);

  const pendingRows: PendingRow[] = ((pendingRaw as PendingQueryRow[]) ?? []).map((r) => ({
    id: r.id,
    created_by: r.created_by,
    status: r.status as PendingBid["status"],
    title:
      (r.analyses as unknown as { analysis: { title?: string } })?.analysis?.title ??
      "Namnlös RFP",
  }));
```

Change the final `return aggregate(...)` call to pass `pendingRows` as the 5th argument:

```ts
  return aggregate(
    (costRows as CostRow[]) ?? [],
    (bidRows as BidRow[]) ?? [],
    emailById,
    period,
    pendingRows
  );
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/stats.test.ts`
Expected: PASS — new mapping test + all existing tests green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/stats.ts src/lib/__tests__/stats.test.ts
git commit -m "feat: query pending bids in getWorkspaceStats"
```

---

## Task 3: `StatsTable` client component + page wiring

**Files:**
- Create: `src/app/arbetsyta/statistik/StatsTable.tsx`
- Create: `src/app/arbetsyta/statistik/__tests__/StatsTable.test.tsx`
- Modify: `src/app/arbetsyta/statistik/page.tsx`

- [ ] **Step 1: Write the failing component test**

Create `src/app/arbetsyta/statistik/__tests__/StatsTable.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StatsTable } from "../StatsTable";
import type { UserStats } from "@/lib/stats";

const user: UserStats = {
  userId: "user-aaaa1111",
  email: "stefan@example.se",
  costUsd: 10,
  bidsSubmitted: 2,
  wins: 1,
  losses: 1,
  winRate: 0.5,
  pending: [{ id: "b1", title: "RFP Alfa", status: "draft" }],
};

describe("StatsTable", () => {
  it("hides pending chips until the row is clicked, then links to the bid", () => {
    render(<StatsTable perUser={[user]} />);
    expect(screen.queryByText("RFP Alfa")).toBeNull();

    fireEvent.click(screen.getByText("stefan@example.se"));

    const link = screen.getByRole("link", { name: /RFP Alfa/ });
    expect(link).toHaveAttribute("href", "/bids/b1");
    expect(screen.getByText("Utkast")).toBeInTheDocument();
  });

  it("renders the empty-state when there are no users", () => {
    render(<StatsTable perUser={[]} />);
    expect(screen.getByText("Ingen data ännu.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/arbetsyta/statistik/__tests__/StatsTable.test.tsx`
Expected: FAIL — `Failed to resolve import "../StatsTable"` (component not created yet).

- [ ] **Step 3: Create the `StatsTable` component**

Create `src/app/arbetsyta/statistik/StatsTable.tsx`:

```tsx
"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { formatUsd, formatPct, type UserStats } from "@/lib/stats";

const STATUS_LABEL: Record<string, string> = {
  draft: "Utkast",
  exported: "Exporterat",
};

export function StatsTable({ perUser }: { perUser: UserStats[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (perUser.length === 0) {
    return <p className="py-4 text-sm text-gray-400">Ingen data ännu.</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-200 text-left text-gray-500">
          <th className="py-2 font-medium">Användare</th>
          <th className="py-2 text-right font-medium">Kostnad</th>
          <th className="py-2 text-right font-medium">Anbud</th>
          <th className="py-2 text-right font-medium">W / L</th>
          <th className="py-2 text-right font-medium">Win-rate</th>
          <th className="py-2 text-right font-medium">Pågående</th>
        </tr>
      </thead>
      <tbody>
        {perUser.map((u) => {
          const hasPending = u.pending.length > 0;
          const isOpen = expanded.has(u.userId);
          return (
            <Fragment key={u.userId}>
              <tr
                className={`border-b border-gray-100 ${hasPending ? "cursor-pointer" : ""}`}
                onClick={hasPending ? () => toggle(u.userId) : undefined}
              >
                <td className="py-2">{u.email}</td>
                <td className="py-2 text-right">{formatUsd(u.costUsd)}</td>
                <td className="py-2 text-right">{u.bidsSubmitted}</td>
                <td className="py-2 text-right">
                  {u.wins} / {u.losses}
                </td>
                <td className="py-2 text-right">{formatPct(u.winRate)}</td>
                <td className="py-2 text-right">
                  {hasPending ? (
                    <span className="text-gray-900">
                      {u.pending.length} {isOpen ? "▾" : "▸"}
                    </span>
                  ) : (
                    <span className="text-gray-300">0</span>
                  )}
                </td>
              </tr>
              {isOpen && hasPending && (
                <tr className="border-b border-gray-100 bg-gray-50">
                  <td colSpan={6} className="px-2 py-3">
                    <div className="flex flex-wrap gap-2">
                      {u.pending.map((p) => (
                        <Link
                          key={p.id}
                          href={`/bids/${p.id}`}
                          className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs hover:border-gray-400"
                        >
                          <span className="text-gray-900">{p.title}</span>
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                            {STATUS_LABEL[p.status] ?? p.status}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/arbetsyta/statistik/__tests__/StatsTable.test.tsx`
Expected: PASS — both component tests green.

- [ ] **Step 5: Wire `StatsTable` + pending plutt into `page.tsx`**

In `src/app/arbetsyta/statistik/page.tsx`:

Add the import after the existing imports (line 8):

```tsx
import { StatsTable } from "./StatsTable";
```

Replace the summary paragraph (the `<p className="mb-8 ...">` block) with one that appends the pending count:

```tsx
        <p className="mb-8 text-sm text-gray-700">
          Total: {formatUsd(stats.totalCostUsd)} · {stats.bidsSubmitted} anbud ·
          win-rate {formatPct(stats.winRate)} ({stats.wins} W / {stats.losses} L) ·{" "}
          {stats.pendingCount} pågående
        </p>
```

Replace the entire `<table className="w-full text-sm"> ... </table>` block with:

```tsx
        <StatsTable perUser={stats.perUser} />
```

Remove the now-unused `Link` import from `next/link` (line 1) ONLY IF `Link` is no longer referenced elsewhere in the file. (It is still used by the period selector `PERIODS.map`, so keep it.)

- [ ] **Step 6: Run the full test suite + typecheck**

Run: `npm test`
Expected: PASS — full suite green (existing + new).

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/arbetsyta/statistik/StatsTable.tsx src/app/arbetsyta/statistik/__tests__/StatsTable.test.tsx src/app/arbetsyta/statistik/page.tsx
git commit -m "feat: show pending bids on statistik page"
```

---

## Task 4: Verification + manual smoke

**Files:** none (verification only)

- [ ] **Step 1: Lint + build**

Run: `npm run lint`
Expected: no errors (no unused imports/vars — confirm `Fragment`, `Link`, `useState` are all used).

Run: `npm run build`
Expected: build succeeds (exit 0), `/arbetsyta/statistik` compiles.

- [ ] **Step 2: Manual browser smoke (dev server)**

Run: `npm run dev` and open `http://localhost:3000/arbetsyta/statistik` (log in via magic link if prompted).

Verify:
- Summary line ends with `… · N pågående` where N matches the number of draft/exported bids with no logged outcome.
- The table has a **Pågående** column. A user with pending bids shows `count ▸`; clicking the row expands a chip row underneath.
- Each chip shows the RFP title + an *Utkast* / *Exporterat* badge and links to `/bids/<id>`.
- A user with 0 pending shows a greyed `0` and the row does not expand.
- The period toggle (Allt / 30 dgr / I år) still changes cost/win-rate but leaves the pending count unchanged.

If the live workspace has no pending bids, generate a bid (Analysera RFP → matchning → Go/No-Go → generera anbud) without logging an outcome, then re-check.

- [ ] **Step 3: Final state**

No commit needed (verification only). If the smoke test surfaces a fix, make it, re-run `npm test`, and commit with a `fix:` message.

---

## Self-Review notes

- **Spec coverage:** pending definition (Task 2 query `.is("outcome", null).in("status", [...])`), period-ignore (Task 2, no `created_at` filter), data types (Task 1), summary plutt + table column + expander chips linking to `/bids/[id]` (Task 3), tests (Tasks 1–3). All spec sections mapped.
- **Backwards-compat:** `aggregate`'s new `pendingRows` is optional (`= []`), so the three existing `aggregate(...)` call sites and both existing `getWorkspaceStats` tests keep passing unchanged.
- **Type consistency:** `PendingBid` = `{ id, title, status }` (display); `PendingRow` = `{ id, created_by, status, title }` (aggregate input); `status` is `"draft" | "exported"` in both. `UserStats.pending: PendingBid[]`, `WorkspaceStats.pendingCount: number` used identically in component and page.
</content>
