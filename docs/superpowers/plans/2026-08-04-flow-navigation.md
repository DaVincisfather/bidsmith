# Flow Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Navigable, reload-proof core flow: Analys & team → Go/No-Go (own page) → Bid editor, with one-analysis-one-bid semantics (draft replaced, exported frozen, hard reset on unlock).

**Architecture:** A server-side `loadFlowState(analysisId)` is the single source of truth for step status; a shared `FlowNav` renders it on all three pages. `POST /api/bids` gains replace semantics; a new `POST /api/analyses/[id]/unlock-team` performs the hard reset. Go/no-go UI moves out of `analysis-match-section.tsx` to a new page.

**Tech Stack:** Next.js 16 App Router (server components + `after()`), Supabase (tables `matches`, `go_no_go_assessments`, `bids`), vitest + @testing-library/react, Tailwind v4 tokens.

**Spec:** `docs/superpowers/specs/2026-08-04-flow-navigation-design.md`

## Global Constraints

- Worktree: `~/projects/bidsmith-flownav`, branch `feat/flow-navigation` from `main`; copy `.env.local`, run `npm install` first; push to remote `bidsmith` (NOT origin).
- UI copy in Swedish; code/comments/commits in English. TypeScript strict — no `any` without a comment.
- Files under ~300 lines. Follow existing tokens (`bg-paper`, `text-ink`, `border-rule`, `accent`) — NO new visual design decisions.
- `page.tsx`/`route.ts` may only export Next-allowed fields — `tsc` does NOT catch violations; only `next build` does. Task 8 runs it.
- Stage with explicit paths (never `git add -A`). Conventional commits.
- Do not touch: export routes, `run-bid-generation.ts` internals, foreign/PPTX paths.
- DB status values (existing, reuse verbatim): `"generating" | "draft" | "failed" | "exported"`; freeze test = `exported_at != null || status === "exported"`.

---

### Task 1: `loadFlowState` — server-derived flow state

**Files:**
- Create: `src/lib/flow-state.ts`
- Test: `src/lib/__tests__/flow-state.test.ts`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/server`; types `GoNoGoResult`, `ScoredConsultant` from `@/lib/types`.
- Produces (used by Tasks 5–7):

```ts
export interface FlowMatch { id: string; scoredConsultants: ScoredConsultant[] }
export interface FlowAssessment {
  id: string; teamConsultantIds: string[]; result: GoNoGoResult;
  decision: "go" | "no-go" | null;
}
export interface FlowBid {
  id: string; status: string; exportedAt: string | null; hasFailures: boolean;
}
export interface FlowState {
  match: FlowMatch | null; assessment: FlowAssessment | null; bid: FlowBid | null;
}
export async function loadFlowState(analysisId: string): Promise<FlowState>
```

- [ ] **Step 1: Write the failing test**

`src/lib/__tests__/flow-state.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const state = {
    rows: {} as Record<string, unknown[]>,
  };
  return { state };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () =>
              Promise.resolve({ data: h.state.rows[table] ?? [], error: null }),
          }),
        }),
      }),
    }),
  }),
}));

import { loadFlowState } from "../flow-state";

const RESULT = { recommendation: "go" } as never;

beforeEach(() => {
  h.state.rows = {};
});

describe("loadFlowState", () => {
  it("returns all-null flow when nothing exists (fresh analysis)", async () => {
    const flow = await loadFlowState("a-1");
    expect(flow).toEqual({ match: null, assessment: null, bid: null });
  });

  it("maps match, assessment and bid rows to flow state", async () => {
    h.state.rows = {
      matches: [{ id: "m-1", team_proposal: [{ consultantId: "c-1" }] }],
      go_no_go_assessments: [
        { id: "g-1", team_consultant_ids: ["c-1"], result: RESULT, decision: "go" },
      ],
      bids: [{ id: "b-1", status: "draft", exported_at: null, failed_bundles: [] }],
    };
    const flow = await loadFlowState("a-1");
    expect(flow.match?.id).toBe("m-1");
    expect(flow.assessment).toEqual({
      id: "g-1", teamConsultantIds: ["c-1"], result: RESULT, decision: "go",
    });
    expect(flow.bid).toEqual({
      id: "b-1", status: "draft", exportedAt: null, hasFailures: false,
    });
  });

  it("flags failures and preserves exportedAt", async () => {
    h.state.rows = {
      bids: [{
        id: "b-1", status: "exported",
        exported_at: "2026-08-01T10:00:00Z", failed_bundles: [{ bundle: "phases" }],
      }],
    };
    const flow = await loadFlowState("a-1");
    expect(flow.bid?.exportedAt).toBe("2026-08-01T10:00:00Z");
    expect(flow.bid?.hasFailures).toBe(true);
  });

  it("normalises null decision and null team ids", async () => {
    h.state.rows = {
      go_no_go_assessments: [
        { id: "g-1", team_consultant_ids: null, result: RESULT, decision: null },
      ],
    };
    const flow = await loadFlowState("a-1");
    expect(flow.assessment?.teamConsultantIds).toEqual([]);
    expect(flow.assessment?.decision).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/flow-state.test.ts`
Expected: FAIL — `Cannot find module '../flow-state'`

- [ ] **Step 3: Write the implementation**

`src/lib/flow-state.ts`:

```ts
import { createClient } from "@/lib/supabase/server";
import type { GoNoGoResult, ScoredConsultant } from "@/lib/types";

export interface FlowMatch {
  id: string;
  scoredConsultants: ScoredConsultant[];
}

export interface FlowAssessment {
  id: string;
  teamConsultantIds: string[];
  result: GoNoGoResult;
  decision: "go" | "no-go" | null;
}

export interface FlowBid {
  id: string;
  status: string;
  exportedAt: string | null;
  hasFailures: boolean;
}

export interface FlowState {
  match: FlowMatch | null;
  assessment: FlowAssessment | null;
  bid: FlowBid | null;
}

/**
 * Single source of truth for the analysis → go/no-go → bid step chain.
 * "Latest row wins" also absorbs legacy data where an analysis accumulated
 * several assessments/bids before the one-bid-per-analysis rule (spec 2026-08-04).
 */
export async function loadFlowState(analysisId: string): Promise<FlowState> {
  const supabase = await createClient();

  const [matchRes, assessmentRes, bidRes] = await Promise.all([
    supabase
      .from("matches")
      .select("id, team_proposal")
      .eq("analysis_id", analysisId)
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("go_no_go_assessments")
      .select("id, team_consultant_ids, result, decision")
      .eq("analysis_id", analysisId)
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("bids")
      .select("id, status, exported_at, failed_bundles")
      .eq("analysis_id", analysisId)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const m = matchRes.data?.[0];
  const a = assessmentRes.data?.[0];
  const b = bidRes.data?.[0];

  return {
    match: m
      ? { id: m.id as string, scoredConsultants: (m.team_proposal as ScoredConsultant[]) ?? [] }
      : null,
    assessment: a
      ? {
          id: a.id as string,
          teamConsultantIds: (a.team_consultant_ids as string[]) ?? [],
          result: a.result as GoNoGoResult,
          decision: (a.decision as "go" | "no-go" | null) ?? null,
        }
      : null,
    bid: b
      ? {
          id: b.id as string,
          status: b.status as string,
          exportedAt: (b.exported_at as string | null) ?? null,
          hasFailures: ((b.failed_bundles as unknown[]) ?? []).length > 0,
        }
      : null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/flow-state.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/flow-state.ts src/lib/__tests__/flow-state.test.ts
git commit -m "feat: loadFlowState — server-derived step chain for flow nav"
```

---

### Task 2: `FlowNav` component

**Files:**
- Create: `src/components/flow-nav.tsx`
- Test: `src/components/__tests__/flow-nav.test.tsx`

**Interfaces:**
- Consumes: nothing project-specific (pure presentational; `next/link`).
- Produces (used by Tasks 5–7):

```ts
export type FlowStep = "analysis" | "gonogo" | "bid";
export function FlowNav(props: {
  analysisId: string;
  active: FlowStep;
  gonogoEnabled: boolean;
  bidId: string | null;
  bidFailed?: boolean;
}): JSX.Element
```

- [ ] **Step 1: Write the failing test**

`src/components/__tests__/flow-nav.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FlowNav } from "../flow-nav";

describe("FlowNav", () => {
  it("disables Go/No-Go and Anbud on a fresh analysis, with explanatory tooltips", () => {
    render(
      <FlowNav analysisId="a-1" active="analysis" gonogoEnabled={false} bidId={null} />,
    );
    expect(screen.getByText("Analys & team")).toHaveAttribute("aria-current", "step");
    const gonogo = screen.getByText("Go/No-Go");
    expect(gonogo.closest("a")).toBeNull();
    expect(gonogo).toHaveAttribute("title", "Lås teamet först");
    const bid = screen.getByText("Anbud");
    expect(bid.closest("a")).toBeNull();
    expect(bid).toHaveAttribute("title", "Kör Go/No-Go och generera först");
  });

  it("links completed steps to their pages", () => {
    render(
      <FlowNav analysisId="a-1" active="gonogo" gonogoEnabled={true} bidId="b-1" />,
    );
    expect(screen.getByText("Analys & team").closest("a")).toHaveAttribute(
      "href", "/analysis/a-1",
    );
    expect(screen.getByText("Go/No-Go")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("Anbud").closest("a")).toHaveAttribute("href", "/bids/b-1");
  });

  it("marks a failed bid in the step label", () => {
    render(
      <FlowNav analysisId="a-1" active="gonogo" gonogoEnabled={true} bidId="b-1" bidFailed />,
    );
    expect(screen.getByText(/misslyckad/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/__tests__/flow-nav.test.tsx`
Expected: FAIL — `Cannot find module '../flow-nav'`

- [ ] **Step 3: Write the implementation**

`src/components/flow-nav.tsx`:

```tsx
import Link from "next/link";

export type FlowStep = "analysis" | "gonogo" | "bid";

interface FlowNavProps {
  analysisId: string;
  active: FlowStep;
  /** true when a go/no-go assessment exists for the analysis */
  gonogoEnabled: boolean;
  /** bid id when a bid exists (draft/failed/exported) — enables the Anbud step */
  bidId: string | null;
  bidFailed?: boolean;
}

interface StepDef {
  key: FlowStep;
  label: string;
  href: string;
  enabled: boolean;
  hint?: string;
}

export function FlowNav({ analysisId, active, gonogoEnabled, bidId, bidFailed = false }: FlowNavProps) {
  const steps: StepDef[] = [
    {
      key: "analysis",
      label: "Analys & team",
      href: `/analysis/${analysisId}`,
      enabled: true,
    },
    {
      key: "gonogo",
      label: "Go/No-Go",
      href: `/analysis/${analysisId}/go-no-go`,
      enabled: gonogoEnabled,
      hint: "Lås teamet först",
    },
    {
      key: "bid",
      label: bidFailed ? "Anbud (misslyckad generering)" : "Anbud",
      href: bidId ? `/bids/${bidId}` : "#",
      enabled: bidId !== null,
      hint: "Kör Go/No-Go och generera först",
    },
  ];

  return (
    <nav aria-label="Anbudsflöde" className="border-b border-rule bg-paper">
      <ol className="max-w-3xl mx-auto px-6 flex items-center text-sm">
        {steps.map((s, i) => (
          <li key={s.key} className="flex items-center">
            {i > 0 && (
              <span aria-hidden className="text-ink-mute px-2">
                →
              </span>
            )}
            {s.key === active ? (
              <span
                aria-current="step"
                className="px-1 py-2.5 font-medium text-ink border-b-2 border-accent"
              >
                {s.label}
              </span>
            ) : s.enabled ? (
              <Link
                href={s.href}
                className="px-1 py-2.5 text-ink-soft hover:text-ink transition-colors"
              >
                {s.label}
              </Link>
            ) : (
              <span
                aria-disabled="true"
                title={s.hint}
                className="px-1 py-2.5 text-ink-mute/60 cursor-not-allowed"
              >
                {s.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/__tests__/flow-nav.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/flow-nav.tsx src/components/__tests__/flow-nav.test.tsx
git commit -m "feat: FlowNav step navigation component"
```

---

### Task 3: `POST /api/bids` replace semantics

**Files:**
- Modify: `src/app/api/bids/route.ts` (existing-bid guard + update-instead-of-insert branch)
- Test: `src/app/api/bids/__tests__/route.test.ts` (new)

**Interfaces:**
- Consumes: existing route internals (context fetch, `runBidGeneration`, `loadActiveTemplate`).
- Produces: unchanged response shape `{ id, status: "generating" }` (202). New error responses: `409 { error: "Generering pågår redan för den här analysen." }`, `409 { error: "Anbudet är inlämnat och fryst — utfallet spårar det." }`. Task 5's client relies on these.

- [ ] **Step 1: Write the failing test**

`src/app/api/bids/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const h = vi.hoisted(() => {
  const state = {
    existingBids: [] as unknown[],
    updatePayloads: [] as Record<string, unknown>[],
    insertPayloads: [] as Record<string, unknown>[],
    afterCallbacks: [] as (() => unknown)[],
  };
  return { state };
});

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (fn: () => unknown) => h.state.afterCallbacks.push(fn) };
});

vi.mock("@/lib/supabase", () => ({
  EMPTY_GO_NO_GO: {},
  fetchConsultantsByIds: async () => [],
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === "bids") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => Promise.resolve({ data: h.state.existingBids, error: null }),
              }),
            }),
          }),
          insert: (payload: Record<string, unknown>) => {
            h.state.insertPayloads.push(payload);
            return {
              select: () => ({
                single: () => Promise.resolve({ data: { id: "b-new", ...payload }, error: null }),
              }),
            };
          },
          update: (payload: Record<string, unknown>) => {
            h.state.updatePayloads.push(payload);
            return { eq: () => Promise.resolve({ error: null }) };
          },
        };
      }
      // analyses / go_no_go_assessments / matches context fetches
      return {
        select: () => ({
          eq: (_col: string, _v: string) => ({
            single: () => Promise.resolve({ data: { analysis: { title: "T" } }, error: null }),
            order: () => ({
              limit: () => Promise.resolve({ data: [{ team_proposal: [] }], error: null }),
            }),
          }),
        }),
      };
    },
  }),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/org", () => ({ getUserId: async () => "user-1" }));
vi.mock("@/lib/org-profile", () => ({ loadActiveProfile: async () => null }));
vi.mock("@/lib/pptx-template/active-template", () => ({
  loadActiveTemplate: async () => ({ id: "tpl-1", manifest: { budgets: {}, fieldSlides: [] } }),
}));
vi.mock("@/lib/bid-generator/run-bid-generation", () => ({
  runBidGeneration: vi.fn(async () => undefined),
}));

import { POST } from "../route";

function makeRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

const BODY = { analysisId: "a-1", teamConsultantIds: ["c-1"] };

beforeEach(() => {
  h.state.existingBids = [];
  h.state.updatePayloads = [];
  h.state.insertPayloads = [];
  h.state.afterCallbacks = [];
});

describe("POST /api/bids — one bid per analysis", () => {
  it("creates a new bid when the analysis has none", async () => {
    const res = await POST(makeRequest(BODY));
    expect(res.status).toBe(202);
    expect((await res.json()).id).toBe("b-new");
    expect(h.state.insertPayloads).toHaveLength(1);
    expect(h.state.updatePayloads).toHaveLength(0);
    expect(h.state.afterCallbacks).toHaveLength(1);
  });

  it("replaces a draft in place: same id, wiped sections/failures, regeneration queued", async () => {
    h.state.existingBids = [{ id: "b-1", status: "draft", exported_at: null }];
    const res = await POST(makeRequest(BODY));
    expect(res.status).toBe(202);
    expect((await res.json()).id).toBe("b-1");
    expect(h.state.insertPayloads).toHaveLength(0);
    expect(h.state.updatePayloads).toHaveLength(1);
    const payload = h.state.updatePayloads[0];
    expect(payload.sections).toEqual([]);
    expect(payload.failed_bundles).toEqual([]);
    expect(payload.generation_error).toBeNull();
    expect(payload.status).toBe("generating");
    expect(h.state.afterCallbacks).toHaveLength(1);
  });

  it("replaces a failed bid the same way (rerun path)", async () => {
    h.state.existingBids = [{ id: "b-1", status: "failed", exported_at: null }];
    const res = await POST(makeRequest(BODY));
    expect(res.status).toBe(202);
    expect((await res.json()).id).toBe("b-1");
  });

  it("409s while a generation is running, touching nothing", async () => {
    h.state.existingBids = [{ id: "b-1", status: "generating", exported_at: null }];
    const res = await POST(makeRequest(BODY));
    expect(res.status).toBe(409);
    expect(h.state.updatePayloads).toHaveLength(0);
    expect(h.state.afterCallbacks).toHaveLength(0);
  });

  it("409s on an exported (frozen) bid, touching nothing", async () => {
    h.state.existingBids = [
      { id: "b-1", status: "exported", exported_at: "2026-08-01T10:00:00Z" },
    ];
    const res = await POST(makeRequest(BODY));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("fryst");
    expect(h.state.updatePayloads).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/bids/__tests__/route.test.ts`
Expected: FAIL — the two replace tests and the two 409 tests fail (today's route always inserts).

- [ ] **Step 3: Modify the route**

In `src/app/api/bids/route.ts`, add the existing-bid lookup to the parallel context fetch and branch create/replace. Replace the block from `// Fetch all context in parallel` through the `bidError` check with:

```ts
  // Fetch all context in parallel — including the analysis' existing bid:
  // one analysis owns at most one bid (spec 2026-08-04). Drafts are replaced
  // in place, exported bids are frozen.
  const [analysisResult, assessmentResult, matchResult, teamConsultants, existingBidResult] =
    await Promise.all([
      supabase.from("analyses").select("analysis").eq("id", analysisId).single(),
      assessmentId
        ? supabase.from("go_no_go_assessments").select("result").eq("id", assessmentId).single()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from("matches")
        .select("team_proposal")
        .eq("analysis_id", analysisId)
        .order("created_at", { ascending: false })
        .limit(1),
      fetchConsultantsByIds(supabase, teamConsultantIds),
      supabase
        .from("bids")
        .select("id, status, exported_at")
        .eq("analysis_id", analysisId)
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

  if (analysisResult.error || !analysisResult.data) {
    return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
  }

  const existing = existingBidResult.data?.[0] as
    | { id: string; status: string; exported_at: string | null }
    | undefined;
  if (existing && (existing.exported_at || existing.status === "exported")) {
    return NextResponse.json(
      { error: "Anbudet är inlämnat och fryst — utfallet spårar det." },
      { status: 409 },
    );
  }
  if (existing && existing.status === "generating") {
    return NextResponse.json(
      { error: "Generering pågår redan för den här analysen." },
      { status: 409 },
    );
  }

  const rfpAnalysis = analysisResult.data.analysis as RfpAnalysis;
  const goNoGoResult = (assessmentResult.data?.result as GoNoGoResult) ?? null;
  const allScoredConsultants = (matchResult.data?.[0]?.team_proposal as ScoredConsultant[]) ?? [];

  // Resolve the active template up front so the bid records which template it
  // was generated against (export/editor must reuse the same — budgets were
  // computed for it). Falls back to the bundled anbudsmall-v2 v1 if unseeded.
  // The active org profile gives every bundle the org's voice (injected first
  // in the cached system block); null when no profile exists → today's behavior.
  const [template, profile] = await Promise.all([
    loadActiveTemplate(),
    loadActiveProfile(),
  ]);

  let bidId: string;
  if (existing) {
    // Replace the draft in place: the id survives so existing links stay valid.
    const { error: replaceError } = await supabase
      .from("bids")
      .update({
        assessment_id: assessmentId || null,
        team_consultant_ids: teamConsultantIds,
        template_id: template.id,
        profile_id: profile?.id ?? null,
        status: "generating",
        sections: [],
        failed_bundles: [],
        generation_error: null,
      })
      .eq("id", existing.id);
    if (replaceError) {
      return NextResponse.json({ error: replaceError.message }, { status: 500 });
    }
    bidId = existing.id;
  } else {
    const { data: bid, error: bidError } = await supabase
      .from("bids")
      .insert({
        analysis_id: analysisId,
        assessment_id: assessmentId || null,
        created_by: userId,
        team_consultant_ids: teamConsultantIds,
        template_id: template.id,
        // Pinna profilen anbudet skrivs med (som template_id) — export måste
        // återanvända samma, annars kan bolagsnamn/röst divergera om profilen ändras.
        profile_id: profile?.id ?? null,
        status: "generating",
      })
      .select()
      .single();
    if (bidError || !bid) {
      return NextResponse.json(
        { error: bidError?.message ?? "Failed to create bid" },
        { status: 500 },
      );
    }
    bidId = bid.id;
  }
```

Then update the tail of the handler to use `bidId` (the `ctx` literal, the `after()` call and the response):

```ts
  const ctx: BidContext = {
    analysis: rfpAnalysis,
    teamConsultants,
    scoredConsultants: allScoredConsultants,
    goNoGoResult: goNoGoResult ?? EMPTY_GO_NO_GO,
    userId,
    bidId,
    profile,
  };

  // Generation runs after the response is sent (Vercel: waitUntil). The
  // client polls GET /api/bids/[id] until status leaves 'generating'.
  after(() => runBidGeneration(supabase, bidId, ctx, template));

  return NextResponse.json({ id: bidId, status: "generating" }, { status: 202 });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/api/bids/__tests__/route.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/bids/route.ts src/app/api/bids/__tests__/route.test.ts
git commit -m "feat: one bid per analysis — POST /api/bids replaces drafts, freezes exported"
```

---

### Task 4: `POST /api/analyses/[id]/unlock-team` — hard reset

**Files:**
- Create: `src/app/api/analyses/[id]/unlock-team/route.ts`
- Test: `src/app/api/analyses/[id]/unlock-team/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `createServiceClient` from `@/lib/supabase`; `parseUuidParam`, `internalError` from `@/lib/api-helpers`.
- Produces: `POST` → `200 { ok: true }` after deleting the analysis' assessments + non-exported bids; `409` when a bid is exported or generating. Task 5's unlock button relies on this.

- [ ] **Step 1: Write the failing test**

`src/app/api/analyses/[id]/unlock-team/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const h = vi.hoisted(() => {
  const state = {
    bids: [] as unknown[],
    deletedFrom: [] as string[],
  };
  return { state };
});

vi.mock("@/lib/supabase", () => ({
  createServiceClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => Promise.resolve({ data: h.state.bids, error: null }),
      }),
      delete: () => ({
        eq: () => {
          h.state.deletedFrom.push(table);
          return Promise.resolve({ error: null });
        },
      }),
    }),
  }),
}));

import { POST } from "../route";

const VALID_ID = "11111111-1111-1111-1111-111111111111";

function makeRequest(): NextRequest {
  return {} as unknown as NextRequest;
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  h.state.bids = [];
  h.state.deletedFrom = [];
});

describe("POST /api/analyses/[id]/unlock-team — hard reset", () => {
  it("deletes assessments and draft bids for the analysis", async () => {
    h.state.bids = [{ id: "b-1", status: "draft", exported_at: null }];
    const res = await POST(makeRequest(), ctx(VALID_ID));
    expect(res.status).toBe(200);
    expect(h.state.deletedFrom).toContain("bids");
    expect(h.state.deletedFrom).toContain("go_no_go_assessments");
  });

  it("resets an analysis with an assessment but no bid yet", async () => {
    const res = await POST(makeRequest(), ctx(VALID_ID));
    expect(res.status).toBe(200);
    expect(h.state.deletedFrom).toContain("go_no_go_assessments");
  });

  it("409s when the bid is exported (frozen flow), deleting nothing", async () => {
    h.state.bids = [
      { id: "b-1", status: "exported", exported_at: "2026-08-01T10:00:00Z" },
    ];
    const res = await POST(makeRequest(), ctx(VALID_ID));
    expect(res.status).toBe(409);
    expect(h.state.deletedFrom).toHaveLength(0);
  });

  it("409s while generation is running, deleting nothing", async () => {
    h.state.bids = [{ id: "b-1", status: "generating", exported_at: null }];
    const res = await POST(makeRequest(), ctx(VALID_ID));
    expect(res.status).toBe(409);
    expect(h.state.deletedFrom).toHaveLength(0);
  });

  it("400s on a malformed id", async () => {
    const res = await POST(makeRequest(), ctx("not-a-uuid"));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/api/analyses/[id]/unlock-team/__tests__/route.test.ts"`
Expected: FAIL — `Cannot find module '../route'`

- [ ] **Step 3: Write the route**

`src/app/api/analyses/[id]/unlock-team/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { parseUuidParam, internalError } from "@/lib/api-helpers";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Hard reset of the team lock (spec 2026-08-04): deletes the analysis'
 * go/no-go assessments AND its draft bid so the step chain greys out again.
 * Refuses when the bid is exported (outcome stats track it) or generating.
 * The client shows a confirm dialog before calling — paid AI content is lost.
 */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id: rawId } = await params;
    const idResult = parseUuidParam(rawId, "analysis id");
    if (!idResult.ok) return idResult.response;
    const analysisId = idResult.data;

    const supabase = createServiceClient();

    const { data: bids, error: bidsError } = await supabase
      .from("bids")
      .select("id, status, exported_at")
      .eq("analysis_id", analysisId);
    if (bidsError) {
      return NextResponse.json({ error: bidsError.message }, { status: 500 });
    }

    const rows = (bids ?? []) as { id: string; status: string; exported_at: string | null }[];
    if (rows.some((b) => b.exported_at || b.status === "exported")) {
      return NextResponse.json(
        { error: "Anbudet är inlämnat — teamet kan inte låsas upp." },
        { status: 409 },
      );
    }
    if (rows.some((b) => b.status === "generating")) {
      return NextResponse.json(
        { error: "Generering pågår — vänta tills den är klar." },
        { status: 409 },
      );
    }

    const { error: delBidsError } = await supabase
      .from("bids")
      .delete()
      .eq("analysis_id", analysisId);
    if (delBidsError) {
      return NextResponse.json({ error: delBidsError.message }, { status: 500 });
    }

    const { error: delAssessError } = await supabase
      .from("go_no_go_assessments")
      .delete()
      .eq("analysis_id", analysisId);
    if (delAssessError) {
      return NextResponse.json({ error: delAssessError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return internalError(err);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "src/app/api/analyses/[id]/unlock-team/__tests__/route.test.ts"`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/analyses/[id]/unlock-team"
git commit -m "feat: unlock-team endpoint — hard reset of assessments and draft bid"
```

---

### Task 5: Go/No-Go page

**Files:**
- Create: `src/app/analysis/[id]/go-no-go/page.tsx`
- Create: `src/components/go-no-go-section.tsx`
- Modify: `src/components/go-no-go-result.tsx` (action buttons → `actions` slot)

**Interfaces:**
- Consumes: `loadFlowState`/`FlowState` (Task 1), `FlowNav` (Task 2), POST `/api/bids` 409s (Task 3), unlock endpoint (Task 4), existing `GoNoGoResultView`, `PATCH /api/go-no-go/[id]` (`{ decision: "go" }`).
- Produces: page at `/analysis/[id]/go-no-go`; `GoNoGoResultView` prop change consumed nowhere else after Task 6 removes the old call site (this task keeps the old call site compiling — see Step 3).

- [ ] **Step 1: Swap `GoNoGoResultView` buttons for an `actions` slot**

In `src/components/go-no-go-result.tsx`, change the props interface and the Actions block:

```tsx
interface GoNoGoResultProps {
  result: GoNoGoResult;
  assessmentId: string;
  /** Page-level action buttons (generate/open/unlock) — supplied by the caller. */
  actions: React.ReactNode;
}
```

```tsx
export function GoNoGoResultView({ result, actions }: GoNoGoResultProps) {
```

and replace the entire `{/* Actions */}` `<div className="flex gap-3">…</div>` block with:

```tsx
      {/* Actions */}
      <div className="flex gap-3">{actions}</div>
```

**Temporary compile fix for the old call site** (removed for real in Task 6): in `src/components/analysis-match-section.tsx`, replace the `<GoNoGoResultView … />` usage with:

```tsx
            <GoNoGoResultView
              result={goNoGoResult}
              assessmentId={goNoGoId}
              actions={
                <button
                  onClick={proceedToBid}
                  disabled={bidLoading}
                  className="flex-1 bg-ink text-white px-4 py-2 rounded-lg text-sm font-medium
                             hover:bg-accent-ink disabled:bg-rule disabled:cursor-not-allowed transition-colors"
                >
                  {bidLoading ? "Genererar anbud..." : "Gå vidare till anbud"}
                </button>
              }
            />
```

- [ ] **Step 2: Write the client section**

`src/components/go-no-go-section.tsx`:

```tsx
"use client";

import { useRef, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { GoNoGoResultView } from "./go-no-go-result";
import type { FlowAssessment, FlowBid, FlowMatch } from "@/lib/flow-state";

interface GoNoGoSectionProps {
  analysisId: string;
  assessment: FlowAssessment;
  match: FlowMatch | null;
  bid: FlowBid | null;
}

const LEVEL_LABELS: Record<string, string> = {
  expert: "Expert",
  senior: "Senior",
  intermediate: "Medel",
  junior: "Junior",
};

/** Polls GET /api/bids/[id] until status leaves 'generating'. Returns null if
 *  the component unmounted (generation continues server-side). */
async function pollBidUntilDone(
  bidId: string,
  isMounted: () => boolean,
): Promise<{ status: string } | null> {
  for (;;) {
    if (!isMounted()) return null;
    const res = await fetch(`/api/bids/${bidId}`);
    if (res.ok) {
      const bid = (await res.json()) as { status: string };
      if (bid.status !== "generating") return bid;
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

export function GoNoGoSection({ analysisId, assessment, match, bid }: GoNoGoSectionProps) {
  const router = useRouter();
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const [working, setWorking] = useState<"generate" | "unlock" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const team = (match?.scoredConsultants ?? []).filter((c) =>
    assessment.teamConsultantIds.includes(c.consultantId),
  );
  const frozen = bid !== null && (bid.exportedAt !== null || bid.status === "exported");

  async function generate() {
    if (bid && !window.confirm("Detta ersätter det befintliga utkastet med ett nytt. Fortsätt?")) {
      return;
    }
    setWorking("generate");
    setError(null);
    try {
      // Record the go decision (same behavior as the old proceedToBid).
      await fetch(`/api/go-no-go/${assessment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "go" }),
      });
      const response = await fetch("/api/bids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId,
          assessmentId: assessment.id,
          teamConsultantIds: assessment.teamConsultantIds,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Bid generation failed");
      const done = await pollBidUntilDone(data.id, () => mountedRef.current);
      if (!done) return; // user left the page; generation continues server-side
      router.push(`/bids/${data.id}`);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : "Something went wrong");
      setWorking(null);
    }
  }

  async function unlock() {
    const message = bid
      ? "Detta låser upp teamet och raderar go/no-go-bedömningen OCH anbudsutkastet. Fortsätt?"
      : "Detta låser upp teamet och raderar go/no-go-bedömningen. Fortsätt?";
    if (!window.confirm(message)) return;
    setWorking("unlock");
    setError(null);
    try {
      const res = await fetch(`/api/analyses/${analysisId}/unlock-team`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Kunde inte låsa upp teamet");
      }
      router.push(`/analysis/${analysisId}`);
      router.refresh();
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : "Something went wrong");
      setWorking(null);
    }
  }

  const actions = frozen ? (
    <>
      <span className="flex-1 px-4 py-2 text-sm text-ink-mute text-center">
        Anbudet är inlämnat — flödet är låst.
      </span>
      <Link
        href={`/bids/${bid!.id}`}
        className="flex-1 bg-ink text-white px-4 py-2 rounded-lg text-sm font-medium text-center
                   hover:bg-accent-ink transition-colors"
      >
        Öppna anbudet
      </Link>
    </>
  ) : (
    <>
      <button
        onClick={unlock}
        disabled={working !== null}
        className="flex-1 border border-rule text-ink-soft px-4 py-2 rounded-lg text-sm font-medium
                   hover:bg-paper-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {working === "unlock" ? "Låser upp..." : "Lås upp och ändra team"}
      </button>
      {bid && (
        <Link
          href={`/bids/${bid.id}`}
          className="flex-1 bg-ink text-white px-4 py-2 rounded-lg text-sm font-medium text-center
                     hover:bg-accent-ink transition-colors"
        >
          Öppna anbudet
        </Link>
      )}
      <button
        onClick={generate}
        disabled={working !== null}
        className="flex-1 bg-ink text-white px-4 py-2 rounded-lg text-sm font-medium
                   hover:bg-accent-ink disabled:bg-rule disabled:cursor-not-allowed transition-colors"
      >
        {working === "generate"
          ? "Genererar anbud..."
          : bid
            ? "Generera om (ersätter utkastet)"
            : "Generera anbud"}
      </button>
    </>
  );

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-display font-normal mb-4">Låst team</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {team.map((c) => (
            <div key={c.consultantId} className="border border-rule rounded-lg px-4 py-3 bg-paper">
              <div className="font-medium text-ink text-sm">{c.consultantName}</div>
              <div className="text-xs text-ink-mute mt-0.5">
                {LEVEL_LABELS[c.level] ?? c.level} · {c.score} p
              </div>
            </div>
          ))}
          {team.length === 0 && (
            <p className="text-sm text-ink-mute">Teamkorten kunde inte läsas ur matchningen.</p>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
          {error}
        </div>
      )}

      <GoNoGoResultView result={assessment.result} assessmentId={assessment.id} actions={actions} />
    </div>
  );
}
```

- [ ] **Step 3: Write the page**

`src/app/analysis/[id]/go-no-go/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { loadFlowState } from "@/lib/flow-state";
import { FlowNav } from "@/components/flow-nav";
import { GoNoGoSection } from "@/components/go-no-go-section";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function GoNoGoPage({ params }: PageProps) {
  const { id } = await params;
  const flow = await loadFlowState(id);

  // No assessment → the team isn't locked; this page has nothing to show.
  if (!flow.assessment) redirect(`/analysis/${id}`);

  return (
    <main className="min-h-full bg-paper">
      <FlowNav
        analysisId={id}
        active="gonogo"
        gonogoEnabled
        bidId={flow.bid?.id ?? null}
        bidFailed={flow.bid?.status === "failed" || (flow.bid?.hasFailures ?? false)}
      />
      <div className="max-w-3xl mx-auto px-6 py-10">
        <GoNoGoSection
          analysisId={id}
          assessment={flow.assessment}
          match={flow.match}
          bid={flow.bid}
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Verify compile + suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean tsc; full suite green (the modified `GoNoGoResultView` call site in analysis-match-section still compiles via the temporary `actions` prop).

- [ ] **Step 5: Commit**

```bash
git add "src/app/analysis/[id]/go-no-go/page.tsx" src/components/go-no-go-section.tsx src/components/go-no-go-result.tsx src/components/analysis-match-section.tsx
git commit -m "feat: dedicated go/no-go page with locked team cards and flow actions"
```

---

### Task 6: Analysis page — rehydrated lock + slimmed match section

**Files:**
- Modify: `src/app/analysis/[id]/page.tsx`
- Modify: `src/components/analysis-match-section.tsx`

**Interfaces:**
- Consumes: `loadFlowState` (Task 1), `FlowNav` (Task 2).
- Produces: `AnalysisMatchSection` new props `locked: boolean`, `lockedTeamIds: string[] | null` — the page is the only consumer.

- [ ] **Step 1: Rewrite the page to use flow state**

Replace the body of `src/app/analysis/[id]/page.tsx` — drop the inline `matches` fetch, add `FlowNav`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { AnalysisResult } from "@/components/analysis-result";
import { AnalysisMatchSection } from "@/components/analysis-match-section";
import { FlowNav } from "@/components/flow-nav";
import { loadFlowState } from "@/lib/flow-state";
import { RfpAnalysis } from "@/lib/types";
import Link from "next/link";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AnalysisPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  // Fetch analysis. file_path is available on the document row when the
  // user wants the original file — caller should pass it through
  // getDocumentSignedUrl (lib/storage-urls) since the bucket is private
  // after migration 013.
  const { data, error } = await supabase
    .from("analyses")
    .select(`
      id,
      analysis,
      created_at,
      documents (
        file_name,
        file_path
      )
    `)
    .eq("id", id)
    .single();

  if (error || !data) {
    notFound();
  }

  const document = data.documents as unknown as {
    file_name: string;
    file_path: string | null;
  };

  const flow = await loadFlowState(id);

  return (
    <main className="min-h-full bg-paper">
      <FlowNav
        analysisId={id}
        active="analysis"
        gonogoEnabled={flow.assessment !== null}
        bidId={flow.bid?.id ?? null}
        bidFailed={flow.bid?.status === "failed" || (flow.bid?.hasFailures ?? false)}
      />
      <div className="max-w-3xl mx-auto px-6 py-10">
        <Link
          href="/"
          className="text-xs text-ink-mute hover:text-ink-soft mb-8 inline-block"
        >
          &larr; Ny analys
        </Link>
        <AnalysisResult
          analysis={data.analysis as RfpAnalysis}
          fileName={document.file_name}
          analysisId={id}
        />
        <div id="team" className="scroll-mt-6">
          <AnalysisMatchSection
            analysisId={id}
            latestMatch={flow.match}
            locked={flow.assessment !== null}
            lockedTeamIds={flow.assessment?.teamConsultantIds ?? null}
          />
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Slim `analysis-match-section.tsx`**

All go/no-go and bid logic leaves the component (it now ends at the lock step):

1. **Props:** add to the existing props interface:

```ts
  /** true when a go/no-go assessment exists — the team is locked server-side */
  locked: boolean;
  /** the locked team from the latest assessment (null when unlocked) */
  lockedTeamIds: string[] | null;
```

2. **State:** delete `teamLocked`, `goNoGoLoading`, `goNoGoResult`, `goNoGoId`, `bidLoading`, `partialBid` states. Delete the functions `unlockTeam`, `proceedToBid`, `pollBidUntilDone` and the whole partial-bid JSX block. Delete now-unused imports (`GoNoGoResultView`, `BUNDLE_LABELS_SV` if only used by partial-bid, ForgeLoader only if unused — the matching spinner keeps it).

3. **Selection init:** locked team wins over the default heuristic:

```ts
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    lockedTeamIds
      ? new Set(lockedTeamIds)
      : latestMatch
        ? buildDefaultTeamIds(latestMatch.scoredConsultants)
        : new Set(),
  );
```

4. **Lock handler:** replace `lockTeamAndEvaluate` with a version that navigates instead of rendering the result inline:

```ts
  async function lockTeamAndEvaluate() {
    if (selectedIds.size === 0) {
      setError("Välj minst en konsult för teamet.");
      return;
    }
    setGoNoGoRunning(true);
    setError(null);
    try {
      const response = await fetch("/api/go-no-go", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId,
          teamConsultantIds: Array.from(selectedIds),
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Go/No-Go evaluation failed");
      }
      router.push(`/analysis/${analysisId}/go-no-go`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setGoNoGoRunning(false);
    }
  }
```

with a single new state `const [goNoGoRunning, setGoNoGoRunning] = useState(false);` (spinner while the assessment runs).

5. **Render:** `teamLocked` → `locked` everywhere (`TeamProposal disabled={locked}`, hide "Kör om matchning" and the lock button when `locked`). When `locked`, render a pointer instead of the lock button:

```tsx
          {locked && (
            <Link
              href={`/analysis/${analysisId}/go-no-go`}
              className="block w-full border border-rule text-ink-soft px-4 py-3 rounded-lg text-sm
                         font-medium text-center hover:border-accent hover:text-ink transition-colors"
            >
              Teamet är låst — visa Go/No-Go-bedömningen →
            </Link>
          )}
```

(`import Link from "next/link";` and `useRouter` are needed; add them.)

- [ ] **Step 3: Verify compile + suite**

Run: `npx tsc --noEmit && npx vitest run && npm run lint`
Expected: all green, no unused-import warnings.

- [ ] **Step 4: Commit**

```bash
git add "src/app/analysis/[id]/page.tsx" src/components/analysis-match-section.tsx
git commit -m "feat: analysis page rehydrates team lock from flow state; match section slimmed"
```

---

### Task 7: Editor page joins the flow nav

**Files:**
- Modify: `src/app/bids/[id]/page.tsx`
- Modify: `src/components/bid-editor/BidEditor.tsx:190` ("Ändra team" link target)

**Interfaces:**
- Consumes: `loadFlowState` (Task 1), `FlowNav` (Task 2).
- Produces: nothing new.

- [ ] **Step 1: Add FlowNav to the editor page**

In `src/app/bids/[id]/page.tsx`: add imports

```tsx
import { FlowNav } from "@/components/flow-nav";
import { loadFlowState } from "@/lib/flow-state";
```

and change the return to wrap the editor (flow nav only when the bid knows its analysis — legacy rows may not):

```tsx
  const analysisId = (bid.analysis_id as string | null) ?? null;
  const flow = analysisId ? await loadFlowState(analysisId) : null;

  return (
    <>
      {analysisId && flow && (
        <FlowNav
          analysisId={analysisId}
          active="bid"
          gonogoEnabled={flow.assessment !== null}
          bidId={bid.id}
          bidFailed={bid.status === "failed"}
        />
      )}
      <BidEditor
        bidId={bid.id}
        analysisId={analysisId}
        initialSections={bid.sections as BidSection[]}
        initialStatus={bid.status}
        styleGuide={styleGuide}
        initialFailedBundles={(bid.failed_bundles as FailedUnit[]) ?? []}
        initialGenerationError={(bid.generation_error as string | null) ?? null}
      />
    </>
  );
```

- [ ] **Step 2: Point "Ändra team" at the go/no-go page**

In `src/components/bid-editor/BidEditor.tsx` line 190, change

```tsx
              <Link href={`/analysis/${analysisId}#team`} className="hover:text-ink transition-colors">
```

to

```tsx
              <Link href={`/analysis/${analysisId}/go-no-go`} className="hover:text-ink transition-colors">
```

(label "Ändra team" stays — the unlock action lives on the go/no-go page). Update the now-stale `#team`-anchor comment in `src/app/analysis/[id]/page.tsx` accordingly (the anchor div may stay for scroll-back UX).

- [ ] **Step 3: Verify compile + suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: green (BidEditor.test.tsx may assert the old href — update the assertion to `/analysis/a-1/go-no-go` if it fails).

- [ ] **Step 4: Commit**

```bash
git add "src/app/bids/[id]/page.tsx" src/components/bid-editor/BidEditor.tsx src/components/bid-editor/__tests__/BidEditor.test.tsx "src/app/analysis/[id]/page.tsx"
git commit -m "feat: flow nav on the bid editor; Ändra team points at go/no-go page"
```

---

### Task 8: Gates, visual smoke, PR

**Files:**
- Modify: `notes/ROADMAP.md` (mark the nav item delivered; note closed backlog items)

- [ ] **Step 1: Full gates**

Run in the worktree (PowerShell):

```powershell
npm run lint; npx tsc --noEmit; npm test; npx next build
```

Expected: 0 lint errors, clean tsc, full suite green, build exit 0. `next build` is MANDATORY — two new pages + one new route (page/route export guard lives only there). If node_modules is a junction: run `npm ci` first (Turbopack can't follow junctions).

- [ ] **Step 2: Visual smoke against dev**

Manual (or dev-login recipe for screenshots), on `npm run dev` in the worktree:

1. Open an analysis WITHOUT assessment → nav shows Go/No-Go + Anbud greyed with tooltips.
2. Lock a team → lands on `/analysis/[id]/go-no-go`, team cards + result visible. Reload the page → everything still there (rehydration proof).
3. Generate → lands in the editor; nav "Anbud" active. Editor's "Ändra team" → back on go/no-go page.
4. "Generera om" → confirm dialog appears; cancel does nothing.
5. "Lås upp och ändra team" → confirm dialog names the draft; accept → back on analysis, steps greyed, bid gone.
6. An EXPORTED bid's go/no-go page shows "Anbudet är inlämnat — flödet är låst." and no unlock/generate buttons.

Cost note: a full live run (go/no-go + generation) is ~$1.5–2. Steps 4–5 can be verified against the bid from step 3.

- [ ] **Step 3: Update ROADMAP and commit**

In `notes/ROADMAP.md`: mark the "NAVIGERING I KÄRNFLÖDET" live item delivered (date + PR ref), and note that it closes "'Ändra team' skapar nytt anbud" and "omkörningsknapp för fallerade genereringar" (both delivered by the replace semantics + go/no-go rerun button).

```bash
git add notes/ROADMAP.md
git commit -m "docs: roadmap — flow navigation delivered"
```

- [ ] **Step 4: PR**

```bash
git push -u bidsmith feat/flow-navigation
gh pr create --repo DaVincisfather/bidsmith --base main --title "Flow navigation: analysis -> go/no-go -> editor, one bid per analysis" --body "..."
```

PR body: summary of the four decisions + gates output. Then: **wait for the PR review routine's comment** AND dispatch a fresh code-reviewer (regression-sensitive core flow) before squash-merge.
