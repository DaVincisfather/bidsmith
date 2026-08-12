# Go/No-Go "Testa bytet" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One-click apply of a go/no-go improvement suggestion: swap the suggested consultant into the locked team, re-run the assessment, and show the previous assessment as a before/after comparison.

**Architecture:** A new destructive route `POST /api/analyses/[id]/apply-swap` (unlock-team's auth/guard pattern + go-no-go's evaluator invocation) deletes the draft bid, re-evaluates with the swapped team, and INSERTS a new assessment row — the old row stays untouched because `loadFlowState` is latest-row-wins, which gives us persistent before/after for free (no migration). The UI adds a "Testa bytet" button on actionable improvement cards and a comparison panel fed by a new `previousAssessment` in flow state.

**Tech Stack:** Next.js 16 App Router route handlers, Supabase (service client), Zod, Vitest, existing `evaluateGoNoGo`.

## Design decisions (Stefan, 2026-08-12)

1. Applying a swap **deletes the existing draft bid** (confirm dialog first) — same semantics as unlock-team.
2. The **previous assessment stays visible** as comparison (win% before → after + which swap was made).
3. Known limitation, accepted for v1: re-running the evaluator can suggest the reverse swap (documented circular-swap issue, `notes/2026-04-30-go-no-go-circular-swap.md`). The comparison panel makes this visible; no prompt mitigation in this PR.
4. `estimatedImpact` is a model guess (live smoke: "+15%" became +6) — UI copy must not promise it.

## Global Constraints

- **All UI copy in Swedish**; code, comments and commits in English (global CLAUDE.md).
- **Destructive/mutating routes: `requireUser` (api-helpers) on route level BEFORE `createServiceClient()`** (project CLAUDE.md, #103 rule).
- **Surgical changes**: touch only what each task lists; match existing style. Do not remove the unused `assessmentId` prop in `go-no-go-result.tsx` — out of scope.
- **No new dependencies. No DB migration** (feature is designed to not need one).
- `tsc`+tests do NOT catch Next page/route export violations — final gate must run `next build`.
- Tests follow the repo's route-test convention: `vi.hoisted` state + hand-rolled thenable Supabase chains (template: `src/app/api/analyses/[id]/unlock-team/__tests__/route.test.ts`).
- Commit with conventional commits, staging **explicit paths only** (never `git add -A`).
- Worktree: `C:\Users\stefa\projects\bidsmith-teamswap`, branch `feat/gonogo-team-swap`. Push to remote **`bidsmith`**, not origin.
- `ScoredConsultant` name field is `consultantName` (see `go-no-go-section.tsx:185`), id field is `consultantId`.
- `requireUser` returns `ParseResult<string>`: `{ ok: true, data: userId }` or `{ ok: false, response }` (401). `parseBody`/`parseUuidParam` same union shape.

---

### Task 1: `POST /api/analyses/[id]/apply-swap` route

**Files:**
- Modify: `src/lib/api-schemas.ts` (add `ApplySwapSchema` next to `GoNoGoDecisionPatchSchema`, ~line 101)
- Create: `src/app/api/analyses/[id]/apply-swap/route.ts`
- Test: `src/app/api/analyses/[id]/apply-swap/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `evaluateGoNoGo(rfpAnalysis, teamConsultants, allScoredConsultants, userId)` from `@/lib/go-no-go-evaluator`; `fetchConsultantsByIds(supabase, ids)` from `@/lib/supabase`; `isActivelyGenerating(bid)` from `@/lib/bid-status`; helpers from `@/lib/api-helpers`.
- Produces: `POST /api/analyses/{analysisId}/apply-swap` with JSON body `{ assessmentId: string, removeId: string, addId: string }` → 200 `{ id: string, result: GoNoGoResult }`. Error statuses: 400 (bad id/body), 401 (unauthed), 404 (no assessment), 409 (stale assessment / swap doesn't match team / exported / generating), 422 (addId not in match pool), 500 (persistence/evaluator failure). Task 3's client calls this exact contract.

- [ ] **Step 1: Add the schema** in `src/lib/api-schemas.ts` directly after `GoNoGoDecisionPatchSchema`:

```ts
export const ApplySwapSchema = z.object({
  assessmentId: z.string().uuid(),
  removeId: z.string().uuid(),
  addId: z.string().uuid(),
});
```

- [ ] **Step 2: Write the failing tests** in `src/app/api/analyses/[id]/apply-swap/__tests__/route.test.ts`. Full file:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const h = vi.hoisted(() => {
  const state = {
    assessments: [] as { id: string; team_consultant_ids: string[] }[],
    analysisRow: { analysis: { title: "RFP" } } as unknown,
    matchRows: [{ team_proposal: [] }] as { team_proposal: unknown[] }[],
    bids: [] as unknown[],
    consultants: [{ id: "c-add" }] as unknown[],
    evalResult: { winProbability: 55 } as unknown,
    evalError: null as Error | null,
    evalCalls: [] as unknown[][],
    fetchCalls: [] as string[][],
    inserted: [] as Record<string, unknown>[],
    insertError: null as { message: string } | null,
    deletedFrom: [] as string[],
    deleteFilters: [] as { table: string; filters: [string, string, unknown][] }[],
    unauthed: false,
  };
  return { state };
});

vi.mock("@/lib/supabase", () => ({
  createServiceClient: () => ({
    from: (table: string) => ({
      select: () => {
        if (table === "analyses") {
          return { eq: () => ({ single: () => Promise.resolve({ data: h.state.analysisRow, error: null }) }) };
        }
        if (table === "matches") {
          return { eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: h.state.matchRows, error: null }) }) }) };
        }
        if (table === "go_no_go_assessments") {
          return { eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: h.state.assessments, error: null }) }) }) };
        }
        // bids
        return { eq: () => Promise.resolve({ data: h.state.bids, error: null }) };
      },
      insert: (payload: Record<string, unknown>) => {
        h.state.inserted.push(payload);
        return {
          select: () => ({
            single: () =>
              Promise.resolve(
                h.state.insertError
                  ? { data: null, error: h.state.insertError }
                  : { data: { id: "new-assessment-id" }, error: null },
              ),
          }),
        };
      },
      delete: () => {
        const filters: [string, string, unknown][] = [];
        const chain = {
          eq: (c: string, v: unknown) => { filters.push(["eq", c, v]); return chain; },
          is: (c: string, v: unknown) => { filters.push(["is", c, v]); return chain; },
          neq: (c: string, v: unknown) => { filters.push(["neq", c, v]); return chain; },
          then: (resolve: (v: { error: null }) => void) => {
            h.state.deletedFrom.push(table);
            h.state.deleteFilters.push({ table, filters });
            resolve({ error: null });
          },
        };
        return chain;
      },
    }),
  }),
  fetchConsultantsByIds: async (_sb: unknown, ids: string[]) => {
    h.state.fetchCalls.push(ids);
    return h.state.consultants;
  },
}));

vi.mock("@/lib/go-no-go-evaluator", () => ({
  evaluateGoNoGo: async (...args: unknown[]) => {
    h.state.evalCalls.push(args);
    if (h.state.evalError) throw h.state.evalError;
    return h.state.evalResult;
  },
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/org", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/org")>();
  return {
    ...actual,
    getUserId: async () => {
      if (h.state.unauthed) throw new actual.NotAuthenticatedError();
      return "user-1";
    },
  };
});

import { POST } from "../route";

const ANALYSIS_ID = "11111111-1111-1111-1111-111111111111";
const ASSESSMENT_ID = "22222222-2222-2222-2222-222222222222";
const REMOVE_ID = "33333333-3333-3333-3333-333333333333";
const ADD_ID = "44444444-4444-4444-4444-444444444444";
const KEEP_ID = "55555555-5555-5555-5555-555555555555";

function makeRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function validBody() {
  return { assessmentId: ASSESSMENT_ID, removeId: REMOVE_ID, addId: ADD_ID };
}

beforeEach(() => {
  h.state.assessments = [{ id: ASSESSMENT_ID, team_consultant_ids: [KEEP_ID, REMOVE_ID] }];
  h.state.analysisRow = { analysis: { title: "RFP" } };
  h.state.matchRows = [{ team_proposal: [{ consultantId: ADD_ID, consultantName: "Aram" }] }];
  h.state.bids = [];
  h.state.consultants = [{ id: "c" }];
  h.state.evalResult = { winProbability: 55 };
  h.state.evalError = null;
  h.state.evalCalls = [];
  h.state.fetchCalls = [];
  h.state.inserted = [];
  h.state.insertError = null;
  h.state.deletedFrom = [];
  h.state.deleteFilters = [];
  h.state.unauthed = false;
});

describe("POST /api/analyses/[id]/apply-swap", () => {
  it("swaps the consultant, deletes the draft bid, inserts a new assessment and keeps the old one", async () => {
    h.state.bids = [{ id: "b-1", status: "draft", exported_at: null, created_at: new Date().toISOString() }];
    const res = await POST(makeRequest(validBody()), ctx(ANALYSIS_ID));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe("new-assessment-id");
    // order preserved: remove-slot replaced in place
    expect(h.state.fetchCalls[0]).toEqual([KEEP_ID, ADD_ID]);
    expect(h.state.inserted[0]).toMatchObject({
      analysis_id: ANALYSIS_ID,
      team_consultant_ids: [KEEP_ID, ADD_ID],
    });
    // draft bid deleted with the guarded filters, old assessment NOT deleted
    expect(h.state.deletedFrom).toEqual(["bids"]);
    const bidsDelete = h.state.deleteFilters.find((d) => d.table === "bids");
    expect(bidsDelete?.filters).toContainEqual(["is", "exported_at", null]);
    expect(bidsDelete?.filters).toContainEqual(["neq", "status", "exported"]);
  });

  it("works with no bid yet (nothing to delete is fine)", async () => {
    const res = await POST(makeRequest(validBody()), ctx(ANALYSIS_ID));
    expect(res.status).toBe(200);
  });

  it("401s an unauthenticated call without evaluating or deleting", async () => {
    h.state.unauthed = true;
    const res = await POST(makeRequest(validBody()), ctx(ANALYSIS_ID));
    expect(res.status).toBe(401);
    expect(h.state.evalCalls).toHaveLength(0);
    expect(h.state.deletedFrom).toHaveLength(0);
  });

  it("400s on a malformed analysis id", async () => {
    const res = await POST(makeRequest(validBody()), ctx("not-a-uuid"));
    expect(res.status).toBe(400);
  });

  it("400s on an invalid body", async () => {
    const res = await POST(makeRequest({ assessmentId: ASSESSMENT_ID, removeId: REMOVE_ID }), ctx(ANALYSIS_ID));
    expect(res.status).toBe(400);
  });

  it("404s when the analysis has no assessment", async () => {
    h.state.assessments = [];
    const res = await POST(makeRequest(validBody()), ctx(ANALYSIS_ID));
    expect(res.status).toBe(404);
  });

  it("409s when the assessment id is stale (newer assessment exists)", async () => {
    h.state.assessments = [{ id: "99999999-9999-9999-9999-999999999999", team_consultant_ids: [KEEP_ID, REMOVE_ID] }];
    const res = await POST(makeRequest(validBody()), ctx(ANALYSIS_ID));
    expect(res.status).toBe(409);
    expect(h.state.evalCalls).toHaveLength(0);
  });

  it("409s when removeId is not in the locked team", async () => {
    h.state.assessments = [{ id: ASSESSMENT_ID, team_consultant_ids: [KEEP_ID] }];
    const res = await POST(makeRequest(validBody()), ctx(ANALYSIS_ID));
    expect(res.status).toBe(409);
  });

  it("409s when addId is already in the team", async () => {
    h.state.assessments = [{ id: ASSESSMENT_ID, team_consultant_ids: [REMOVE_ID, ADD_ID] }];
    const res = await POST(makeRequest(validBody()), ctx(ANALYSIS_ID));
    expect(res.status).toBe(409);
  });

  it("409s when the bid is exported (frozen flow), deleting nothing", async () => {
    h.state.bids = [{ id: "b-1", status: "exported", exported_at: "2026-08-01T10:00:00Z", created_at: new Date().toISOString() }];
    const res = await POST(makeRequest(validBody()), ctx(ANALYSIS_ID));
    expect(res.status).toBe(409);
    expect(h.state.deletedFrom).toHaveLength(0);
    expect(h.state.evalCalls).toHaveLength(0);
  });

  it("409s while generation is running", async () => {
    h.state.bids = [{ id: "b-1", status: "generating", exported_at: null, created_at: new Date().toISOString() }];
    const res = await POST(makeRequest(validBody()), ctx(ANALYSIS_ID));
    expect(res.status).toBe(409);
    expect(h.state.deletedFrom).toHaveLength(0);
  });

  it("422s when addId is not in the match pool", async () => {
    h.state.matchRows = [{ team_proposal: [{ consultantId: "other-id", consultantName: "X" }] }];
    const res = await POST(makeRequest(validBody()), ctx(ANALYSIS_ID));
    expect(res.status).toBe(422);
    expect(h.state.evalCalls).toHaveLength(0);
  });

  it("500s when the evaluator fails, WITHOUT deleting the draft bid", async () => {
    h.state.bids = [{ id: "b-1", status: "draft", exported_at: null, created_at: new Date().toISOString() }];
    h.state.evalError = new Error("AI down");
    const res = await POST(makeRequest(validBody()), ctx(ANALYSIS_ID));
    expect(res.status).toBe(500);
    expect(h.state.deletedFrom).toHaveLength(0);
  });

  it("500s when the assessment insert fails", async () => {
    h.state.insertError = { message: "connection lost" };
    const res = await POST(makeRequest(validBody()), ctx(ANALYSIS_ID));
    expect(res.status).toBe(500);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run (PowerShell, in `C:\Users\stefa\projects\bidsmith-teamswap`):
`npx vitest run "src/app/api/analyses/[id]/apply-swap" 2>&1 | Select-Object -Last 20`
Expected: FAIL — cannot resolve `../route`.

- [ ] **Step 4: Implement the route** — create `src/app/api/analyses/[id]/apply-swap/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, fetchConsultantsByIds } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { evaluateGoNoGo } from "@/lib/go-no-go-evaluator";
import { RfpAnalysis, ScoredConsultant } from "@/lib/types";
import { parseBody, parseUuidParam, internalError, requireUser } from "@/lib/api-helpers";
import { ApplySwapSchema } from "@/lib/api-schemas";
import { isActivelyGenerating } from "@/lib/bid-status";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Applies a go/no-go improvement suggestion: swaps removeId → addId in the
 * locked team, re-runs the assessment and INSERTS a new assessment row.
 * The previous row is deliberately kept — loadFlowState is latest-row-wins,
 * and the surviving row is what feeds the before/after comparison in the UI.
 * The draft bid is deleted (it was generated for the old team); the client
 * shows a confirm dialog before calling.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { id: rawId } = await params;
    const idResult = parseUuidParam(rawId, "analysis id");
    if (!idResult.ok) return idResult.response;
    const analysisId = idResult.data;

    const parsed = await parseBody(request, ApplySwapSchema);
    if (!parsed.ok) return parsed.response;
    const { assessmentId, removeId, addId } = parsed.data;

    // Destructive route (deletes the draft bid): route-level auth before the
    // service client, never middleware alone (#103 rule).
    const authed = await createClient();
    const auth = await requireUser(authed);
    if (!auth.ok) return auth.response;
    const userId = auth.data;

    const supabase = createServiceClient();

    const { data: assessRows, error: assessError } = await supabase
      .from("go_no_go_assessments")
      .select("id, team_consultant_ids")
      .eq("analysis_id", analysisId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (assessError) {
      return NextResponse.json({ error: assessError.message }, { status: 500 });
    }
    const latest = assessRows?.[0];
    if (!latest) {
      return NextResponse.json({ error: "Ingen bedömning att utgå från." }, { status: 404 });
    }
    if (latest.id !== assessmentId) {
      return NextResponse.json(
        { error: "Bedömningen har ändrats — ladda om sidan." },
        { status: 409 },
      );
    }

    const teamIds = (latest.team_consultant_ids as string[]) ?? [];
    if (!teamIds.includes(removeId) || teamIds.includes(addId)) {
      return NextResponse.json(
        { error: "Förslaget matchar inte det låsta teamet — ladda om sidan." },
        { status: 409 },
      );
    }

    // Same freeze/generation guards as unlock-team: an exported bid is a
    // submitted document and a running generation must not lose its bid row.
    const { data: bids, error: bidsError } = await supabase
      .from("bids")
      .select("id, status, exported_at, created_at")
      .eq("analysis_id", analysisId);
    if (bidsError) {
      return NextResponse.json({ error: bidsError.message }, { status: 500 });
    }
    const bidRows = (bids ?? []) as { id: string; status: string; exported_at: string | null; created_at: string | null }[];
    if (bidRows.some((b) => b.exported_at || b.status === "exported")) {
      return NextResponse.json(
        { error: "Anbudet är inlämnat — teamet kan inte ändras." },
        { status: 409 },
      );
    }
    if (bidRows.some((b) => isActivelyGenerating(b))) {
      return NextResponse.json(
        { error: "Generering pågår — vänta tills den är klar." },
        { status: 409 },
      );
    }

    const [analysisResult, matchResult] = await Promise.all([
      supabase.from("analyses").select("analysis").eq("id", analysisId).single(),
      supabase
        .from("matches")
        .select("team_proposal")
        .eq("analysis_id", analysisId)
        .order("created_at", { ascending: false })
        .limit(1),
    ]);
    if (analysisResult.error || !analysisResult.data) {
      return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
    }
    if (matchResult.error || !matchResult.data?.length) {
      return NextResponse.json({ error: "No match found. Run matching first." }, { status: 400 });
    }

    const rfpAnalysis = analysisResult.data.analysis as RfpAnalysis;
    const pool = (matchResult.data[0].team_proposal as ScoredConsultant[]) ?? [];
    // swapIds come from an AI response and are unvalidated at generation time —
    // the pool membership check is what makes them safe to act on.
    if (!pool.some((c) => c.consultantId === addId)) {
      return NextResponse.json(
        { error: "Konsulten i förslaget finns inte i matchningen längre — kör om matchningen." },
        { status: 422 },
      );
    }

    const newTeamIds = teamIds.map((id) => (id === removeId ? addId : id));
    const teamConsultants = await fetchConsultantsByIds(supabase, newTeamIds);

    // Evaluate BEFORE deleting the draft: an AI failure must not cost the user
    // their bid. The delete below keeps the exported/status filters so an export
    // landing mid-evaluation survives (same accepted race as unlock-team).
    const result = await evaluateGoNoGo(rfpAnalysis, teamConsultants, pool, userId);

    const { error: delBidsError } = await supabase
      .from("bids")
      .delete()
      .eq("analysis_id", analysisId)
      .is("exported_at", null)
      .neq("status", "exported");
    if (delBidsError) {
      return NextResponse.json({ error: delBidsError.message }, { status: 500 });
    }

    const { data: created, error: saveError } = await supabase
      .from("go_no_go_assessments")
      .insert({
        analysis_id: analysisId,
        team_consultant_ids: newTeamIds,
        result,
      })
      .select()
      .single();
    if (saveError) {
      return NextResponse.json({ error: saveError.message }, { status: 500 });
    }

    return NextResponse.json({ id: created.id, result });
  } catch (err) {
    return internalError(err);
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run "src/app/api/analyses/[id]/apply-swap" 2>&1 | Select-Object -Last 20`
Expected: all 14 PASS.

- [ ] **Step 6: Commit**

```powershell
git add "src/lib/api-schemas.ts" "src/app/api/analyses/[id]/apply-swap/route.ts" "src/app/api/analyses/[id]/apply-swap/__tests__/route.test.ts"
git commit -m "feat: apply-swap endpoint — swap consultant, re-assess, keep old assessment"
```

---

### Task 2: `previousAssessment` in flow state

**Files:**
- Modify: `src/lib/flow-state.ts`
- Test: `src/lib/__tests__/flow-state.test.ts` (exists — extend)

**Interfaces:**
- Consumes: nothing new.
- Produces: `FlowState.previousAssessment: FlowAssessment | null` — the second-newest assessment row, or null. `FlowAssessment` shape unchanged. Task 3 consumes this.

- [ ] **Step 1: Extend the tests.** Read `src/lib/__tests__/flow-state.test.ts` first. It asserts the latest-row contract (every table queried with `created_at desc` + `limit 1`). Update the `go_no_go_assessments` expectation to `limit 2`, and add:

```ts
it("exposes the second-newest assessment as previousAssessment", async () => {
  // arrange the mock so go_no_go_assessments returns two rows, newest first
  // (reuse the file's existing row-builder helpers)
  // assert: state.assessment.id === newest id
  // assert: state.previousAssessment?.id === older id
});

it("previousAssessment is null with a single assessment row", async () => {
  // one row → assessment set, previousAssessment === null
});
```

Write these as real tests using the file's existing mock helpers — read how `assessment` rows are injected today and mirror it. The exact helper names live in the test file; follow them.

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/lib/__tests__/flow-state.test.ts 2>&1 | Select-Object -Last 20`
Expected: new tests FAIL (`previousAssessment` undefined; limit still 1).

- [ ] **Step 3: Implement** in `src/lib/flow-state.ts`:

1. In `FlowState`, add `previousAssessment: FlowAssessment | null;` after `assessment`.
2. Change the assessments query `.limit(1)` → `.limit(2)` and update the comment above it:

```ts
    // limit(2): [0] is the active assessment, [1] (if any) is the assessment it
    // replaced via apply-swap — surfaced as previousAssessment for the
    // before/after comparison on the go/no-go page.
```

3. Extract the row mapper and use it for both rows:

```ts
  const toAssessment = (row: NonNullable<typeof a>): FlowAssessment => ({
    id: row.id as string,
    teamConsultantIds: (row.team_consultant_ids as string[]) ?? [],
    result: row.result as GoNoGoResult,
    decision: (row.decision as "go" | "no-go" | null) ?? null,
  });
```

and in the return object:

```ts
    assessment: a ? toAssessment(a) : null,
    previousAssessment: assessmentRes.data?.[1] ? toAssessment(assessmentRes.data[1]) : null,
```

- [ ] **Step 4: Run the full flow-state suite**

Run: `npx vitest run src/lib/__tests__/flow-state.test.ts 2>&1 | Select-Object -Last 20`
Expected: PASS (including the updated limit-contract test).

- [ ] **Step 5: Commit**

```powershell
git add src/lib/flow-state.ts src/lib/__tests__/flow-state.test.ts
git commit -m "feat: expose previousAssessment (second-newest row) in flow state"
```

---

### Task 3: UI — "Testa bytet" button + before/after comparison

**Files:**
- Create: `src/lib/team-diff.ts`
- Test: `src/lib/__tests__/team-diff.test.ts`
- Modify: `src/app/analysis/[id]/go-no-go/page.tsx` (pass `previousAssessment`)
- Modify: `src/components/go-no-go-section.tsx` (swap handler, comparison panel, ForgeLoader)
- Modify: `src/components/go-no-go-result.tsx` (button on actionable improvement cards)

**Interfaces:**
- Consumes: Task 1's endpoint contract; Task 2's `previousAssessment`; `ImprovementSuggestion` from `@/lib/types` (has `swap: { remove, add } | null` and `swapIds: { removeId, addId } | null`, all leaves nullable); `ForgeLoader` from `src/components/ForgeLoader.tsx`.
- Produces: `deriveSwapComparison(prev, current, pool): SwapComparison | null` where `SwapComparison = { removed: string[]; added: string[]; prevWinProbability: number }` (names resolved from pool, fallback `"okänd konsult"`).

- [ ] **Step 1: Write failing tests** for the diff helper, `src/lib/__tests__/team-diff.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/__tests__/team-diff.test.ts 2>&1 | Select-Object -Last 20`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** `src/lib/team-diff.ts`:

```ts
import type { ScoredConsultant } from "@/lib/types";

export interface SwapComparison {
  removed: string[];
  added: string[];
  prevWinProbability: number;
}

/**
 * Diffs two locked teams for the go/no-go before/after panel. Names resolve
 * from the match pool — a deleted consultant degrades to a label, never a crash.
 */
export function deriveSwapComparison(
  prev: { teamConsultantIds: string[]; result: { winProbability: number } },
  current: { teamConsultantIds: string[] },
  pool: ScoredConsultant[],
): SwapComparison | null {
  const prevIds = new Set(prev.teamConsultantIds);
  const currIds = new Set(current.teamConsultantIds);
  const removed = prev.teamConsultantIds.filter((id) => !currIds.has(id));
  const added = current.teamConsultantIds.filter((id) => !prevIds.has(id));
  if (removed.length === 0 && added.length === 0) return null;
  const name = (id: string) =>
    pool.find((c) => c.consultantId === id)?.consultantName ?? "okänd konsult";
  return {
    removed: removed.map(name),
    added: added.map(name),
    prevWinProbability: prev.result.winProbability,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/__tests__/team-diff.test.ts 2>&1 | Select-Object -Last 20`
Expected: 4 PASS.

- [ ] **Step 5: Wire the UI.** Read all three files fully before editing.

**`src/app/analysis/[id]/go-no-go/page.tsx`** — add to the `GoNoGoSection` props: `previousAssessment={flow.previousAssessment}`.

**`src/components/go-no-go-section.tsx`:**
1. Props: add `previousAssessment: FlowAssessment | null;` to `GoNoGoSectionProps` (import type from `@/lib/flow-state` — check how `assessment`/`match` types are imported today and follow it).
2. Widen working state: `useState<"generate" | "unlock" | "swap" | null>(null)`.
3. Add the handler (place after `unlock()`):

```tsx
  async function applySwap(imp: ImprovementSuggestion) {
    const ids = imp.swapIds;
    if (!ids?.removeId || !ids?.addId) return;
    const swapText =
      imp.swap?.remove && imp.swap?.add ? `${imp.swap.remove} → ${imp.swap.add}` : "föreslaget byte";
    const message = bid
      ? `Detta raderar anbudsutkastet och kör en ny bedömning med bytet ${swapText}. Fortsätt?`
      : `Detta kör en ny bedömning med bytet ${swapText}. Fortsätt?`;
    if (!window.confirm(message)) return;
    setWorking("swap");
    setError(null);
    try {
      const res = await fetch(`/api/analyses/${analysisId}/apply-swap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assessmentId: assessment.id, removeId: ids.removeId, addId: ids.addId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Bytet kunde inte genomföras");
      }
      router.refresh();
      if (!mountedRef.current) return;
      setWorking(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : "Something went wrong");
      setWorking(null);
    }
  }
```

(`ImprovementSuggestion` imported from `@/lib/types`.)

4. Comparison panel + loader, rendered where `GoNoGoResultView` is rendered today (read the JSX tail of the file). Directly ABOVE the result view:

```tsx
      {comparison && (
        <div className="border border-rule rounded-lg px-4 py-3 bg-paper-2 text-sm text-ink-soft">
          Föregående bedömning:{" "}
          <span className="font-medium">{comparison.prevWinProbability} %</span>
          {" → "}
          <span className="font-medium">{assessment.result.winProbability} %</span>
          {comparison.removed.length > 0 && comparison.added.length > 0 && (
            <> · byte: {comparison.removed.join(", ")} → {comparison.added.join(", ")}</>
          )}
        </div>
      )}
      {working === "swap" && (
        <div className="flex justify-center py-6">
          <ForgeLoader size={64} />
        </div>
      )}
```

with, near the top of the component body:

```tsx
  const comparison =
    previousAssessment && match
      ? deriveSwapComparison(previousAssessment, assessment, match.scoredConsultants)
      : null;
```

5. Pass the handler to the result view — swap button must not exist on a frozen flow:

```tsx
      onApplySwap={frozen ? undefined : applySwap}
      swapDisabled={working !== null}
```

**`src/components/go-no-go-result.tsx`:**
1. Props:

```ts
import { GoNoGoResult, GoNoGoRecommendation, ImprovementSuggestion } from "@/lib/types";

interface GoNoGoResultProps {
  result: GoNoGoResult;
  assessmentId: string;
  /** Page-level action buttons (generate/open/unlock) — supplied by the caller. */
  actions: React.ReactNode;
  /** When set, actionable improvement cards render a "Testa bytet" button. */
  onApplySwap?: (imp: ImprovementSuggestion) => void;
  swapDisabled?: boolean;
}
```

and destructure `{ result, actions, onApplySwap, swapDisabled }`.

2. Inside the improvement card (after the `<p>` with `imp.reason`):

```tsx
                  {onApplySwap && imp.swapIds?.removeId && imp.swapIds?.addId && (
                    <button
                      onClick={() => onApplySwap(imp)}
                      disabled={swapDisabled}
                      className="mt-2 border border-blue-300 text-blue-900 px-3 py-1.5 rounded-lg
                                 text-sm font-medium hover:bg-blue-100 disabled:opacity-50
                                 disabled:cursor-not-allowed transition-colors"
                    >
                      Testa bytet
                    </button>
                  )}
```

- [ ] **Step 6: Verify gates**

Run: `npx vitest run 2>&1 | Select-Object -Last 6` then `npx tsc --noEmit` then `npx eslint . 2>&1 | Select-Object -Last 6`
Expected: suite green, tsc clean, lint 0 errors.

- [ ] **Step 7: Commit**

```powershell
git add "src/lib/team-diff.ts" "src/lib/__tests__/team-diff.test.ts" "src/app/analysis/[id]/go-no-go/page.tsx" "src/components/go-no-go-section.tsx" "src/components/go-no-go-result.tsx"
git commit -m "feat: apply-swap button on improvement cards + before/after comparison panel"
```

---

### Task 4: Route-level auth on `POST /api/go-no-go`

Alignment with the CLAUDE.md rule (mutating route + service client must `requireUser`). Verified safe: the only HTTP caller outside the browser is `scripts/demo-seed.mjs`, which authenticates via `mintSessionCookies`.

**Files:**
- Modify: `src/app/api/go-no-go/route.ts:16-18`
- Test: `src/app/api/go-no-go/__tests__/route.test.ts` (create)

**Interfaces:**
- Consumes: `requireUser` from `@/lib/api-helpers` (returns `{ ok: true, data: userId }` | `{ ok: false, response }`).
- Produces: unauthenticated `POST /api/go-no-go` now returns 401 (was: 500 via `internalError`). Authenticated behavior unchanged.

- [ ] **Step 1: Write failing tests**, `src/app/api/go-no-go/__tests__/route.test.ts` — same mock skeleton as Task 1's test (reuse the `vi.hoisted` + `@/lib/org` unauthed-switch pattern; mock `@/lib/go-no-go-evaluator` and `@/lib/supabase` inert). Two tests:

```ts
it("401s an unauthenticated call without inserting anything", async () => {
  h.state.unauthed = true;
  const res = await POST(makeRequest({ analysisId: "11111111-1111-1111-1111-111111111111" }));
  expect(res.status).toBe(401);
  expect(h.state.inserted).toHaveLength(0);
});

it("400s on an invalid body", async () => {
  const res = await POST(makeRequest({}));
  expect(res.status).toBe(400);
});
```

(`makeRequest` as in Task 1; `POST` here takes only the request — no ctx param. The 401 test FAILS pre-change: today the `NotAuthenticatedError` becomes a 500.)

- [ ] **Step 2: Run to verify the 401 test fails (expect 500 today)**

Run: `npx vitest run src/app/api/go-no-go/__tests__ 2>&1 | Select-Object -Last 20`

- [ ] **Step 3: Implement** — in `src/app/api/go-no-go/route.ts`, replace lines 16-18:

```ts
  // Middleware guarantees authentication; no org scoping in single-workspace model.
  const authed = await createClient();
  const userId = await getUserId(authed);
```

with:

```ts
  // Mutating route + service client: route-level auth, never middleware alone
  // (#103 rule). requireUser also supplies the userId for attribution.
  const authed = await createClient();
  const auth = await requireUser(authed);
  if (!auth.ok) return auth.response;
  const userId = auth.data;
```

Update imports: add `requireUser` to the `@/lib/api-helpers` import; remove the now-unused `getUserId` import from `@/lib/org` (verify it has no other use in the file first).

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/app/api/go-no-go/__tests__ 2>&1 | Select-Object -Last 20`
Expected: 2 PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/app/api/go-no-go/route.ts src/app/api/go-no-go/__tests__/route.test.ts
git commit -m "fix: route-level auth on POST /api/go-no-go (401 instead of 500, service-client rule)"
```

---

### Task 5: Roadmap, full gates, live verification, PR

**Files:**
- Modify: `notes/ROADMAP.md` (status in the same PR as the change — repo rule)

- [ ] **Step 1: Update `notes/ROADMAP.md`.** Add to the live backlog (Backlog — LIVE efter MD-pivoten), as new bullets:
  - Delivered note for this PR: apply-swap button + comparison panel + go-no-go route auth (one bullet, marked with the PR number once known).
  - Smoke findings 2026-08-12 (polish/product, from Stefan's click-smoke): (1) go/no-go copy mixes English ("should-krav 2") — hydration/prompt label pass wanted; (2) generation wait UX: user stays on go/no-go page with only a button label for ~2 min — candidate: navigate to the editor immediately on 202 so GeneratingChapterList/ForgeLoader carries the wait (Stefan leaning yes, decide separately); (3) export-freeze semantics questioned ("kanske lite onödigt") — tied to outcome tracking, needs a real product decision; (4) circular-swap limitation now user-visible via the apply-swap button (v1 accepts it, comparison panel exposes it).

- [ ] **Step 2: Full gates in the worktree**

Run in `C:\Users\stefa\projects\bidsmith-teamswap`:
1. `npx vitest run 2>&1 | Select-Object -Last 6` — expect green (~1393+ tests)
2. `npx tsc --noEmit` — expect silence
3. `npx eslint . 2>&1 | Select-Object -Last 6` — expect 0 errors
4. `npx next build 2>&1 | Select-Object -Last 12` — MANDATORY (new route + page prop changes; tsc misses route-export violations)

- [ ] **Step 3: Live verification (visual, non-destructive)**

Start dev on a free port: `$env:PORT='3001'; npm run dev` (background). Mint a cookie with `tmp/dev-auth-cookie.mjs` (copy from `bidsmith-main/tmp/` if missing — it is gitignored) and screenshot `http://localhost:3001/analysis/ad11c991-bfa2-4b20-82c4-4e4f54ed2df6/go-no-go` via the browse tool/Playwright recipe. Verify: improvement cards show "Testa bytet" only where swapIds are complete; comparison panel visible iff a previous assessment exists (Stefan's manual re-lock created assessment history — if the panel shows a confusing diff for non-swap history, check with Stefan before shipping copy changes). Do NOT click the button against the shared dev DB — Stefan smoke-tests the destructive path himself.

- [ ] **Step 4: Push and open PR**

```powershell
git push -u bidsmith feat/gonogo-team-swap
gh pr create --repo DaVincisfather/bidsmith --title "Apply-swap: one-click team swap from go/no-go improvement suggestions" --body "<summary per repo conventions>"
```

Then: wait for the PR review routine's comment (repo has an active routine; rebase in its auto-commits if any), address findings, and hand to Stefan for the destructive-path click-smoke (apply a swap in dev) before merge.

---

## Self-review notes

- Spec coverage: button (T1+T3), draft deletion w/ confirm (T1 route + T3 dialog), re-run assessment (T1), old assessment visible (T2+T3), auth rule (T1+T4), roadmap (T5). Circular-swap: documented, deliberately unmitigated.
- Types consistent: `ApplySwapSchema` field names match the client fetch body; `deriveSwapComparison` consumes `FlowAssessment`-shaped objects and `ScoredConsultant.consultantName`; `requireUser` union used identically in T1/T4.
- No placeholders: every code step carries the actual code; T2 step 1 delegates helper names to the existing test file by instruction (file must be read first), with concrete assertions specified.
