# M4 Session 3 — Storage Lockdown + Cost Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock down `rfp-documents` storage bucket (public → authenticated + signed URLs) and instrument every `callClaude()` invocation with token + cost logging in a new `ai_call_logs` table. Closes M4 Beta Readiness Session 3.

**Architecture:**
- **Storage:** flip `rfp-documents` bucket to private; add storage RLS policies keyed on `<org_id>/...` path prefix (same convention as `org-assets`); add `documents.file_path` column (nullable for backwards-compat with `ted://` synthetic URLs); generate signed URLs on read in `analysis/[id]/page.tsx`.
- **Cost tracking:** new `ai_call_logs` table; pure cost calculator with hard-coded pricing constants; service-client logger that runs after every `callClaude` (fire-and-forget so a logging failure never breaks an inference call); pricing table can be patched in one place when Anthropic adjusts list prices.

**Tech Stack:** Next.js 16 (App Router), Supabase Storage + Postgres + RLS, `@anthropic-ai/sdk`, Vitest, TypeScript strict.

**Out of scope:** `org-assets` bucket stays public — tenant logos render in pre-auth contexts (PipelineRail on /login, public bid PDFs in future). PII-scrubbing wrapper is Session 4.

---

## File Map

**Create:**
- `supabase/migrations/012_ai_call_logs.sql` — table + indexes + RLS
- `supabase/migrations/013_storage_lockdown.sql` — bucket privacy flip + storage RLS + `documents.file_path` column
- `src/lib/ai-cost.ts` — pricing table + `calculateCostUsd()` pure function
- `src/lib/ai-call-logger.ts` — `logAiCall()` async helper that writes to `ai_call_logs`
- `src/lib/storage-urls.ts` — `getSignedFileUrl()` helper wrapping `createSignedUrl`
- `src/lib/__tests__/ai-cost.test.ts`
- `src/lib/__tests__/ai-call-logger.test.ts`
- `src/lib/__tests__/storage-urls.test.ts`

**Modify:**
- `src/lib/ai-client.ts` — extract `usage` from `finalMessage`, attach `organizationId` option, fire-and-forget `logAiCall`
- `src/lib/__tests__/ai-client.test.ts` — assert logger invocation with usage payload
- `src/app/api/analyze/route.ts` — store `file_path` (org-prefixed) instead of `file_url`, pass `orgId` to `analyzeRfp`
- `src/app/analysis/[id]/page.tsx` — convert `file_path` → signed URL via helper
- `src/lib/rfp-analyzer.ts` — accept optional `organizationId` and forward to `callClaude`

**Touch lightly (single org-id forwarding parameter each):** every other callsite of `callClaude` (`bid-generator/bundles/*.ts`, `consultant-extractor.ts`, `consultant-matcher.ts`, `go-no-go-evaluator.ts`, `opportunity-scorer.ts`). These are added in Task 4 in one batch, not per-bundle.

---

### Task 1: Migration 012 — `ai_call_logs` schema

**Files:**
- Create: `supabase/migrations/012_ai_call_logs.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- M4 Session 3: cost tracking for Claude API calls.
-- Every callClaude() invocation appends one row.
-- organization_id is nullable so we can log calls before the org is resolved
-- (e.g. invite-bootstrap probes); UI views filter NULL out.

CREATE TABLE ai_call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  model text NOT NULL,
  label text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cache_read_tokens integer NOT NULL DEFAULT 0,
  cache_creation_tokens integer NOT NULL DEFAULT 0,
  cost_usd numeric(10, 6) NOT NULL DEFAULT 0,
  latency_ms integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_call_logs_org_created
  ON ai_call_logs(organization_id, created_at DESC);

CREATE INDEX idx_ai_call_logs_label_created
  ON ai_call_logs(label, created_at DESC);

-- RLS: members read their org's logs; only service role writes.
ALTER TABLE ai_call_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_call_logs_read_own_org ON ai_call_logs
  FOR SELECT TO authenticated
  USING (organization_id = current_org_id());
```

- [ ] **Step 2: Apply migration manually in Supabase SQL Editor**

Stefan's convention from `feedback_migrations.md`: never edit applied migrations; this is a new file so just paste & run.

Expected: `CREATE TABLE`, `CREATE INDEX` (×2), `ALTER TABLE`, `CREATE POLICY` — five success rows in the editor's result panel.

- [ ] **Step 3: Verify table exists**

In Supabase SQL Editor:
```sql
SELECT count(*) FROM ai_call_logs;
```
Expected: `0` (empty table, query succeeds).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/012_ai_call_logs.sql
git commit -m "feat(db): add ai_call_logs table for Claude cost tracking"
```

---

### Task 2: Pure cost calculator (`ai-cost.ts`)

**Files:**
- Create: `src/lib/ai-cost.ts`
- Test: `src/lib/__tests__/ai-cost.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/__tests__/ai-cost.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { calculateCostUsd, getModelPricing } from "@/lib/ai-cost";

describe("getModelPricing", () => {
  it("returns Sonnet 4.6 pricing", () => {
    const p = getModelPricing("claude-sonnet-4-6");
    expect(p.inputPerMTok).toBe(3);
    expect(p.outputPerMTok).toBe(15);
  });

  it("returns Opus 4.7 pricing", () => {
    const p = getModelPricing("claude-opus-4-7");
    expect(p.inputPerMTok).toBe(15);
    expect(p.outputPerMTok).toBe(75);
  });

  it("returns Haiku 4.5 pricing for the dated alias", () => {
    const p = getModelPricing("claude-haiku-4-5-20251001");
    expect(p.inputPerMTok).toBe(1);
    expect(p.outputPerMTok).toBe(5);
  });

  it("falls back to Sonnet pricing for unknown models", () => {
    const p = getModelPricing("claude-future-99");
    expect(p.inputPerMTok).toBe(3);
    expect(p.outputPerMTok).toBe(15);
  });
});

describe("calculateCostUsd", () => {
  it("computes uncached input + output cost", () => {
    const cost = calculateCostUsd({
      model: "claude-sonnet-4-6",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
    // 1M input @ $3 + 1M output @ $15 = $18
    expect(cost).toBeCloseTo(18, 4);
  });

  it("applies 0.1x rate for cache hits", () => {
    const cost = calculateCostUsd({
      model: "claude-sonnet-4-6",
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 1_000_000,
      cacheCreationTokens: 0,
    });
    // 1M cache reads @ 0.1 × $3 = $0.30
    expect(cost).toBeCloseTo(0.3, 4);
  });

  it("applies 1.25x rate for 5min cache writes", () => {
    const cost = calculateCostUsd({
      model: "claude-sonnet-4-6",
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 1_000_000,
    });
    // 1M cache writes @ 1.25 × $3 = $3.75
    expect(cost).toBeCloseTo(3.75, 4);
  });

  it("returns 0 for zero usage", () => {
    const cost = calculateCostUsd({
      model: "claude-sonnet-4-6",
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
    expect(cost).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd ~/projects/agentic-dealflow-m4 && npx vitest run src/lib/__tests__/ai-cost.test.ts
```
Expected: FAIL — module `@/lib/ai-cost` not found.

- [ ] **Step 3: Implement the calculator**

`src/lib/ai-cost.ts`:

```ts
// Anthropic list prices (USD per 1M tokens). Last verified: 2026-04-27.
// Update here when Anthropic publishes new prices.
export interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
}

const PRICING: Record<string, ModelPricing> = {
  "claude-opus-4-7": { inputPerMTok: 15, outputPerMTok: 75 },
  "claude-sonnet-4-6": { inputPerMTok: 3, outputPerMTok: 15 },
  "claude-haiku-4-5-20251001": { inputPerMTok: 1, outputPerMTok: 5 },
};

const FALLBACK: ModelPricing = PRICING["claude-sonnet-4-6"];

// Cache-aware multipliers applied to the input price.
const CACHE_READ_MULTIPLIER = 0.1; // cache hit
const CACHE_WRITE_MULTIPLIER = 1.25; // 5-min ephemeral write

export function getModelPricing(model: string): ModelPricing {
  return PRICING[model] ?? FALLBACK;
}

export interface UsageInput {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export function calculateCostUsd(usage: UsageInput): number {
  const p = getModelPricing(usage.model);
  const perToken = (perMTok: number) => perMTok / 1_000_000;
  return (
    usage.inputTokens * perToken(p.inputPerMTok) +
    usage.outputTokens * perToken(p.outputPerMTok) +
    usage.cacheReadTokens * perToken(p.inputPerMTok) * CACHE_READ_MULTIPLIER +
    usage.cacheCreationTokens * perToken(p.inputPerMTok) * CACHE_WRITE_MULTIPLIER
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/lib/__tests__/ai-cost.test.ts
```
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai-cost.ts src/lib/__tests__/ai-cost.test.ts
git commit -m "feat(ai): pricing table + calculateCostUsd for token usage"
```

---

### Task 3: AI call logger (`ai-call-logger.ts`)

**Files:**
- Create: `src/lib/ai-call-logger.ts`
- Test: `src/lib/__tests__/ai-call-logger.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/__tests__/ai-call-logger.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { logAiCall } from "@/lib/ai-call-logger";

const mockInsert = vi.fn();

vi.mock("@/lib/supabase", () => ({
  createServiceClient: () => ({
    from: () => ({ insert: mockInsert }),
  }),
}));

beforeEach(() => {
  mockInsert.mockReset();
  mockInsert.mockResolvedValue({ error: null });
});

describe("logAiCall", () => {
  it("inserts a row with computed cost and tokens", async () => {
    await logAiCall({
      organizationId: "org-123",
      model: "claude-sonnet-4-6",
      label: "rfp-analyzer",
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      latencyMs: 4200,
    });

    expect(mockInsert).toHaveBeenCalledTimes(1);
    const row = mockInsert.mock.calls[0][0];
    expect(row.organization_id).toBe("org-123");
    expect(row.model).toBe("claude-sonnet-4-6");
    expect(row.label).toBe("rfp-analyzer");
    expect(row.input_tokens).toBe(1000);
    expect(row.output_tokens).toBe(500);
    expect(row.cost_usd).toBeCloseTo(0.0105, 6); // 1000/1M × 3 + 500/1M × 15
    expect(row.latency_ms).toBe(4200);
    expect(row.error).toBeNull();
  });

  it("logs an error string when provided", async () => {
    await logAiCall({
      organizationId: null,
      model: "claude-opus-4-7",
      label: "bid-generator",
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      latencyMs: 12,
      error: "rate limited",
    });

    const row = mockInsert.mock.calls[0][0];
    expect(row.error).toBe("rate limited");
    expect(row.organization_id).toBeNull();
  });

  it("never throws when the insert fails", async () => {
    mockInsert.mockResolvedValue({ error: { message: "db down" } });

    await expect(
      logAiCall({
        organizationId: "org-1",
        model: "claude-sonnet-4-6",
        label: "x",
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        latencyMs: 0,
      })
    ).resolves.toBeUndefined();
  });

  it("never throws when the client throws synchronously", async () => {
    mockInsert.mockImplementation(() => {
      throw new Error("boom");
    });

    await expect(
      logAiCall({
        organizationId: null,
        model: "x",
        label: "y",
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        latencyMs: 0,
      })
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/lib/__tests__/ai-call-logger.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the logger**

`src/lib/ai-call-logger.ts`:

```ts
import { createServiceClient } from "@/lib/supabase";
import { calculateCostUsd } from "@/lib/ai-cost";

export interface LogAiCallInput {
  organizationId: string | null;
  model: string;
  label: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  latencyMs: number;
  error?: string;
}

export async function logAiCall(input: LogAiCallInput): Promise<void> {
  try {
    const cost = calculateCostUsd({
      model: input.model,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      cacheReadTokens: input.cacheReadTokens,
      cacheCreationTokens: input.cacheCreationTokens,
    });

    const client = createServiceClient();
    const { error } = await client.from("ai_call_logs").insert({
      organization_id: input.organizationId,
      model: input.model,
      label: input.label,
      input_tokens: input.inputTokens,
      output_tokens: input.outputTokens,
      cache_read_tokens: input.cacheReadTokens,
      cache_creation_tokens: input.cacheCreationTokens,
      cost_usd: cost,
      latency_ms: input.latencyMs,
      error: input.error ?? null,
    });

    if (error) {
      // Never let a logging failure break an inference call.
      console.warn(`ai-call-logger insert failed: ${error.message}`);
    }
  } catch (err) {
    console.warn(
      `ai-call-logger threw: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/lib/__tests__/ai-call-logger.test.ts
```
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai-call-logger.ts src/lib/__tests__/ai-call-logger.test.ts
git commit -m "feat(ai): logAiCall helper writes usage to ai_call_logs"
```

---

### Task 4: Wire logger into `callClaude`

**Files:**
- Modify: `src/lib/ai-client.ts`
- Modify: `src/lib/__tests__/ai-client.test.ts`
- Modify (forward `organizationId`): `src/lib/rfp-analyzer.ts`, `src/lib/consultant-extractor.ts`, `src/lib/consultant-matcher.ts`, `src/lib/go-no-go-evaluator.ts`, `src/lib/opportunity-scorer.ts`, `src/lib/bid-generator/bundles/{phases,quality,reference,requirement-matrix,team,understanding}.ts`

- [ ] **Step 1: Add the logger spec to ai-client.test.ts**

Append to `src/lib/__tests__/ai-client.test.ts`:

```ts
import { logAiCall } from "@/lib/ai-call-logger";

vi.mock("@/lib/ai-call-logger", () => ({
  logAiCall: vi.fn().mockResolvedValue(undefined),
}));

describe("callClaude — usage logging", () => {
  const schema = z.object({ answer: z.string() });
  const baseArgs = {
    maxTokens: 1000,
    system: "sys",
    userContent: "user",
    schema,
    label: "test",
    model: "claude-sonnet-4-6",
  };

  beforeEach(() => {
    vi.mocked(logAiCall).mockClear();
  });

  it("forwards usage and organizationId to logAiCall on success", async () => {
    mockCreate.mockReturnValue(streamOf({
      content: [{ type: "text", text: '{"answer": "ok"}' }],
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 10,
        cache_creation_input_tokens: 5,
      },
    }));

    await callClaude({ ...baseArgs, organizationId: "org-abc" });

    expect(logAiCall).toHaveBeenCalledTimes(1);
    const call = vi.mocked(logAiCall).mock.calls[0][0];
    expect(call.organizationId).toBe("org-abc");
    expect(call.model).toBe("claude-sonnet-4-6");
    expect(call.label).toBe("test");
    expect(call.inputTokens).toBe(100);
    expect(call.outputTokens).toBe(50);
    expect(call.cacheReadTokens).toBe(10);
    expect(call.cacheCreationTokens).toBe(5);
    expect(call.error).toBeUndefined();
    expect(call.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("logs zero usage when the response omits it", async () => {
    mockCreate.mockReturnValue(streamOf({
      content: [{ type: "text", text: '{"answer": "ok"}' }],
    }));

    await callClaude(baseArgs);

    const call = vi.mocked(logAiCall).mock.calls[0][0];
    expect(call.inputTokens).toBe(0);
    expect(call.outputTokens).toBe(0);
    expect(call.organizationId).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/lib/__tests__/ai-client.test.ts
```
Expected: FAIL — `organizationId` not on options type, `logAiCall` never called.

- [ ] **Step 3: Modify `ai-client.ts`**

Update `src/lib/ai-client.ts`:

1. Add import at top:
```ts
import { logAiCall } from "@/lib/ai-call-logger";
```

2. Extend `CallClaudeOptions<T>`:
```ts
interface CallClaudeOptions<T> {
  model: string;
  maxTokens: number;
  system: string;
  userContent: string;
  schema: z.ZodType<T>;
  label: string;
  effort?: ClaudeEffort;
  organizationId?: string | null;
}
```

3. Update `callClaude` body — replace the entire retry loop:
```ts
export async function callClaude<T>({
  model,
  maxTokens,
  system,
  userContent,
  schema,
  label,
  effort,
  organizationId,
}: CallClaudeOptions<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const startedAt = Date.now();
    try {
      const stream = getClient().messages.stream({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: userContent }],
        ...(effort
          ? {
              thinking: { type: "adaptive" as const },
              output_config: { effort },
            }
          : {}),
      });
      const message = await stream.finalMessage();

      const u = message.usage ?? {};
      void logAiCall({
        organizationId: organizationId ?? null,
        model,
        label,
        inputTokens: u.input_tokens ?? 0,
        outputTokens: u.output_tokens ?? 0,
        cacheReadTokens: u.cache_read_input_tokens ?? 0,
        cacheCreationTokens: u.cache_creation_input_tokens ?? 0,
        latencyMs: Date.now() - startedAt,
      });

      const content = message.content.find((b) => b.type === "text");
      if (!content || content.type !== "text") {
        throw new Error(`Unexpected response type for ${label}`);
      }

      const json = extractJson(content.text);
      if (!json) {
        throw new Error(`No JSON found in response for ${label}`);
      }

      return parseAndValidate(json, schema, label);
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES - 1 && isRetryable(error)) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        await sleep(delay);
        continue;
      }
      void logAiCall({
        organizationId: organizationId ?? null,
        model,
        label,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  throw lastError;
}
```

- [ ] **Step 4: Run the ai-client tests**

```bash
npx vitest run src/lib/__tests__/ai-client.test.ts
```
Expected: PASS — all original tests + 2 new logging tests.

- [ ] **Step 5: Forward `organizationId` from each callsite**

For every file in the modify list above (rfp-analyzer.ts, consultant-extractor.ts, consultant-matcher.ts, go-no-go-evaluator.ts, opportunity-scorer.ts, and the six bid-generator/bundles/* files):

1. Add an optional `organizationId?: string | null` parameter (or extend the existing options object).
2. Pass it through to `callClaude({ ..., organizationId })`.

Example for `src/lib/rfp-analyzer.ts`:
```ts
// Before:
export async function analyzeRfp(rawText: string): Promise<RfpAnalysis> {
  return callClaude({
    model: "claude-sonnet-4-6",
    // ...
    label: "rfp-analyzer",
  });
}

// After:
export async function analyzeRfp(
  rawText: string,
  organizationId?: string | null
): Promise<RfpAnalysis> {
  return callClaude({
    model: "claude-sonnet-4-6",
    // ...
    label: "rfp-analyzer",
    organizationId,
  });
}
```

For consultant-matcher / go-no-go-evaluator / etc., follow the same pattern. If a file already takes an options object, add `organizationId` there.

- [ ] **Step 6: Update analyze callsites to forward `orgId`**

Modify `src/app/api/analyze/route.ts` (line ~65):
```ts
const analysis = await analyzeRfp(rawText, orgId);
```

Modify `src/app/api/radar/opportunities/[id]/analyze/route.ts` (line ~61):
```ts
const analysis = await analyzeRfp(inputText, opp.organization_id);
```

Other callsites (consultant-matcher, go-no-go-evaluator, bid-generator) are reached via API routes that already resolve `orgId` — pass it through. Grep `analyzeRfp\|matchConsultants\|evaluateGoNoGo\|generateBid` and patch each route handler.

- [ ] **Step 7: Run the full test suite**

```bash
npx vitest run
```
Expected: PASS — all existing tests still green, no TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/ai-client.ts src/lib/__tests__/ai-client.test.ts \
        src/lib/rfp-analyzer.ts src/lib/consultant-extractor.ts \
        src/lib/consultant-matcher.ts src/lib/go-no-go-evaluator.ts \
        src/lib/opportunity-scorer.ts src/lib/bid-generator \
        src/app/api/analyze/route.ts \
        src/app/api/radar/opportunities/\[id\]/analyze/route.ts
git commit -m "feat(ai): instrument callClaude with per-call cost logging"
```

---

### Task 5: Migration 013 — storage lockdown

**Files:**
- Create: `supabase/migrations/013_storage_lockdown.sql`

- [ ] **Step 1: Write the migration**

```sql
-- M4 Session 3: lock down rfp-documents bucket.
-- Path convention going forward: <org_id>/<timestamp>-<file_name>
-- Reads happen via signed URLs (createSignedUrl) on the server.
--
-- This migration also wipes existing dev-test rows in documents/analyses/
-- matches/go_no_go_assessments/bids. Public file_url values would die when
-- the bucket flips anyway; clean wipe avoids stale references. Stefan keeps
-- the one real RFP locally if needed (same pattern as 010_wipe_bids).

-- 1. Wipe stale dev data BEFORE the schema change (FK-safe order).
DELETE FROM bids;
DELETE FROM matches;
DELETE FROM go_no_go_assessments;
UPDATE rfp_opportunities
  SET status = 'pending', analysis_id = NULL
  WHERE analysis_id IS NOT NULL;
DELETE FROM analyses;
DELETE FROM documents;

-- 2. Flip bucket privacy
UPDATE storage.buckets SET public = false WHERE id = 'rfp-documents';

-- 3. Add file_path column to documents (nullable: ted:// rows have no storage object)
ALTER TABLE documents ADD COLUMN file_path text;
COMMENT ON COLUMN documents.file_path IS
  'Path inside rfp-documents bucket: <org_id>/<timestamp>-<name>. NULL for synthetic ted:// docs.';

-- 4. Storage RLS — same pattern as org_assets in 011, scoped to rfp-documents.
CREATE POLICY rfp_documents_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'rfp-documents'
    AND (split_part(name, '/', 1))::uuid = current_org_id()
  );

CREATE POLICY rfp_documents_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'rfp-documents'
    AND (split_part(name, '/', 1))::uuid = current_org_id()
  );

CREATE POLICY rfp_documents_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'rfp-documents'
    AND (split_part(name, '/', 1))::uuid = current_org_id()
  );

CREATE POLICY rfp_documents_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'rfp-documents'
    AND (split_part(name, '/', 1))::uuid = current_org_id()
  );
```

- [ ] **Step 2: Apply manually in Supabase SQL Editor**

Paste & run. Expected: ~10 success rows (5× DELETE/UPDATE, UPDATE bucket, ALTER, COMMENT, 4× CREATE POLICY).

- [ ] **Step 3: Verify**

```sql
SELECT public FROM storage.buckets WHERE id = 'rfp-documents';
-- Expected: false

SELECT column_name FROM information_schema.columns
WHERE table_name = 'documents' AND column_name = 'file_path';
-- Expected: one row, file_path

SELECT count(*) FROM documents;
-- Expected: 0 (table wiped)
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/013_storage_lockdown.sql
git commit -m "feat(db): wipe dev data + lock rfp-documents bucket + add file_path"
```

---

### Task 6: Signed URL helper (`storage-urls.ts`)

**Files:**
- Create: `src/lib/storage-urls.ts`
- Test: `src/lib/__tests__/storage-urls.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/__tests__/storage-urls.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSignedFileUrl } from "@/lib/storage-urls";

function makeMockClient(opts: {
  signedUrl?: string;
  error?: { message: string };
}): SupabaseClient {
  const createSignedUrl = vi.fn().mockResolvedValue({
    data: opts.signedUrl ? { signedUrl: opts.signedUrl } : null,
    error: opts.error ?? null,
  });
  return {
    storage: {
      from: () => ({ createSignedUrl }),
    },
  } as unknown as SupabaseClient;
}

describe("getSignedFileUrl", () => {
  it("returns the signed URL when storage succeeds", async () => {
    const client = makeMockClient({ signedUrl: "https://signed.example/abc" });
    const url = await getSignedFileUrl(client, "rfp-documents", "org-1/file.pdf");
    expect(url).toBe("https://signed.example/abc");
  });

  it("returns null when storage errors", async () => {
    const client = makeMockClient({ error: { message: "not found" } });
    const url = await getSignedFileUrl(client, "rfp-documents", "missing.pdf");
    expect(url).toBeNull();
  });

  it("returns null for empty path", async () => {
    const client = makeMockClient({ signedUrl: "ignored" });
    const url = await getSignedFileUrl(client, "rfp-documents", "");
    expect(url).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/lib/__tests__/storage-urls.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

`src/lib/storage-urls.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_TTL_SECONDS = 60 * 60 * 24; // 24 hours — RFPs are public records under offentlighetsprincipen

export async function getSignedFileUrl(
  client: SupabaseClient,
  bucket: string,
  path: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUrl(path, ttlSeconds);
  if (error || !data) return null;
  return data.signedUrl;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/lib/__tests__/storage-urls.test.ts
```
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage-urls.ts src/lib/__tests__/storage-urls.test.ts
git commit -m "feat(storage): getSignedFileUrl helper with 24h TTL"
```

---

### Task 7: Update analyze route to write `file_path`

**Files:**
- Modify: `src/app/api/analyze/route.ts`

- [ ] **Step 1: Replace storage upload + insert block**

Current lines 22-55 use `getPublicUrl` and write `file_url`. Replace with org-prefixed path and persist that path:

```ts
    // Upload file to Supabase Storage
    const filePath = `${orgId}/${Date.now()}-${file.name}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from("rfp-documents")
      .upload(filePath, buffer, {
        contentType: file.type,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: `Upload failed: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // Parse document to text
    const rawText = await parseDocument(buffer, file.name);

    // Save document record (file_path replaces public file_url)
    const { data: doc, error: docError } = await supabase
      .from("documents")
      .insert({
        file_name: file.name,
        file_url: `supabase://rfp-documents/${filePath}`, // legacy column kept non-null
        file_path: filePath,
        raw_text: rawText,
        organization_id: orgId,
      })
      .select()
      .single();
```

**Why keep `file_url` populated:** the column is `NOT NULL` in `001_initial_schema.sql`. Writing a `supabase://` placeholder keeps existing reads from breaking before the analysis page migrates to `file_path`. A future migration can drop `file_url` once all UI reads from `file_path`.

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/analyze/route.ts
git commit -m "feat(analyze): upload to org-prefixed path + persist file_path"
```

---

### Task 8: Update analysis page to use signed URLs

**Files:**
- Modify: `src/app/analysis/[id]/page.tsx`

- [ ] **Step 1: Patch the file_url consumption**

Add import:
```ts
import { getSignedFileUrl } from "@/lib/storage-urls";
```

Extend the analyses select to include `file_path`:
```ts
.select(`
  id,
  analysis,
  created_at,
  documents (
    file_name,
    file_url,
    file_path
  )
`)
```

Type:
```ts
const document = data.documents as unknown as {
  file_name: string;
  file_url: string;
  file_path: string | null;
};
```

After fetching `document`, generate the signed URL when a path exists:
```ts
const fileUrl = document.file_path
  ? await getSignedFileUrl(supabase, "rfp-documents", document.file_path)
  : document.file_url; // ted:// or legacy public URL
```

Pass `fileUrl` (string | null) wherever the page previously used `document.file_url` — render a "Källfil ej tillgänglig" fallback when null.

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Smoke-test locally**

```bash
npm run dev
```
- Upload a fresh RFP via the UI.
- Open the analysis page.
- Confirm the source-file link opens with a signed URL (URL contains `?token=`).

- [ ] **Step 4: Commit**

```bash
git add src/app/analysis/\[id\]/page.tsx
git commit -m "feat(analysis): render rfp source via signed URL"
```

---

### Task 9: Final sweep + PR

- [ ] **Step 1: Type-check + lint + tests**

```bash
npx tsc --noEmit && npx eslint . && npx vitest run
```
Expected: all green.

- [ ] **Step 2: Update memory note**

Update `~/.claude/projects/C--Users-stefa/memory/project_agentic_dealflow.md` Status line to mark Session 3 done. Add a follow-up: "Session 4 (~1h): PII-scrubbing wrapper i `callClaude()`."

- [ ] **Step 3: Push and open PR**

```bash
git push -u origin feat/m4-session-3
gh pr create --title "feat(m4): storage lockdown + ai cost tracking" \
  --body "$(cat <<'EOF'
## Summary
- `rfp-documents` bucket flipped to private; reads via signed URLs (1h TTL).
- `documents.file_path` column added; analyze route writes org-prefixed paths.
- `ai_call_logs` table tracks every `callClaude()` call with token usage + USD cost.
- `callClaude` now takes optional `organizationId` and fires `logAiCall` after each invocation (and on terminal error).

## Test plan
- [ ] `npx vitest run` — all green
- [ ] `npx tsc --noEmit` — clean
- [ ] Manual: upload a fresh RFP, confirm signed URL on analysis page
- [ ] Manual: query `select count(*) from ai_call_logs` after one analysis run — non-zero
- [ ] Manual: `select model, label, cost_usd from ai_call_logs order by created_at desc limit 5` — sane values

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Wait for PR-review routine**

Per `feedback_pr_review_routine_wait.md`: do not squash-merge until the auto-review routine has commented.

---

## Self-Review Notes

- **Spec coverage:** memory says scope = storage policies (public → authenticated + signed URLs) + cost tracking (`ai_call_logs`, wrapper i `ai-client.ts`). Tasks 1-4 cover cost tracking; Tasks 5-8 cover storage. Task 9 wraps up.
- **Backwards compat:** `documents.file_url` stays NOT NULL (legacy schema constraint); `file_path` is additive. `organizationId` on `callClaude` is optional so partial rollout doesn't break callsites.
- **Failure isolation:** `logAiCall` swallows all errors; a Supabase outage cannot break inference.
- **Why org-assets stays public:** logos render in pre-auth contexts (login page PipelineRail). Flipping it would break that — out of scope for this session.
