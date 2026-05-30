# M4 Teardown → Single-Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the multi-organization layer (M4) so Bidsmith becomes a single shared workspace where any logged-in user sees and edits everything, with `user_id` used only for attribution.

**Architecture:** Magic-link auth stays. Org tables/RLS/invites/seats/roles are deleted. `getOrgId()` → `getUserId()`. Per-request `.eq("organization_id", …)` filters removed. `ai_call_logs` and `bids` attribute to `user_id`. The `organizations.style_guide` JSONB moves to a new single-row `workspace_settings` table (keeps door open for future per-workspace template upload). Migrations 001–019 are squashed to one clean `001_initial_schema.sql`.

**Tech Stack:** Next.js 16 (App Router), TypeScript (strict), Supabase (Postgres + Auth), Vitest.

**Spec:** `docs/superpowers/specs/2026-05-30-m4-teardown-single-workspace-design.md`

---

## Pre-flight

### Task 0: Tag the pre-teardown state + confirm green baseline

**Files:** none (git only)

- [ ] **Step 1: Confirm we're on the right branch**

Run: `git -C ~/projects/agentic-dealflow branch --show-current`
Expected: `feat/open-source-prep`

- [ ] **Step 2: Confirm working tree is clean (only the known untracked items)**

Run: `git -C ~/projects/agentic-dealflow status -s`
Expected: only `?? notes/mockups/` and `?? templates/anbudsmall-colors.pptx` (no staged/modified tracked files)

- [ ] **Step 3: Establish green baseline BEFORE any change**

Run: `cd ~/projects/agentic-dealflow && npm run build && npm test`
Expected: build succeeds, all tests pass. If anything is red here, STOP and report — we must not start teardown on a broken baseline.

- [ ] **Step 4: Tag the full M4 state for permanent recall**

```bash
cd ~/projects/agentic-dealflow
git tag -a pre-m4-teardown -m "Full multi-org (M4) state before single-workspace teardown"
git tag -l pre-m4-teardown
```
Expected: prints `pre-m4-teardown`. (This tag is the permanent reference copy of M4 — no separate local copy needed.)

---

## Phase A — Delete org-only UI and lib files

### Task 1: Delete org/team UI and standalone org libs

These 14 files have no remaining consumers once their nav entry (OrgDropdown) and routes go away. We delete them first, then fix the resulting import breakages in later tasks. Build will be red between Task 1 and Task 6 — that is expected and called out.

**Files:**
- Delete: `src/app/organisation/page.tsx`
- Delete: `src/app/organisation/settings/page.tsx`
- Delete: `src/app/organisation/settings/actions.ts`
- Delete: `src/app/organisation/settings/validators.ts`
- Delete: `src/app/organisation/settings/__tests__/actions.test.ts`
- Delete: `src/app/team/page.tsx`
- Delete: `src/app/team/actions.ts`
- Delete: `src/components/organisation/AccentSwatches.tsx`
- Delete: `src/components/organisation/OrgBanner.tsx`
- Delete: `src/components/organisation/OrgDropdown.tsx`
- Delete: `src/components/organisation/SettingsForm.tsx`
- Delete: `src/components/team/InviteForm.tsx`
- Delete: `src/components/team/InviteRow.tsx`
- Delete: `src/components/team/MemberRow.tsx`
- Delete: `src/lib/organisations.ts`
- Delete: `src/lib/invites.ts`
- Delete: `src/lib/__tests__/invites.test.ts`
- Delete: `src/lib/__tests__/organisations.test.ts`

- [ ] **Step 1: Delete the files**

```bash
cd ~/projects/agentic-dealflow
git rm -r \
  src/app/organisation \
  src/app/team \
  src/components/organisation \
  src/components/team \
  src/lib/organisations.ts \
  src/lib/invites.ts \
  src/lib/__tests__/invites.test.ts \
  src/lib/__tests__/organisations.test.ts
```
Expected: git lists all removed files. (Note: deleting the `organisation`/`team` directories removes any `__tests__` subfolders within them too.)

- [ ] **Step 2: Verify the directories are gone**

Run: `ls src/app/organisation src/app/team src/components/organisation src/components/team 2>&1`
Expected: "No such file or directory" for all four.

- [ ] **Step 3: Commit the deletion**

```bash
git commit -m "refactor(m4): delete org/team UI and standalone org libs"
```

---

## Phase B — Rewrite auth core (org → user)

### Task 2: Replace `src/lib/org.ts` with user-only auth

`getOrgId`, `getCurrentProfile`, `bootstrapProfileFromInvite`, `NoOrganizationError`, `OrgRole`, and `Profile` all go away. We keep the file path `src/lib/org.ts` (to minimize import churn) but reduce it to a single `getUserId` helper plus `NotAuthenticatedError`.

**Files:**
- Modify (full rewrite): `src/lib/org.ts`

- [ ] **Step 1: Replace the entire contents of `src/lib/org.ts`**

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "./supabase/server";

export class NotAuthenticatedError extends Error {
  constructor() {
    super("Not authenticated");
    this.name = "NotAuthenticatedError";
  }
}

/**
 * Returns the authenticated user's id. In single-workspace Bidsmith there is no
 * organization scoping — user_id is used only for attribution (who created a bid,
 * whose API usage). All logged-in users share one workspace.
 */
export async function getUserId(supabase?: SupabaseClient): Promise<string> {
  const client = supabase ?? (await createClient());
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw new NotAuthenticatedError();
  return user.id;
}
```

- [ ] **Step 2: Verify no remaining references to the removed exports**

Run: `git grep -nE "getOrgId|getCurrentProfile|NoOrganizationError|OrgRole|bootstrapProfileFromInvite" -- src/`
Expected: only hits inside files we will fix in Tasks 3–7 (API routes, layout, ai-client). Note the list; it is the checklist for the next tasks. (If zero hits outside org.ts, even better.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/org.ts
git commit -m "refactor(m4): reduce org.ts to getUserId (no org scoping)"
```

### Task 3: Update middleware (drop invite path)

**Files:**
- Modify: `src/middleware.ts:5-12`

- [ ] **Step 1: Remove `/invites/accept` from PUBLIC_PATHS**

In `src/middleware.ts`, change the `PUBLIC_PATHS` array from:

```typescript
const PUBLIC_PATHS = [
  "/login",
  "/auth/callback",
  "/auth/signout",
  "/invites/accept",
  "/api/radar/fetch",
  "/api/radar/score",
];
```

to:

```typescript
const PUBLIC_PATHS = [
  "/login",
  "/auth/callback",
  "/auth/signout",
  "/api/radar/fetch",
  "/api/radar/score",
];
```

- [ ] **Step 2: Commit**

```bash
git add src/middleware.ts
git commit -m "refactor(m4): drop invite path from middleware public paths"
```

---

## Phase C — Sweep API routes and pages (org → user)

Each route currently calls `getOrgId()` and filters queries by `organization_id`. The new behavior: resolve `getUserId()` only where the user id is actually needed (bid attribution), and drop org filtering everywhere (all logged-in users share the workspace). For routes that only used orgId for filtering, simply delete the orgId line and the `.eq("organization_id", …)` clauses — no `getUserId()` call needed (middleware already guarantees the request is authenticated).

### Task 4: Sweep read/list routes (drop org filtering, no user id needed)

**Files:**
- Modify: `src/app/consultants/page.tsx:2,8` (+ query)
- Modify: `src/app/api/consultants/route.ts:3,7` (+ query)
- Modify: `src/app/api/pipeline/route.ts:3,11` (+ query)
- Modify: `src/app/api/radar/opportunities/route.ts:3,11` (+ query)
- Modify: `src/app/api/bids/dashboard/route.ts:3,11` (+ query)

- [ ] **Step 1: For each file, remove the `getOrgId` import, the `orgId` line, and every `.eq("organization_id", orgId)` clause**

For each of the 5 files:
1. Delete the import line `import { getOrgId } from "@/lib/org";`
2. Delete the line `const orgId = await getOrgId(...);`
3. Remove every `.eq("organization_id", orgId)` from Supabase query chains in that file (leave all other `.eq`/`.order`/`.select` clauses intact).

Example — `src/app/api/consultants/route.ts` before:
```typescript
import { getOrgId } from "@/lib/org";
// ...
  const orgId = await getOrgId(supabase);
  const { data } = await supabase
    .from("consultants")
    .select("*, consultant_competencies(*), consultant_references(*)")
    .eq("organization_id", orgId);
```
after:
```typescript
// (import removed)
// ...
  const { data } = await supabase
    .from("consultants")
    .select("*, consultant_competencies(*), consultant_references(*)");
```

- [ ] **Step 2: Verify no `organization_id` filtering remains in these 5 files**

Run: `git grep -nE "organization_id|getOrgId" -- src/app/consultants/page.tsx src/app/api/consultants/route.ts src/app/api/pipeline/route.ts src/app/api/radar/opportunities/route.ts src/app/api/bids/dashboard/route.ts`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/app/consultants/page.tsx src/app/api/consultants/route.ts src/app/api/pipeline/route.ts src/app/api/radar/opportunities/route.ts src/app/api/bids/dashboard/route.ts
git commit -m "refactor(m4): drop org filtering from read/list routes"
```

### Task 5: Sweep write/action routes (org → user attribution)

These routes pass orgId into downstream functions (bid generation, matching, go/no-go, export, analyze, upload). Replace with `getUserId()` where the value is used for attribution, otherwise drop it. Specific per-file handling below.

**Files:**
- Modify: `src/app/api/analyze/route.ts:6,18`
- Modify: `src/app/api/consultants/upload/route.ts:6,24`
- Modify: `src/app/api/matches/[id]/route.ts:4,16`
- Modify: `src/app/api/go-no-go/route.ts:4,16`
- Modify: `src/app/api/bids/[id]/export/route.ts:4,16`
- Modify: `src/app/api/bids/route.ts:4,22,54,65-71`

- [ ] **Step 1: `analyze`, `upload`, `matches/[id]`, `go-no-go`, `export` — drop org, no attribution needed**

For each of these 5 files:
1. Change import `import { getOrgId } from "@/lib/org";` → delete it.
2. Delete `const orgId = await getOrgId(authed);`.
3. Remove `organization_id: orgId` from any `.insert(...)` objects and any `.eq("organization_id", orgId)` clauses.
4. If a downstream call passed `orgId` (e.g. `matchConsultants(..., orgId)`, `evaluateGoNoGo(..., orgId)`), remove that argument. (These pass-throughs only fed `callClaude`'s `organizationId`, which we remove in Task 6 — so the parameter disappears on both ends.)

- [ ] **Step 2: `bids/route.ts` — switch to user attribution on the bid record**

In `src/app/api/bids/route.ts`:
1. Change line 4 `import { getOrgId } from "@/lib/org";` → `import { getUserId } from "@/lib/org";`
2. Change line 22 `const orgId = await getOrgId(authed);` → `const userId = await getUserId(authed);`
3. In the `.insert({...})` (lines 50-57) replace `organization_id: orgId,` with `created_by: userId,`
4. In the `BidContext` object (lines 65-71) replace `organizationId: orgId,` with `userId,`

After edit, the insert block reads:
```typescript
    .insert({
      analysis_id: analysisId,
      assessment_id: assessmentId || null,
      created_by: userId,
      team_consultant_ids: teamConsultantIds,
      status: "generating",
    })
```
and the context reads:
```typescript
  const ctx: BidContext = {
    analysis: rfpAnalysis,
    teamConsultants,
    scoredConsultants: allScoredConsultants,
    goNoGoResult: goNoGoResult ?? EMPTY_GO_NO_GO,
    userId,
  };
```

- [ ] **Step 3: Verify no org references remain across all write routes**

Run: `git grep -nE "organization_id|getOrgId" -- src/app/api/analyze src/app/api/consultants/upload src/app/api/matches src/app/api/go-no-go src/app/api/bids`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/analyze/route.ts src/app/api/consultants/upload/route.ts "src/app/api/matches/[id]/route.ts" src/app/api/go-no-go/route.ts "src/app/api/bids/[id]/export/route.ts" src/app/api/bids/route.ts
git commit -m "refactor(m4): user attribution on bids, drop org from write routes"
```

---

## Phase D — AI client, bid context, layout, style guide

### Task 6: `callClaude` + logger: organizationId → userId

**Files:**
- Modify: `src/lib/ai-client.ts:30-43` (interface), `:45-54` (signature), and the logging call that forwards it
- Modify: `src/lib/ai-call-logger.ts:4-14,16-38`
- Modify: callers that passed `organizationId`: `src/lib/rfp-analyzer.ts:49-52`, `src/lib/consultant-extractor.ts:42-47`

- [ ] **Step 1: Update `LogAiCallInput` and the insert in `ai-call-logger.ts`**

In `src/lib/ai-call-logger.ts`, change the interface field `organizationId: string | null;` → `userId: string | null;` and the insert field `organization_id: input.organizationId,` → `user_id: input.userId,`.

Result:
```typescript
export interface LogAiCallInput {
  userId: string | null;
  model: string;
  label: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  latencyMs: number;
  error?: string;
}
```
and inside `logAiCall`:
```typescript
    const { error } = await client.from("ai_call_logs").insert({
      user_id: input.userId,
      model: input.model,
      // ...rest unchanged
    });
```

- [ ] **Step 2: Update `CallClaudeOptions` and `callClaude` in `ai-client.ts`**

In `src/lib/ai-client.ts`: rename the optional field `organizationId?: string | null;` → `userId?: string | null;` in `CallClaudeOptions`, rename the destructured param `organizationId` → `userId` in the `callClaude` signature, and where it builds the `logAiCall(...)` payload change `organizationId` → `userId`.

- [ ] **Step 3: Update the two callers that forwarded organizationId**

In `src/lib/rfp-analyzer.ts` and `src/lib/consultant-extractor.ts`, these functions received an `organizationId` argument and passed it through as `organizationId` in the `callClaude({...})` call. Rename both the function parameter and the forwarded field to `userId`. Then update their call sites:
- `rfp-analyzer` is called from `src/app/api/analyze/route.ts` — pass `userId` (resolve via `getUserId(authed)` if not already present; analyze route dropped orgId in Task 5, so add `const userId = await getUserId(authed);` and pass it).
- `consultant-extractor` is called from `src/app/api/consultants/upload/route.ts` — same pattern: add `const userId = await getUserId(authed);` and pass `userId`.

> Note: this slightly revises Task 5 Step 1 for `analyze` and `upload` — they DO need `getUserId` after all, because they attribute AI cost. Keep the import `import { getUserId } from "@/lib/org";` in those two files.

- [ ] **Step 4: Verify**

Run: `git grep -nE "organizationId|organization_id" -- src/lib`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai-client.ts src/lib/ai-call-logger.ts src/lib/rfp-analyzer.ts src/lib/consultant-extractor.ts src/app/api/analyze/route.ts src/app/api/consultants/upload/route.ts
git commit -m "refactor(m4): attribute AI usage to user_id instead of organization_id"
```

### Task 7: BidContext — organizationId → userId

**Files:**
- Modify: `src/lib/bid-generator/context.ts:8-14`

- [ ] **Step 1: Rename the field**

In `src/lib/bid-generator/context.ts`, change:
```typescript
export interface BidContext {
  analysis: RfpAnalysis;
  teamConsultants: Consultant[];
  scoredConsultants: ScoredConsultant[];
  goNoGoResult: GoNoGoResult;
  organizationId?: string | null;
}
```
to:
```typescript
export interface BidContext {
  analysis: RfpAnalysis;
  teamConsultants: Consultant[];
  scoredConsultants: ScoredConsultant[];
  goNoGoResult: GoNoGoResult;
  userId?: string | null;
}
```
(`formatContext` does not reference the field, so no other change in this file.)

- [ ] **Step 2: Verify nothing else reads `ctx.organizationId`**

Run: `git grep -nE "\.organizationId" -- src/lib/bid-generator`
Expected: no output. (bundles never read it; they were `// organizationId NOT PASSED`.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/bid-generator/context.ts
git commit -m "refactor(m4): BidContext carries userId not organizationId"
```

### Task 8: layout.tsx — remove OrgDropdown + profile/role logic

**Files:**
- Modify: `src/app/layout.tsx` (remove imports of getCurrentProfile/OrgDropdown, the try/catch profile block, and the `<OrgDropdown>` render)

- [ ] **Step 1: Rewrite the layout to drop org awareness**

Replace the import block and `RootLayout` body so it no longer imports `getCurrentProfile`, `NoOrganizationError`, or `OrgDropdown`, no longer resolves a profile, and no longer renders `<OrgDropdown>`. The nav keeps the brand link + "Analysera RFP" + "Radar". Result:

```typescript
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { PipelineRail } from "@/components/pipeline/PipelineRail";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Bidsmith",
  description: "AI-driven RFP analysis and consultant matching",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="sv"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <nav className="border-b border-gray-100">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-6">
            <Link href="/" className="font-bold text-lg">
              Bidsmith
            </Link>
            <Link href="/" className="text-sm text-gray-500 hover:text-gray-900">
              Analysera RFP
            </Link>
            <Link href="/radar" className="text-sm text-gray-500 hover:text-gray-900">
              Radar
            </Link>
          </div>
        </nav>
        <div className="flex-1 grid grid-cols-[1fr_260px] min-h-0">
          <div className="min-w-0">{children}</div>
          <PipelineRail />
        </div>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/layout.tsx
git commit -m "refactor(m4): remove org dropdown and profile resolution from layout"
```

### Task 9: Bid editor page — read style guide from workspace_settings

The bid editor page currently joins `organizations.style_guide` via `bid.organization_id`. Both go away. It already has a `DEFAULT_STYLE_GUIDE` fallback. New behavior: read the single `workspace_settings` row's `style_guide`, fall back to `DEFAULT_STYLE_GUIDE`.

**Files:**
- Modify: `src/app/bids/[id]/page.tsx:42-49`

- [ ] **Step 1: Replace the org style-guide fetch**

Change:
```typescript
  // Fetch organization style guide
  const { data: org } = await supabase
    .from("organizations")
    .select("style_guide")
    .eq("id", bid.organization_id)
    .single();

  const styleGuide: StyleGuide = (org?.style_guide as StyleGuide) ?? DEFAULT_STYLE_GUIDE;
```
to:
```typescript
  // Fetch the workspace style guide (single-row table). Falls back to the
  // built-in default until a workspace uploads its own template/styling.
  const { data: workspace } = await supabase
    .from("workspace_settings")
    .select("style_guide")
    .limit(1)
    .maybeSingle();

  const styleGuide: StyleGuide =
    (workspace?.style_guide as StyleGuide) ?? DEFAULT_STYLE_GUIDE;
```

- [ ] **Step 2: Verify no `organization_id` / `organizations` references remain anywhere in src/**

Run: `git grep -nE "organizations?\b|organization_id|getOrgId|getCurrentProfile|super_user" -- src/`
Expected: no output. (If any hit remains, fix it before continuing — this is the final code-level gate.)

- [ ] **Step 3: Commit**

```bash
git add "src/app/bids/[id]/page.tsx"
git commit -m "refactor(m4): bid editor reads style guide from workspace_settings"
```

---

## Phase E — Database baseline (squash)

### Task 10: Replace migrations with a single clean baseline

Delete migrations 001–019 and author one `001_initial_schema.sql` describing the single-workspace schema directly. Read every existing migration first to fold their cumulative effect (minus org) into the baseline.

**Files:**
- Delete: `supabase/migrations/002…019` (keep filename `001_initial_schema.sql` but overwrite it)
- Modify (overwrite): `supabase/migrations/001_initial_schema.sql`
- Create: `supabase/seed.sql` (optional radar competencies seed — not auto-run)

- [ ] **Step 1: Read all current migrations to capture cumulative schema**

Run: `for f in supabase/migrations/0*.sql; do echo "=== $f ==="; cat "$f"; done`
Expected: full dump of 001–019. Use this to enumerate every non-org table + column the app relies on (documents, analyses, consultants, consultant_competencies, consultant_references, matches, go_no_go_assessments, bids [incl. status CHECK, structure_eval, overflow_flags, team_consultant_ids, assessment_id, created_by], rfp_opportunities, ai_call_logs [user_id], template_configs [budgets jsonb + updated_at trigger], radar competencies table). Capture exact column types and indexes.

- [ ] **Step 2: Delete migrations 002–019**

```bash
cd ~/projects/agentic-dealflow
git rm supabase/migrations/0{02,03,04,05,06,07,08,09,10,11,12,13,14,15,16,17,18,19}_*.sql
```
Expected: 18 files removed. Verify only `001_initial_schema.sql` remains: `ls supabase/migrations/`

- [ ] **Step 3: Overwrite `001_initial_schema.sql` with the consolidated single-workspace schema**

Author the file folding in all non-org tables from Step 1. Key differences from the old cumulative schema:
- NO `organizations`, `profiles`, `organization_invites` tables.
- NO `organization_id` columns anywhere; NO `current_org_id()` function; NO per-tenant RLS policies.
- `bids` includes `created_by uuid` (nullable; no FK to auth.users required), plus existing `structure_eval jsonb`, `overflow_flags jsonb`, `team_consultant_ids`, `assessment_id`, status CHECK ('generating','draft','exported').
- `ai_call_logs` uses `user_id uuid` (nullable) instead of `organization_id`; keep cost/token/latency columns + index on `(user_id, created_at desc)` and `(label, created_at desc)`.
- New `workspace_settings` single-row table: `id uuid primary key default gen_random_uuid()`, `style_guide jsonb`, `created_at`, `updated_at`.
- Radar competency table retained under its existing name (`organization_competencies`) MINUS the `organization_id` column, OR renamed — DEFER renaming to Pass 2 to keep this task mechanical; for now keep the name `organization_competencies` but drop its `organization_id` column and FK. (Pass 2 rewires radar and can rename then.)
- RLS: enable RLS on all tables, single policy per table granting the `authenticated` role full access (`using (true) with check (true)`). No org predicate.
- Keep `template_configs` with `budgets jsonb` and the `updated_at` trigger from migration 019.

The exact DDL is assembled from Step 1's dump; reproduce every non-org column verbatim. (This step is large but mechanical — fold, don't invent.)

- [ ] **Step 4: Move radar competency seed into optional seed.sql**

Any INSERT seed rows for `organization_competencies` (from old migration 005) move into a new `supabase/seed.sql` with `organization_id` removed. This file is NOT auto-applied — it's documented in README as optional demo data.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations supabase/seed.sql
git commit -m "refactor(m4): squash migrations to single-workspace baseline"
```

---

## Phase F — Tests + verification

### Task 11: Fix tests that referenced org

The org-specific test files were already deleted in Task 1 (`invites.test.ts`, `organisations.test.ts`, `organisation/settings/__tests__/actions.test.ts`). Remaining fixes are in shared tests that mocked `organizationId`.

**Files:**
- Modify: `src/lib/__tests__/ai-call-logger.test.ts:32,57` (org → user)
- Modify: `src/lib/__tests__/ai-client.test.ts:188` (org → user)

- [ ] **Step 1: Update `ai-call-logger.test.ts`**

Change assertions/inputs from `organization_id`/`organizationId` to `user_id`/`userId`:
- Line ~32: `expect(row.organization_id).toBe("org-123");` → `expect(row.user_id).toBe("user-123");` (and update the input that set it to `userId: "user-123"`).
- Line ~57: `expect(row.organization_id).toBeNull();` → `expect(row.user_id).toBeNull();` (and the input `userId: null`).

- [ ] **Step 2: Update `ai-client.test.ts`**

Line ~188: `await callClaude({ ...baseArgs, organizationId: "org-abc" })` → `await callClaude({ ...baseArgs, userId: "user-abc" })`, and update the corresponding assertion that the logged row carried that id (now `user_id`).

- [ ] **Step 3: Run the full test suite**

Run: `cd ~/projects/agentic-dealflow && npm test`
Expected: all tests pass. Fix any remaining references the run surfaces (e.g. a bundle test importing a deleted helper).

- [ ] **Step 4: Commit**

```bash
git add src/lib/__tests__/ai-call-logger.test.ts src/lib/__tests__/ai-client.test.ts
git commit -m "test(m4): attribute AI-usage tests to user_id"
```

### Task 12: Final build + grep gate

**Files:** none (verification only)

- [ ] **Step 1: Type-check / build**

Run: `cd ~/projects/agentic-dealflow && npm run build`
Expected: build succeeds, zero TypeScript errors.

- [ ] **Step 2: Full grep gate — no org concept anywhere in src/ or migrations**

Run:
```bash
git grep -niE "organization_id|getorgid|getcurrentprofile|super_user|organization_invites|seat_limit|billing_plan" -- src/ supabase/
```
Expected: no output. (The string "organization_competencies" as a table name is allowed to remain until Pass 2; if it appears, confirm it's only the radar table name with no `organization_id` column.)

- [ ] **Step 3: Run tests once more for a clean final state**

Run: `npm test`
Expected: all green.

- [ ] **Step 4: Update CLAUDE.md tech notes**

In `CLAUDE.md`, remove/replace any reference to multi-org auth flow if present (the "Viktiga filer" / gotchas sections). Keep it accurate to single-workspace. Commit:
```bash
git add CLAUDE.md
git commit -m "docs(m4): update CLAUDE.md for single-workspace model"
```

---

## Done criteria (maps to spec success criteria)

1. ✅ No code references `organization_id`/`getOrgId`/`getCurrentProfile`/`super_user`/invites/seats — Task 12 Step 2 gate.
2. ✅ `npm run build` clean, `npm test` green — Task 12 Steps 1, 3.
3. ✅ `supabase/migrations/` is one clean `001_initial_schema.sql` — Task 10.
4. ✅ Fresh self-hoster path works (one migration, magic-link, use) — schema from Task 10 + auth from Task 2.
5. ✅ `ai_call_logs` + `bids` attribute to `user_id` — Tasks 5, 6, 10.
6. ✅ M4 recoverable via `pre-m4-teardown` tag — Task 0 Step 4.

## Out of scope (do NOT do here)
- Radar rewire against consultant bank → Pass 2.
- Per-workspace template/style upload UI → future onboarding feature (workspace_settings table is the seam left for it).
- Renaming `organization_competencies` → `radar_competencies` → Pass 2.
- Publishing the public repo → after Pass 1, on Stefan's explicit OK.
- Disk folder rename `agentic-dealflow/` → `bidsmith/` → separate (parallel worktrees).
