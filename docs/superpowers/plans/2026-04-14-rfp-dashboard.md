# RFP Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a two-section pipeline rail on the home page (`/`) that surfaces deadline-sorted relevant RFPs (sektion 1) and submitted bids with outcome logging (sektion 2). Outcome logging captures competitor + reason data to train the Go/No-Go model.

**Architecture:** Pure-logic lib in `src/lib/pipeline.ts` (tested). Three API endpoints (thin wrappers around Supabase queries + lib). Five React components composing a vertical rail inserted into `/`. One DB migration extending `bids` with outcome metadata.

**Tech Stack:** Next.js 16 App Router, Tailwind v4, Supabase (Postgres), Vitest (jsdom + node envs), TypeScript strict.

**Spec:** `docs/superpowers/specs/2026-04-14-rfp-dashboard-design.md`

**Branch:** `feat/rfp-dashboard`

---

## File Structure

**Create:**
- `supabase/migrations/007_bid_outcome_metadata.sql` — DB migration
- `src/lib/pipeline.ts` — pure helpers (calculateUrgency, sortPipelineItems, sortBidSummaries)
- `src/lib/__tests__/pipeline.test.ts` — unit tests
- `src/app/api/pipeline/route.ts` — `GET /api/pipeline`
- `src/app/api/bids/dashboard/route.ts` — `GET /api/bids/dashboard`
- `src/app/api/bids/[id]/outcome/route.ts` — `PATCH /api/bids/[id]/outcome`
- `src/components/pipeline/PipelineRail.tsx` — container
- `src/components/pipeline/PipelineRow.tsx` — sektion 1-rad
- `src/components/pipeline/SubmittedRow.tsx` — sektion 2-rad
- `src/components/pipeline/OutcomeSheet.tsx` — slide-in side-sheet
- `src/components/pipeline/OutcomeEnrichmentForm.tsx` — enrichment-form
- `src/components/pipeline/__tests__/OutcomeEnrichmentForm.test.tsx` — form test

**Modify:**
- `src/lib/types.ts` — add `PipelineItem`, `BidSummary`, `OutcomePatch` types
- `src/app/page.tsx` — add `<PipelineRail />` alongside upload hero
- `src/app/globals.css` — urgency CSS variables

---

## Task 1: Migration 007 — bid outcome metadata

**Files:**
- Create: `supabase/migrations/007_bid_outcome_metadata.sql`

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/007_bid_outcome_metadata.sql`:

```sql
-- Utöka bids med outcome-metadata för RFP Dashboard (sektion 2 flywheel)

ALTER TABLE bids ADD COLUMN competitor_name text;
ALTER TABLE bids ADD COLUMN loss_reason text;
ALTER TABLE bids ADD COLUMN loss_comment text;
ALTER TABLE bids ADD COLUMN outcome_logged_at timestamptz;

ALTER TABLE bids ADD CONSTRAINT bids_loss_reason_check
  CHECK (loss_reason IS NULL OR loss_reason IN
    ('pris','erfarenhet','team','kvalitet','relation','annat'));

-- Utöka outcome-enum med 'cancelled'
-- OBS: verifiera faktiskt constraint-namn först via psql/Supabase:
--   SELECT conname FROM pg_constraint WHERE conrelid = 'bids'::regclass AND contype = 'c';
ALTER TABLE bids DROP CONSTRAINT bids_outcome_check;
ALTER TABLE bids ADD CONSTRAINT bids_outcome_check
  CHECK (outcome IS NULL OR outcome IN ('won','lost','no-bid','cancelled'));

-- Index för sektion 2-queries (inlämnade anbud, sorterade)
CREATE INDEX idx_bids_dashboard ON bids (exported_at DESC)
  WHERE exported_at IS NOT NULL;
```

- [ ] **Step 2: Applicera migration manuellt via Supabase SQL Editor**

Per `CLAUDE.md`: "DB-migreringar: applicera manuellt via Supabase SQL Editor".

1. Öppna Supabase SQL Editor
2. Kör först: `SELECT conname FROM pg_constraint WHERE conrelid = 'bids'::regclass AND contype = 'c';`
3. Om constraint-namnet inte är `bids_outcome_check`, korrigera migrationsfilen
4. Applicera hela migrationen
5. Verifiera med: `\d bids` — nya kolumner + constraint synlig

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/007_bid_outcome_metadata.sql
git commit -m "feat(db): migration 007 — bid outcome metadata + cancelled state"
```

---

## Task 2: Types + pipeline library (pure logic, TDD)

**Files:**
- Modify: `src/lib/types.ts`
- Create: `src/lib/pipeline.ts`
- Create: `src/lib/__tests__/pipeline.test.ts`

- [ ] **Step 1: Add types to `src/lib/types.ts`**

Append to `src/lib/types.ts`:

```typescript
// --- RFP Dashboard types ---

export type Urgency = "urgent" | "soon" | "later";
export type BidOutcome = "won" | "lost" | "no-bid" | "cancelled";
export type LossReason = "pris" | "erfarenhet" | "team" | "kvalitet" | "relation" | "annat";

export interface PipelineItem {
  id: string;                     // opportunityId OR documentId
  source: "ted" | "upload";
  title: string;
  deadline: string;               // ISO date
  daysLeft: number;
  urgency: Urgency;
  relevanceScore: number | null;  // TED only
  analysisId: string | null;      // exists once analyzed (upload always, TED after analyze)
  tedUrl: string | null;          // TED only
}

export interface BidSummary {
  id: string;
  title: string;
  exportedAt: string;
  teamNames: string[];
  outcome: BidOutcome | null;
  outcomeLoggedAt: string | null;
  competitorName: string | null;
  lossReason: LossReason | null;
  lossComment: string | null;
}

export interface PipelineStats {
  awaitingCount: number;
  loggedCount: number;
  wonCount: number;
  lostCount: number;
}

export interface OutcomePatch {
  outcome: BidOutcome;
  competitorName?: string;
  lossReason?: LossReason;
  lossComment?: string;
}
```

- [ ] **Step 2: Write failing tests**

Create `src/lib/__tests__/pipeline.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  calculateUrgency,
  daysUntil,
  sortPipelineItems,
  sortBidSummaries,
} from "@/lib/pipeline";
import type { PipelineItem, BidSummary } from "@/lib/types";

describe("daysUntil", () => {
  it("returns 0 for today", () => {
    const today = new Date().toISOString().split("T")[0];
    expect(daysUntil(today)).toBe(0);
  });

  it("returns positive integer for future date", () => {
    const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    expect(daysUntil(future)).toBe(10);
  });

  it("returns negative for past date", () => {
    const past = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    expect(daysUntil(past)).toBe(-5);
  });
});

describe("calculateUrgency", () => {
  it("returns 'urgent' when <7 days left", () => {
    expect(calculateUrgency(6)).toBe("urgent");
    expect(calculateUrgency(0)).toBe("urgent");
  });

  it("returns 'soon' for 7-13 days left", () => {
    expect(calculateUrgency(7)).toBe("soon");
    expect(calculateUrgency(13)).toBe("soon");
  });

  it("returns 'later' for 14+ days", () => {
    expect(calculateUrgency(14)).toBe("later");
    expect(calculateUrgency(30)).toBe("later");
  });
});

describe("sortPipelineItems", () => {
  const base = (daysLeft: number, id: string): PipelineItem => ({
    id,
    source: "ted",
    title: `Item ${id}`,
    deadline: new Date(Date.now() + daysLeft * 86400000).toISOString(),
    daysLeft,
    urgency: calculateUrgency(daysLeft),
    relevanceScore: 70,
    analysisId: null,
    tedUrl: null,
  });

  it("sorts ascending by daysLeft (most urgent first)", () => {
    const items = [base(20, "a"), base(5, "b"), base(12, "c")];
    const sorted = sortPipelineItems(items);
    expect(sorted.map((i) => i.id)).toEqual(["b", "c", "a"]);
  });
});

describe("sortBidSummaries", () => {
  const base = (
    id: string,
    outcome: BidSummary["outcome"],
    exportedAt: string,
    outcomeLoggedAt: string | null
  ): BidSummary => ({
    id,
    title: `Bid ${id}`,
    exportedAt,
    teamNames: [],
    outcome,
    outcomeLoggedAt,
    competitorName: null,
    lossReason: null,
    lossComment: null,
  });

  it("awaiting (outcome=null) comes first, oldest first", () => {
    const items = [
      base("newer", null, "2026-04-05", null),
      base("older", null, "2026-04-01", null),
    ];
    const sorted = sortBidSummaries(items);
    expect(sorted[0].id).toBe("older");
  });

  it("committed outcomes sort by outcomeLoggedAt DESC (newest first)", () => {
    const items = [
      base("a", "won", "2026-03-01", "2026-04-01"),
      base("b", "lost", "2026-03-01", "2026-04-10"),
    ];
    const sorted = sortBidSummaries(items);
    expect(sorted[0].id).toBe("b");
  });

  it("awaiting always before committed", () => {
    const items = [
      base("committed", "won", "2026-03-01", "2026-04-10"),
      base("awaiting", null, "2026-04-09", null),
    ];
    const sorted = sortBidSummaries(items);
    expect(sorted[0].id).toBe("awaiting");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/pipeline.test.ts`
Expected: FAIL — `pipeline` module not found.

- [ ] **Step 4: Implement `src/lib/pipeline.ts`**

Create `src/lib/pipeline.ts`:

```typescript
import type { PipelineItem, BidSummary, Urgency } from "./types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function daysUntil(isoDate: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(isoDate);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / MS_PER_DAY);
}

export function calculateUrgency(daysLeft: number): Urgency {
  if (daysLeft < 7) return "urgent";
  if (daysLeft < 14) return "soon";
  return "later";
}

export function sortPipelineItems(items: PipelineItem[]): PipelineItem[] {
  return [...items].sort((a, b) => a.daysLeft - b.daysLeft);
}

export function sortBidSummaries(items: BidSummary[]): BidSummary[] {
  return [...items].sort((a, b) => {
    const aAwaiting = a.outcome === null;
    const bAwaiting = b.outcome === null;

    // Awaiting before committed
    if (aAwaiting !== bAwaiting) return aAwaiting ? -1 : 1;

    // Both awaiting: oldest export first
    if (aAwaiting && bAwaiting) {
      return a.exportedAt.localeCompare(b.exportedAt);
    }

    // Both committed: newest logged first
    const aLog = a.outcomeLoggedAt ?? "";
    const bLog = b.outcomeLoggedAt ?? "";
    return bLog.localeCompare(aLog);
  });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/pipeline.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/pipeline.ts src/lib/__tests__/pipeline.test.ts
git commit -m "feat(pipeline): types + pure-logic helpers with unit tests"
```

---

## Task 3: `GET /api/pipeline` endpoint

**Files:**
- Create: `src/app/api/pipeline/route.ts`

- [ ] **Step 1: Implement route**

Create `src/app/api/pipeline/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { DEFAULT_ORG_ID } from "@/lib/constants";
import { daysUntil, calculateUrgency, sortPipelineItems } from "@/lib/pipeline";
import type { PipelineItem, RfpAnalysis } from "@/lib/types";

const MIN_SCORE = 65;

export async function GET() {
  const supabase = createServiceClient();
  const today = new Date().toISOString().split("T")[0];

  // Fetch TED opportunities: score >= 65, future deadline, not dismissed,
  // not already submitted (no exported bid on their analysis_id).
  const { data: opportunities, error: oppErr } = await supabase
    .from("rfp_opportunities")
    .select("id, title, deadline, relevance_score, analysis_id, ted_url, status")
    .eq("organization_id", DEFAULT_ORG_ID)
    .gte("relevance_score", MIN_SCORE)
    .gte("deadline", today)
    .neq("status", "dismissed");

  if (oppErr) {
    return NextResponse.json({ error: oppErr.message }, { status: 500 });
  }

  // Fetch own uploads: documents with analyses, no exported bid yet.
  const { data: analyses, error: anErr } = await supabase
    .from("analyses")
    .select("id, document_id, analysis, created_at, documents!inner(file_name)")
    .order("created_at", { ascending: false });

  if (anErr) {
    return NextResponse.json({ error: anErr.message }, { status: 500 });
  }

  // Fetch exported bids keyed by analysis_id
  const { data: exportedBids } = await supabase
    .from("bids")
    .select("analysis_id")
    .not("exported_at", "is", null);

  const submittedAnalysisIds = new Set(
    (exportedBids ?? []).map((b) => b.analysis_id as string)
  );

  const tedItems: PipelineItem[] = (opportunities ?? [])
    .filter((o) => o.deadline !== null)
    .filter((o) => !o.analysis_id || !submittedAnalysisIds.has(o.analysis_id))
    .map((o) => {
      const daysLeft = daysUntil(o.deadline as string);
      return {
        id: o.id as string,
        source: "ted",
        title: o.title as string,
        deadline: o.deadline as string,
        daysLeft,
        urgency: calculateUrgency(daysLeft),
        relevanceScore: (o.relevance_score as number) ?? null,
        analysisId: (o.analysis_id as string) ?? null,
        tedUrl: (o.ted_url as string) ?? null,
      };
    });

  const uploadItems: PipelineItem[] = (analyses ?? [])
    .filter((a) => !submittedAnalysisIds.has(a.id as string))
    .map((a) => {
      const analysis = a.analysis as RfpAnalysis;
      const deadline = (analysis.submissionDeadline as string) ?? null;
      if (!deadline) return null;
      const daysLeft = daysUntil(deadline);
      if (daysLeft < 0) return null;
      const title =
        (analysis.title as string) ??
        ((a.documents as unknown as { file_name: string })?.file_name ?? "Namnlös RFP");
      return {
        id: a.id as string,
        source: "upload" as const,
        title,
        deadline,
        daysLeft,
        urgency: calculateUrgency(daysLeft),
        relevanceScore: null,
        analysisId: a.id as string,
        tedUrl: null,
      };
    })
    .filter((x): x is PipelineItem => x !== null);

  const items = sortPipelineItems([...tedItems, ...uploadItems]);

  return NextResponse.json({ items });
}
```

**Note on `submissionDeadline`:** The field name in `RfpAnalysis` JSON may differ. Check `src/lib/types.ts` for the actual property — common candidates: `submissionDeadline`, `submission_deadline`, `deadline`. Adjust the accessor accordingly.

- [ ] **Step 2: Verify RfpAnalysis deadline field**

Run: `grep -rn "submissionDeadline\|submission_deadline" src/lib/types.ts src/lib/ai-schemas.ts`

If the field has a different name, update the route accordingly before committing.

- [ ] **Step 3: Manual smoke**

Run: `npm run dev`
Fetch: `curl http://localhost:3000/api/pipeline`
Expected: `{ items: [...] }` — array of items sorted by `daysLeft` ASC.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/pipeline/route.ts
git commit -m "feat(api): GET /api/pipeline — union of TED + uploads"
```

---

## Task 4: `GET /api/bids/dashboard` endpoint

**Files:**
- Create: `src/app/api/bids/dashboard/route.ts`

- [ ] **Step 1: Implement route**

Create `src/app/api/bids/dashboard/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { DEFAULT_ORG_ID } from "@/lib/constants";
import { sortBidSummaries } from "@/lib/pipeline";
import type { BidSummary, PipelineStats, RfpAnalysis } from "@/lib/types";

const MAX_ITEMS = 8;

export async function GET() {
  const supabase = createServiceClient();

  const { data: bids, error } = await supabase
    .from("bids")
    .select(`
      id, team_consultant_ids, outcome, outcome_logged_at,
      competitor_name, loss_reason, loss_comment, exported_at,
      analyses!inner(id, analysis)
    `)
    .eq("organization_id", DEFAULT_ORG_ID)
    .not("exported_at", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch consultant names for display
  const consultantIds = Array.from(
    new Set((bids ?? []).flatMap((b) => (b.team_consultant_ids as string[]) ?? []))
  );
  const { data: consultants } = await supabase
    .from("consultants")
    .select("id, name")
    .in("id", consultantIds.length > 0 ? consultantIds : ["00000000-0000-0000-0000-000000000000"]);

  const nameById = new Map((consultants ?? []).map((c) => [c.id as string, c.name as string]));

  const summaries: BidSummary[] = (bids ?? []).map((b) => {
    const analysis = (b.analyses as unknown as { analysis: RfpAnalysis })?.analysis;
    const title = (analysis?.title as string) ?? "Namnlös RFP";
    const ids = (b.team_consultant_ids as string[]) ?? [];
    return {
      id: b.id as string,
      title,
      exportedAt: b.exported_at as string,
      teamNames: ids.map((id) => nameById.get(id) ?? "—"),
      outcome: (b.outcome as BidSummary["outcome"]) ?? null,
      outcomeLoggedAt: (b.outcome_logged_at as string) ?? null,
      competitorName: (b.competitor_name as string) ?? null,
      lossReason: (b.loss_reason as BidSummary["lossReason"]) ?? null,
      lossComment: (b.loss_comment as string) ?? null,
    };
  });

  const sorted = sortBidSummaries(summaries);
  const items = sorted.slice(0, MAX_ITEMS);

  const stats: PipelineStats = {
    awaitingCount: summaries.filter((s) => s.outcome === null).length,
    loggedCount: summaries.filter((s) => s.outcome !== null).length,
    wonCount: summaries.filter((s) => s.outcome === "won").length,
    lostCount: summaries.filter((s) => s.outcome === "lost").length,
  };

  return NextResponse.json({ items, stats });
}
```

- [ ] **Step 2: Manual smoke**

Run: `curl http://localhost:3000/api/bids/dashboard`
Expected: `{ items: [...], stats: { awaitingCount, loggedCount, wonCount, lostCount } }`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/bids/dashboard/route.ts
git commit -m "feat(api): GET /api/bids/dashboard — sektion 2 data"
```

---

## Task 5: `PATCH /api/bids/[id]/outcome` endpoint

**Files:**
- Create: `src/app/api/bids/[id]/outcome/route.ts`

- [ ] **Step 1: Implement route**

Create `src/app/api/bids/[id]/outcome/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import type { OutcomePatch } from "@/lib/types";

const VALID_OUTCOMES = ["won", "lost", "no-bid", "cancelled"] as const;
const VALID_REASONS = ["pris", "erfarenhet", "team", "kvalitet", "relation", "annat"] as const;

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const body = (await request.json()) as Partial<OutcomePatch>;

  if (!body.outcome || !VALID_OUTCOMES.includes(body.outcome)) {
    return NextResponse.json(
      { error: `outcome must be one of: ${VALID_OUTCOMES.join(", ")}` },
      { status: 400 }
    );
  }

  if (body.lossReason && !VALID_REASONS.includes(body.lossReason)) {
    return NextResponse.json(
      { error: `lossReason must be one of: ${VALID_REASONS.join(", ")}` },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  const { error } = await supabase
    .from("bids")
    .update({
      outcome: body.outcome,
      competitor_name: body.competitorName ?? null,
      loss_reason: body.lossReason ?? null,
      loss_comment: body.lossComment ?? null,
      outcome_logged_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Manual smoke**

Find a bid ID with `exported_at IS NOT NULL`. Run:

```bash
curl -X PATCH http://localhost:3000/api/bids/<id>/outcome \
  -H "Content-Type: application/json" \
  -d '{"outcome":"lost","competitorName":"Acme","lossReason":"pris","lossComment":"test"}'
```

Expected: `{ ok: true }`. Verify in Supabase that row updated.

Also test validation:

```bash
curl -X PATCH http://localhost:3000/api/bids/<id>/outcome -d '{"outcome":"invalid"}'
```

Expected: 400 with error message.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/bids/[id]/outcome/route.ts
git commit -m "feat(api): PATCH /api/bids/[id]/outcome — log won/lost/cancelled"
```

---

## Task 6: CSS variables + presentational row components

**Files:**
- Modify: `src/app/globals.css`
- Create: `src/components/pipeline/PipelineRow.tsx`
- Create: `src/components/pipeline/SubmittedRow.tsx`

- [ ] **Step 1: Add CSS variables to `src/app/globals.css`**

Append to `src/app/globals.css`:

```css
:root {
  --urgency-urgent: #dc2626;
  --urgency-soon: #d97706;
  --urgency-later: #10b981;
  --outcome-awaiting: #94a3b8;
  --outcome-won: #10b981;
  --outcome-lost: #dc2626;
  --outcome-cancelled: #94a3b8;
}
```

- [ ] **Step 2: Create `src/components/pipeline/PipelineRow.tsx`**

```typescript
import Link from "next/link";
import type { PipelineItem } from "@/lib/types";

const BORDER_COLOR: Record<PipelineItem["urgency"], string> = {
  urgent: "var(--urgency-urgent)",
  soon: "var(--urgency-soon)",
  later: "var(--urgency-later)",
};

const DAYS_LABEL_COLOR: Record<PipelineItem["urgency"], string> = {
  urgent: "var(--urgency-urgent)",
  soon: "var(--urgency-soon)",
  later: "#6b7280",
};

function formatSourceMeta(item: PipelineItem): string {
  if (item.source === "upload") return "Egen upload";
  if (item.relevanceScore !== null) return `TED · Score ${item.relevanceScore}`;
  return "TED";
}

export function PipelineRow({ item }: { item: PipelineItem }) {
  const href = item.analysisId ? `/analysis/${item.analysisId}` : "#";
  const weight = item.urgency === "urgent" ? 600 : 400;

  return (
    <Link
      href={href}
      className="block bg-[#fafafa] rounded-r mb-1.5 px-3 py-2 hover:bg-gray-100 transition-colors"
      style={{ borderLeft: `3px solid ${BORDER_COLOR[item.urgency]}` }}
    >
      <div className="text-sm font-medium text-gray-900 truncate">{item.title}</div>
      <div className="flex justify-between items-baseline mt-0.5">
        <span className="text-xs text-gray-600">{formatSourceMeta(item)}</span>
        <span
          className="text-xs"
          style={{ color: DAYS_LABEL_COLOR[item.urgency], fontWeight: weight }}
        >
          {item.daysLeft === 0 ? "Idag" : `${item.daysLeft}d kvar`}
        </span>
      </div>
    </Link>
  );
}
```

- [ ] **Step 3: Create `src/components/pipeline/SubmittedRow.tsx`**

```typescript
import Link from "next/link";
import type { BidSummary } from "@/lib/types";

const BORDER_BY_OUTCOME: Record<string, string> = {
  awaiting: "var(--outcome-awaiting)",
  won: "var(--outcome-won)",
  lost: "var(--outcome-lost)",
  cancelled: "var(--outcome-cancelled)",
  "no-bid": "var(--outcome-cancelled)",
};

function outcomeLabel(b: BidSummary): string {
  if (b.outcome === null) return "Väntar beslut";
  if (b.outcome === "won") return "✓ Vunnen";
  if (b.outcome === "lost") return "✗ Förlorad";
  if (b.outcome === "cancelled") return "— Avbröts";
  return "— Inget anbud";
}

function daysSinceExport(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export function SubmittedRow({ bid }: { bid: BidSummary }) {
  const key = bid.outcome ?? "awaiting";
  const borderStyle =
    key === "cancelled" || key === "no-bid"
      ? `3px dashed ${BORDER_BY_OUTCOME[key]}`
      : `3px solid ${BORDER_BY_OUTCOME[key]}`;

  return (
    <Link
      href={`/bids/${bid.id}`}
      className="block bg-[#fafafa] rounded-r mb-1.5 px-3 py-2 hover:bg-gray-100 transition-colors"
      style={{ borderLeft: borderStyle }}
    >
      <div className="text-sm font-medium text-gray-900 truncate">{bid.title}</div>
      <div className="text-xs text-gray-600 mt-0.5">
        {outcomeLabel(bid)}
        {bid.outcome === null && ` · ${daysSinceExport(bid.exportedAt)}d sen`}
        {bid.outcome === "lost" && bid.competitorName && ` · mot ${bid.competitorName}`}
      </div>
    </Link>
  );
}
```

- [ ] **Step 4: Manual smoke — render in isolation**

Create a scratch test page at `src/app/_scratch/pipeline/page.tsx` (optional, delete after). Or skip — you'll smoke-test once integrated on `/`.

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css src/components/pipeline/PipelineRow.tsx src/components/pipeline/SubmittedRow.tsx
git commit -m "feat(pipeline): presentational row components + CSS vars"
```

---

## Task 7: OutcomeEnrichmentForm (with tests)

**Files:**
- Create: `src/components/pipeline/OutcomeEnrichmentForm.tsx`
- Create: `src/components/pipeline/__tests__/OutcomeEnrichmentForm.test.tsx`

- [ ] **Step 1: Write failing test**

Create `src/components/pipeline/__tests__/OutcomeEnrichmentForm.test.tsx`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OutcomeEnrichmentForm } from "../OutcomeEnrichmentForm";

describe("OutcomeEnrichmentForm", () => {
  it("shows all three fields when outcome is 'lost'", () => {
    render(
      <OutcomeEnrichmentForm outcome="lost" onSave={vi.fn()} onSkip={vi.fn()} />
    );
    expect(screen.getByLabelText(/Vem vann/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Varför/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Fri kommentar/i)).toBeInTheDocument();
  });

  it("only shows 'Fri kommentar' for 'won' outcome", () => {
    render(
      <OutcomeEnrichmentForm outcome="won" onSave={vi.fn()} onSkip={vi.fn()} />
    );
    expect(screen.queryByLabelText(/Vem vann/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Varför/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Fri kommentar/i)).toBeInTheDocument();
  });

  it("calls onSave with form values on Spara click", () => {
    const onSave = vi.fn();
    render(
      <OutcomeEnrichmentForm outcome="lost" onSave={onSave} onSkip={vi.fn()} />
    );
    fireEvent.change(screen.getByLabelText(/Vem vann/i), {
      target: { value: "Acme" },
    });
    fireEvent.change(screen.getByLabelText(/Varför/i), {
      target: { value: "pris" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Spara/i }));
    expect(onSave).toHaveBeenCalledWith({
      competitorName: "Acme",
      lossReason: "pris",
      lossComment: "",
    });
  });

  it("calls onSkip on Hoppa över", () => {
    const onSkip = vi.fn();
    render(
      <OutcomeEnrichmentForm outcome="lost" onSave={vi.fn()} onSkip={onSkip} />
    );
    fireEvent.click(screen.getByRole("button", { name: /Hoppa över/i }));
    expect(onSkip).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/pipeline/__tests__/OutcomeEnrichmentForm.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Check if @testing-library/react is installed**

Run: `cat package.json | grep testing-library`

If missing, install: `npm i -D @testing-library/react @testing-library/jest-dom`

- [ ] **Step 4: Implement `src/components/pipeline/OutcomeEnrichmentForm.tsx`**

```typescript
"use client";

import { useState } from "react";
import type { LossReason, BidOutcome } from "@/lib/types";

interface Props {
  outcome: BidOutcome;
  onSave: (values: {
    competitorName: string;
    lossReason: LossReason | "";
    lossComment: string;
  }) => void;
  onSkip: () => void;
}

const REASONS: Array<{ value: LossReason; label: string }> = [
  { value: "pris", label: "Pris" },
  { value: "erfarenhet", label: "Erfarenhet / referenser" },
  { value: "team", label: "Team-matchning" },
  { value: "kvalitet", label: "Kvalitet i anbud" },
  { value: "relation", label: "Relation / incumbent" },
  { value: "annat", label: "Annat" },
];

export function OutcomeEnrichmentForm({ outcome, onSave, onSkip }: Props) {
  const [competitorName, setCompetitorName] = useState("");
  const [lossReason, setLossReason] = useState<LossReason | "">("");
  const [lossComment, setLossComment] = useState("");

  const showLossFields = outcome === "lost";

  return (
    <div className="bg-white border border-gray-200 rounded-md p-3.5 mt-2 text-sm">
      <p className="text-xs text-gray-600 italic mb-3">
        💡 Valfria detaljer — tränar modellen. Hoppa över om du inte vet.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {showLossFields && (
          <>
            <label className="block">
              <span className="block text-xs text-gray-700 mb-1 font-medium">Vem vann?</span>
              <input
                value={competitorName}
                onChange={(e) => setCompetitorName(e.target.value)}
                placeholder="Konkurrentens namn"
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
              />
            </label>
            <label className="block">
              <span className="block text-xs text-gray-700 mb-1 font-medium">Varför förlorade vi?</span>
              <select
                value={lossReason}
                onChange={(e) => setLossReason(e.target.value as LossReason | "")}
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
              >
                <option value="">— Välj —</option>
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <label className="block col-span-2">
          <span className="block text-xs text-gray-700 mb-1 font-medium">Fri kommentar</span>
          <textarea
            value={lossComment}
            onChange={(e) => setLossComment(e.target.value)}
            placeholder="Vad lärde vi oss?"
            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm min-h-[60px] resize-y"
          />
        </label>
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => onSave({ competitorName, lossReason, lossComment })}
          className="px-3 py-1.5 bg-black text-white rounded text-xs"
        >
          Spara
        </button>
        <button
          onClick={onSkip}
          className="px-3 py-1.5 border border-gray-300 text-gray-600 rounded text-xs"
        >
          Hoppa över
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/components/pipeline/__tests__/OutcomeEnrichmentForm.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/pipeline/OutcomeEnrichmentForm.tsx src/components/pipeline/__tests__/OutcomeEnrichmentForm.test.tsx
git commit -m "feat(pipeline): OutcomeEnrichmentForm with tests"
```

---

## Task 8: OutcomeSheet (side-sheet container)

**Files:**
- Create: `src/components/pipeline/OutcomeSheet.tsx`

- [ ] **Step 1: Implement component**

Create `src/components/pipeline/OutcomeSheet.tsx`:

```typescript
"use client";

import { useState } from "react";
import type { BidSummary, BidOutcome, LossReason } from "@/lib/types";
import { OutcomeEnrichmentForm } from "./OutcomeEnrichmentForm";

interface Props {
  awaiting: BidSummary[];
  onClose: () => void;
  onCommitted: () => void; // called after outcome saved, so parent can refetch
}

type CommittedRow = {
  bidId: string;
  outcome: BidOutcome;
};

export function OutcomeSheet({ awaiting, onClose, onCommitted }: Props) {
  const [committed, setCommitted] = useState<Record<string, BidOutcome>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const hasCommitted = Object.keys(committed).length > 0;
  const sheetWidth = hasCommitted ? "720px" : "440px";

  async function commitOutcome(bidId: string, outcome: BidOutcome) {
    setSavingId(bidId);
    const res = await fetch(`/api/bids/${bidId}/outcome`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome }),
    });
    setSavingId(null);
    if (!res.ok) {
      alert("Kunde inte spara utfall. Försök igen.");
      return;
    }
    setCommitted((prev) => ({ ...prev, [bidId]: outcome }));
    onCommitted();
  }

  async function saveEnrichment(
    bidId: string,
    values: { competitorName: string; lossReason: LossReason | ""; lossComment: string }
  ) {
    const outcome = committed[bidId];
    const res = await fetch(`/api/bids/${bidId}/outcome`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        outcome,
        competitorName: values.competitorName || undefined,
        lossReason: values.lossReason || undefined,
        lossComment: values.lossComment || undefined,
      }),
    });
    if (!res.ok) {
      alert("Kunde inte spara detaljer.");
      return;
    }
    // Collapse the enrichment panel by removing from committed (it stays saved in DB)
    setCommitted((prev) => {
      const next = { ...prev };
      delete next[bidId];
      return next;
    });
    onCommitted();
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <aside
        className="fixed top-0 right-0 bottom-0 bg-white shadow-2xl z-50 flex flex-col"
        style={{ width: sheetWidth, transition: "width 200ms ease-out" }}
      >
        <header className="flex justify-between items-center px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold">
            Logga utfall · {awaiting.length} väntar
          </h2>
          <button onClick={onClose} className="text-2xl text-gray-500 leading-none">
            ×
          </button>
        </header>
        <div className="bg-amber-50 border-b border-amber-200 px-5 py-2.5 text-xs text-gray-800">
          📊 Detaljerna här tränar din firmas Go/No-Go-modell — vi lär oss vad ni vinner och förlorar på.
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {awaiting.length === 0 && (
            <p className="text-sm text-gray-600 italic">Inga anbud väntar på utfall.</p>
          )}
          {awaiting.map((bid) => {
            const outcomeKey = committed[bid.id];
            return (
              <div
                key={bid.id}
                className="border border-gray-200 rounded-r p-3 mb-3"
                style={{
                  borderLeft: `4px solid ${
                    outcomeKey === "won"
                      ? "var(--outcome-won)"
                      : outcomeKey === "lost"
                      ? "var(--outcome-lost)"
                      : "var(--outcome-awaiting)"
                  }`,
                }}
              >
                <div className="text-sm font-medium">{bid.title}</div>
                <div className="text-xs text-gray-600 mt-1">
                  Inlämnat {new Date(bid.exportedAt).toLocaleDateString("sv-SE")}
                  {bid.teamNames.length > 0 && ` · Team: ${bid.teamNames.join(", ")}`}
                </div>
                {!outcomeKey && (
                  <div className="flex gap-1.5 mt-2.5">
                    <button
                      disabled={savingId === bid.id}
                      onClick={() => commitOutcome(bid.id, "won")}
                      className="px-3 py-1.5 bg-emerald-600 text-white rounded text-xs disabled:opacity-50"
                    >
                      Vunnen
                    </button>
                    <button
                      disabled={savingId === bid.id}
                      onClick={() => commitOutcome(bid.id, "lost")}
                      className="px-3 py-1.5 bg-white text-red-600 border border-red-600 rounded text-xs disabled:opacity-50"
                    >
                      Förlorad
                    </button>
                    <button
                      disabled={savingId === bid.id}
                      onClick={() => commitOutcome(bid.id, "cancelled")}
                      className="px-3 py-1.5 bg-transparent text-gray-600 border border-gray-300 rounded text-xs disabled:opacity-50"
                    >
                      Avbröts
                    </button>
                  </div>
                )}
                {outcomeKey && (outcomeKey === "won" || outcomeKey === "lost") && (
                  <OutcomeEnrichmentForm
                    outcome={outcomeKey}
                    onSave={(v) => saveEnrichment(bid.id, v)}
                    onSkip={() =>
                      setCommitted((prev) => {
                        const next = { ...prev };
                        delete next[bid.id];
                        return next;
                      })
                    }
                  />
                )}
              </div>
            );
          })}
        </div>
      </aside>
    </>
  );
}
```

- [ ] **Step 2: Manual smoke placeholder**

Skip direct testing — will be integrated in Task 9 and smoke-tested end-to-end in Task 10.

- [ ] **Step 3: Commit**

```bash
git add src/components/pipeline/OutcomeSheet.tsx
git commit -m "feat(pipeline): OutcomeSheet side-sheet with expand-on-commit"
```

---

## Task 9: PipelineRail (container) + home page integration

**Files:**
- Create: `src/components/pipeline/PipelineRail.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Implement PipelineRail**

Create `src/components/pipeline/PipelineRail.tsx`:

```typescript
"use client";

import { useEffect, useState, useCallback } from "react";
import type { PipelineItem, BidSummary, PipelineStats } from "@/lib/types";
import { PipelineRow } from "./PipelineRow";
import { SubmittedRow } from "./SubmittedRow";
import { OutcomeSheet } from "./OutcomeSheet";

export function PipelineRail() {
  const [pipeItems, setPipeItems] = useState<PipelineItem[] | null>(null);
  const [bidItems, setBidItems] = useState<BidSummary[] | null>(null);
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const refetch = useCallback(async () => {
    const [pipeRes, bidsRes] = await Promise.all([
      fetch("/api/pipeline").then((r) => r.json()),
      fetch("/api/bids/dashboard").then((r) => r.json()),
    ]);
    setPipeItems(pipeRes.items ?? []);
    setBidItems(bidsRes.items ?? []);
    setStats(bidsRes.stats ?? null);
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const awaiting = (bidItems ?? []).filter((b) => b.outcome === null);

  return (
    <aside className="bg-[#f8f8f7] border-l border-gray-200 p-4 h-full">
      <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-600 mb-2">
        Pipen {pipeItems && `· ${pipeItems.length} RFPs`}
      </h3>
      {pipeItems === null && <p className="text-xs text-gray-500">Laddar…</p>}
      {pipeItems && pipeItems.length === 0 && (
        <p className="text-xs text-gray-500 italic">
          Inga aktuella RFPs. Ladda upp eller kika på <a href="/radar" className="underline">Radar →</a>
        </p>
      )}
      {pipeItems?.map((item) => (
        <PipelineRow key={item.id} item={item} />
      ))}

      <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-600 mt-6 mb-2">
        Inlämnade {stats && `· ${stats.awaitingCount + stats.loggedCount} anbud`}
      </h3>
      {bidItems === null && <p className="text-xs text-gray-500">Laddar…</p>}
      {bidItems && bidItems.length === 0 && (
        <p className="text-xs text-gray-500 italic">
          Inga inlämnade anbud än. Exporterar du ett anbud hamnar det här.
        </p>
      )}
      {bidItems?.map((bid) => (
        <SubmittedRow key={bid.id} bid={bid} />
      ))}

      {awaiting.length > 0 && (
        <button
          onClick={() => setSheetOpen(true)}
          className="block w-full text-left text-xs text-black underline mt-2 hover:no-underline"
        >
          📊 {awaiting.length} anbud väntar på utfall — Logga utfall →
        </button>
      )}

      {stats && stats.loggedCount > 0 && (
        <p className="text-[11px] text-gray-500 mt-4 pt-3 border-t border-gray-200 leading-relaxed">
          Du har loggat {stats.loggedCount} utfall — Go/No-Go-rekommendationer är nu kalibrerade mot er firma.
        </p>
      )}
      {stats && stats.loggedCount === 0 && awaiting.length > 0 && (
        <p className="text-[11px] text-gray-500 mt-4 pt-3 border-t border-gray-200 leading-relaxed">
          Logga ditt första utfall för att börja träna modellen mot er firma.
        </p>
      )}

      {sheetOpen && (
        <OutcomeSheet
          awaiting={awaiting}
          onClose={() => setSheetOpen(false)}
          onCommitted={refetch}
        />
      )}
    </aside>
  );
}
```

- [ ] **Step 2: Modify `src/app/page.tsx`**

Replace contents with:

```typescript
import { UploadForm } from "@/components/upload-form";
import { PipelineRail } from "@/components/pipeline/PipelineRail";

export default function Home() {
  return (
    <main className="min-h-screen bg-white grid grid-cols-[1fr_260px]">
      <div>
        <div className="max-w-2xl mx-auto px-4 py-16">
          <div className="mb-12">
            <h1 className="text-3xl font-bold">Analysera förfrågningsunderlag</h1>
            <p className="text-gray-500 mt-2">
              Ladda upp ett förfrågningsunderlag för strukturerad kravanalys.
            </p>
          </div>
          <UploadForm />
        </div>
      </div>
      <PipelineRail />
    </main>
  );
}
```

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/pipeline/PipelineRail.tsx src/app/page.tsx
git commit -m "feat(pipeline): PipelineRail container + integrate on /"
```

---

## Task 10: End-to-end manual smoke test

**Files:** none (manual verification)

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

Open http://localhost:3000.

- [ ] **Step 2: Verify initial render**

- Rail visible on right, ~260px wide
- Main area has upload-hero oförändrad
- "Pipen" header + rows (or empty-state copy)
- "Inlämnade" header + rows (or empty-state copy)

- [ ] **Step 3: Pipen populated correctly**

- Uppladdad RFP med deadline >= today ska dyka upp
- TED opportunity med score >=65, deadline >= today, inte dismissad ska dyka upp
- Urgency-färg: röd <7d, orange 7-13d, grön >=14d
- Klick på rad → navigerar till `/analysis/[id]`

- [ ] **Step 4: Inlämnade populated correctly**

Verifiera:
- Exporterat bid syns som "Väntar beslut" (grå border)
- Klick → `/bids/[id]`

- [ ] **Step 5: "Logga utfall"-flow**

- Klicka "Logga utfall →"
- Side-sheet öppnas från höger (440px)
- Awaiting bid visas med 3 knappar
- Klicka **Förlorad**
- Panel expanderar till 720px, enrichment-form poppar in
- Fyll i "Vem vann" + "Varför" + fri kommentar
- Klicka **Spara**
- Verifiera i Supabase: `bids.outcome = 'lost'`, `competitor_name`, `loss_reason`, `loss_comment`, `outcome_logged_at` alla satta
- Rail uppdateras: raden nu grön/röd med utfall-text

- [ ] **Step 6: Skip-path**

- Klicka "Logga utfall →"
- Klicka **Vunnen** på ett anbud
- Panel poppar in med bara fri kommentar (ingen "vem vann"/"varför")
- Klicka **Hoppa över**
- Rail uppdateras, men bara `outcome = 'won'`, inga enrichment-fält satta

- [ ] **Step 7: Cancelled path**

- Klicka **Avbröts** — rad får grå dashed border, ingen enrichment poppar
- Verifiera DB: `outcome = 'cancelled'`

- [ ] **Step 8: Stale deadline filter**

- Manuellt i Supabase: sätt en `rfp_opportunities.deadline` till gårdagens datum
- Ladda om `/` — den dyker INTE upp i Pipen

- [ ] **Step 9: Reciprocity copy**

- När `loggedCount > 0`: "Du har loggat X utfall — …"
- När `loggedCount === 0 && awaiting.length > 0`: "Logga ditt första utfall…"
- När båda är 0: ingen reciprocity-rad

- [ ] **Step 10: Commit eventuella fixar**

Om några småbuggar hittades → fixa + commit. Om inga problem → gå vidare.

- [ ] **Step 11: Final commit message — PR-redo**

```bash
git log --oneline master..feat/rfp-dashboard
```

Räkna rader; om det ser rimligt ut (5-8 commits), skapa PR. Annars konsolidera.

---

## Summary

10 tasks, flöde:
1. Migration (DB)
2. Types + lib (TDD-unit tested)
3-5. API-endpoints (3 routes)
6-8. Presentational components (rows + form + sheet)
9. Rail-container + integration
10. Manual smoke-test

Totalt ~15-20 filer skapade/modifierade. Inga nya npm-paket (förutsatt @testing-library/react redan finns — Task 7 steg 3 verifierar).
