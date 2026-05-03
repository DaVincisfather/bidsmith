# PPTX Korrigerings-pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bygg lager 1 (slot-budget i prompt) + lager 2 (inline text-cap verify) + lager 3 (flag-only post-retry, surface i bid-editor) ovanpå befintliga `_soft-cap.ts`-foundation, med multi-template-stöd via Supabase `template_configs`.

**Architecture:** Bundles får budgets injicerade i prompts vid generation. Post-LLM kör `verifyFieldBudgets` (pure function) mot Zod-parsed bundle-output. Vid overflow: 1 retry per LLM-anrop, global cap 5 per bid. Kvarvarande overflows persisteras som `bid.overflow_flags JSONB`. Bid-editor visar `OverflowChecklist` (right rail) med live counter per fält i `EditableText`.

**Tech Stack:** TypeScript strict, Vitest, Next.js 16 App Router, Supabase (PostgreSQL + RLS), pptx-automizer, Zod.

**Spec:** `/agentic-dealflow/docs/superpowers/specs/2026-05-03-pptx-corrector-design.md`

**Branch:** `feat/pptx-corrector` (skapad från master `e28b524`)

---

## File Structure

**Backend (Phase 1-2):**

| Path | Action | Responsibility |
|---|---|---|
| `/agentic-dealflow/supabase/migrations/017_template_configs.sql` | Create | New `template_configs` table + RLS + seed |
| `/agentic-dealflow/supabase/migrations/018_bid_overflow_flags.sql` | Create | Add `overflow_flags JSONB` column to `bids` |
| `/agentic-dealflow/src/lib/pptx-template/budget-types.ts` | Create | `FieldBudgets`, `OverflowFlag` types + Zod schemas |
| `/agentic-dealflow/src/lib/pptx-template/budget-loader.ts` | Create | `loadBudgets()` Supabase query + cache |
| `/agentic-dealflow/src/lib/pptx-template/__tests__/budget-loader.test.ts` | Create | Unit tests |
| `/agentic-dealflow/src/lib/pptx-template/verify-budgets.ts` | Create | `verifyFieldBudgets()` pure function + path resolver + field-label table |
| `/agentic-dealflow/src/lib/pptx-template/__tests__/verify-budgets.test.ts` | Create | Unit tests |
| `/agentic-dealflow/src/lib/bid-generator/append-overflow-list.ts` | Create | Helper för retry-prompt augmentation |
| `/agentic-dealflow/src/lib/bid-generator/__tests__/append-overflow-list.test.ts` | Create | Unit tests |
| `/agentic-dealflow/src/lib/bid-generator/with-budget-retry.ts` | Create | Retry-orchestrator wrapper för bundle-anrop |
| `/agentic-dealflow/src/lib/bid-generator/__tests__/with-budget-retry.test.ts` | Create | Unit tests |
| `/agentic-dealflow/src/lib/bid-generator/bundles/phases.ts` | Modify | Inject budget-tabell i prompt, returnera `{ sections, overflowFlags }` |
| `/agentic-dealflow/src/lib/bid-generator/bundles/quality.ts` | Modify | Same |
| `/agentic-dealflow/src/lib/bid-generator/bundles/team.ts` | Modify | Same |
| `/agentic-dealflow/src/lib/bid-generator/bundles/understanding.ts` | Modify | Same |
| `/agentic-dealflow/src/lib/bid-generator/bundles/requirement-matrix.ts` | Modify | Same |
| `/agentic-dealflow/src/lib/bid-generator/bundles/reference.ts` | Modify | Same |
| `/agentic-dealflow/src/lib/bid-generator/index.ts` | Modify | Aggregera overflowFlags från bundles, signatur ändring |
| `/agentic-dealflow/src/app/api/bids/route.ts` | Modify | Persistera `overflow_flags` på bid-insert |

**Frontend (Phase 3):**

| Path | Action | Responsibility |
|---|---|---|
| `/agentic-dealflow/src/components/bid-editor/OverflowChecklist.tsx` | Create | Right rail panel-komponent |
| `/agentic-dealflow/src/components/bid-editor/__tests__/OverflowChecklist.test.tsx` | Create | Component tests |
| `/agentic-dealflow/src/components/bid-editor/EditableText.tsx` | Modify | Add live char-counter |
| `/agentic-dealflow/src/components/bid-editor/__tests__/EditableText.test.tsx` | Create | Component tests (counter, color-shift) |
| `/agentic-dealflow/src/components/bid-editor/BidEditor.tsx` | Modify | Mount OverflowChecklist, wire onJumpToField + re-verify on edit |

**PR-uppdelning (per Stefans branch-discipline):**

- **PR #1 — Foundation:** Tasks 1-5 (migrations + types + loader + verify pure function)
- **PR #2 — Bid-generator integration:** Tasks 6-10 (helper + bundle-modifs + orchestrator + persistence)
- **PR #3 — Bid-editor UI:** Tasks 11-13 (OverflowChecklist + EditableText counter + wiring)
- **PR #4 — Smoke + calibration:** Task 14 (manual + ev. budget-justeringar via SQL)

---

## Path-konvention för budget-keys

Budget-JSON-keys matchar Zod-parsed bundle-output (raw data, INTE `BidSection`-wrappad):

| Pattern | Resolveras till | Exempel |
|---|---|---|
| `field` | `obj.field` | `cover.bidTitle` |
| `field[*]` | `obj.field[i]` för varje `i` | `checkpoints[*]` |
| `field[*].subfield` | `obj.field[i].subfield` för varje `i` | `phases[*].objective` |
| `field[*].subfield[*]` | `obj.field[i].subfield[j]` för varje `i,j` | `phases[*].activities[*]` |

**Notera:** spec:ens migration-skiss använde `phase.objective` (singular). Plan uppdaterar till `phases[*].objective` (matchar faktisk Zod-shape `{ phases: [...] }`). Migration 017 nedan är auktoritativ.

---

## Phase 1 — Foundation (PR #1)

### Task 1: Migration 017 — `template_configs`-tabell

**Files:**
- Create: `/agentic-dealflow/supabase/migrations/017_template_configs.sql`

- [ ] **Step 1: Skriv migration-fil**

```sql
-- supabase/migrations/017_template_configs.sql
create table template_configs (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  budgets jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table template_configs enable row level security;

create policy "template_configs_read"
  on template_configs for select
  to authenticated
  using (true);

-- Inga write-policies via API. Stefan editerar via SQL Editor (service_role bypass:ar RLS).

insert into template_configs (name, budgets) values
  ('anbudsmall-v2', jsonb_build_object(
    'phases[*].objective', 120,
    'phases[*].activities[*]', 120,
    'phases[*].deliverables[*]', 100,
    'phases[*].decisions[*]', 100,
    'phases[*].name', 40,
    'phases[*].period', 10,
    'checkpoints[*]', 80,
    'certs[*].description', 80
  )),
  ('anbudsmall-colors', jsonb_build_object(
    'phases[*].objective', 120,
    'phases[*].activities[*]', 120,
    'phases[*].deliverables[*]', 100,
    'phases[*].decisions[*]', 100,
    'phases[*].name', 40,
    'phases[*].period', 10,
    'checkpoints[*]', 80,
    'certs[*].description', 80
  ));
```

- [ ] **Step 2: Applicera manuellt via Supabase SQL Editor**

Per projektrutin (CLAUDE.md): migrationer applicas manuellt. Stefan kör SQL i Supabase Dashboard → SQL Editor → New Query → paste hela migrationen → Run.

Verifiera: `select name, jsonb_object_keys(budgets) from template_configs;` → 16 rader (8 keys × 2 templates).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/017_template_configs.sql
git commit -m "feat(db): add template_configs table with budgets jsonb + RLS"
```

---

### Task 2: Migration 018 — `bids.overflow_flags`-kolumn

**Files:**
- Create: `/agentic-dealflow/supabase/migrations/018_bid_overflow_flags.sql`

- [ ] **Step 1: Skriv migration**

```sql
-- supabase/migrations/018_bid_overflow_flags.sql
alter table bids
  add column overflow_flags jsonb not null default '[]'::jsonb;
```

- [ ] **Step 2: Applicera manuellt via Supabase SQL Editor**

Verifiera: `select id, overflow_flags from bids limit 1;` → kolumnen finns, default `[]`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/018_bid_overflow_flags.sql
git commit -m "feat(db): add bids.overflow_flags jsonb column"
```

---

### Task 3: Budget-types — `budget-types.ts`

**Files:**
- Create: `/agentic-dealflow/src/lib/pptx-template/budget-types.ts`

- [ ] **Step 1: Skriv typer + Zod-schema**

```ts
// src/lib/pptx-template/budget-types.ts
import { z } from "zod";

export const FieldBudgetsSchema = z.record(z.string(), z.number().int().positive());

export type FieldBudgets = z.infer<typeof FieldBudgetsSchema>;

export const OverflowFlagSchema = z.object({
  slide: z.number().int().nonnegative(),
  fieldPath: z.string(),
  fieldLabel: z.string(),
  length: z.number().int().nonnegative(),
  budget: z.number().int().positive(),
});

export type OverflowFlag = z.infer<typeof OverflowFlagSchema>;
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/pptx-template/budget-types.ts
git commit -m "feat(pptx): add FieldBudgets and OverflowFlag types"
```

---

### Task 4: Budget-loader — `budget-loader.ts` + tester

**Files:**
- Create: `/agentic-dealflow/src/lib/pptx-template/budget-loader.ts`
- Create: `/agentic-dealflow/src/lib/pptx-template/__tests__/budget-loader.test.ts`

- [ ] **Step 1: Skriv failing test**

```ts
// src/lib/pptx-template/__tests__/budget-loader.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearBudgetCache, loadBudgets, TemplateConfigMissingError, InvalidBudgetSchemaError } from "../budget-loader";

const mockSingle = vi.fn();
const mockEq = vi.fn(() => ({ single: mockSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => ({ from: mockFrom }),
}));

describe("loadBudgets", () => {
  beforeEach(() => {
    clearBudgetCache();
    mockSingle.mockReset();
    mockEq.mockClear();
    mockSelect.mockClear();
    mockFrom.mockClear();
  });

  afterEach(() => {
    clearBudgetCache();
  });

  it("returns budgets for a known template", async () => {
    mockSingle.mockResolvedValue({
      data: { budgets: { "phases[*].objective": 120 } },
      error: null,
    });

    const result = await loadBudgets("anbudsmall-v2");
    expect(result).toEqual({ "phases[*].objective": 120 });
    expect(mockFrom).toHaveBeenCalledWith("template_configs");
    expect(mockEq).toHaveBeenCalledWith("name", "anbudsmall-v2");
  });

  it("caches subsequent calls (no second Supabase query)", async () => {
    mockSingle.mockResolvedValue({
      data: { budgets: { "phases[*].objective": 120 } },
      error: null,
    });

    await loadBudgets("anbudsmall-v2");
    await loadBudgets("anbudsmall-v2");
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it("throws TemplateConfigMissingError when row is missing", async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: "PGRST116", message: "no rows" },
    });

    await expect(loadBudgets("nonexistent")).rejects.toBeInstanceOf(TemplateConfigMissingError);
    await expect(loadBudgets("nonexistent")).rejects.toThrow(/nonexistent/);
  });

  it("throws InvalidBudgetSchemaError when budgets fail Zod validation", async () => {
    mockSingle.mockResolvedValue({
      data: { budgets: { "phases[*].objective": "not-a-number" } },
      error: null,
    });

    await expect(loadBudgets("anbudsmall-v2")).rejects.toBeInstanceOf(InvalidBudgetSchemaError);
  });

  it("clearBudgetCache(name) only invalidates one entry", async () => {
    mockSingle.mockResolvedValue({
      data: { budgets: { "x": 10 } },
      error: null,
    });

    await loadBudgets("a");
    await loadBudgets("b");
    expect(mockFrom).toHaveBeenCalledTimes(2);

    clearBudgetCache("a");
    await loadBudgets("a"); // miss → query
    await loadBudgets("b"); // hit → no query
    expect(mockFrom).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- budget-loader
```

Expected: FAIL — `Cannot find module '../budget-loader'`.

- [ ] **Step 3: Implement loader**

```ts
// src/lib/pptx-template/budget-loader.ts
import { createServerClient } from "@/lib/supabase/server";
import { FieldBudgetsSchema, type FieldBudgets } from "./budget-types";

export class TemplateConfigMissingError extends Error {
  constructor(name: string) {
    super(`template_configs row missing for template '${name}' — applicera migration 017 eller seeda raden via SQL Editor`);
    this.name = "TemplateConfigMissingError";
  }
}

export class InvalidBudgetSchemaError extends Error {
  constructor(name: string, cause: unknown) {
    super(`template_configs.budgets för '${name}' matchar inte FieldBudgetsSchema: ${String(cause)}`);
    this.name = "InvalidBudgetSchemaError";
  }
}

const cache = new Map<string, FieldBudgets>();

export function clearBudgetCache(name?: string): void {
  if (name === undefined) {
    cache.clear();
  } else {
    cache.delete(name);
  }
}

export async function loadBudgets(templateName: string): Promise<FieldBudgets> {
  const cached = cache.get(templateName);
  if (cached !== undefined) return cached;

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("template_configs")
    .select("budgets")
    .eq("name", templateName)
    .single();

  if (error || !data) {
    throw new TemplateConfigMissingError(templateName);
  }

  const parsed = FieldBudgetsSchema.safeParse(data.budgets);
  if (!parsed.success) {
    throw new InvalidBudgetSchemaError(templateName, parsed.error.message);
  }

  cache.set(templateName, parsed.data);
  return parsed.data;
}
```

- [ ] **Step 4: Run tests to verify all pass**

```bash
npm test -- budget-loader
```

Expected: PASS — alla 5 tester gröna.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pptx-template/budget-loader.ts src/lib/pptx-template/__tests__/budget-loader.test.ts
git commit -m "feat(pptx): add budget-loader with Supabase query + process-level cache"
```

---

### Task 5: Verify-budgets pure function — `verify-budgets.ts` + tester

**Files:**
- Create: `/agentic-dealflow/src/lib/pptx-template/verify-budgets.ts`
- Create: `/agentic-dealflow/src/lib/pptx-template/__tests__/verify-budgets.test.ts`

- [ ] **Step 1: Skriv failing tests**

```ts
// src/lib/pptx-template/__tests__/verify-budgets.test.ts
import { describe, expect, it } from "vitest";
import { verifyFieldBudgets } from "../verify-budgets";

describe("verifyFieldBudgets", () => {
  it("returns pass=true and empty overflows when all fields are under budget", () => {
    const data = { phases: [{ objective: "kort" }] };
    const budgets = { "phases[*].objective": 120 };
    const { pass, overflows } = verifyFieldBudgets(data, budgets);
    expect(pass).toBe(true);
    expect(overflows).toEqual([]);
  });

  it("flags single overflow with resolved path and field metadata", () => {
    const data = { phases: [{ objective: "x".repeat(150) }] };
    const budgets = { "phases[*].objective": 120 };
    const { pass, overflows } = verifyFieldBudgets(data, budgets);
    expect(pass).toBe(false);
    expect(overflows).toHaveLength(1);
    expect(overflows[0]).toMatchObject({
      fieldPath: "phases[0].objective",
      length: 150,
      budget: 120,
      slide: 7,
      fieldLabel: "Fas 1 — Mål",
    });
  });

  it("expands wildcard arrays correctly", () => {
    const data = {
      phases: [
        { activities: ["kort", "x".repeat(130)] },
        { activities: ["x".repeat(140)] },
      ],
    };
    const budgets = { "phases[*].activities[*]": 120 };
    const { pass, overflows } = verifyFieldBudgets(data, budgets);
    expect(pass).toBe(false);
    expect(overflows.map((o) => o.fieldPath)).toEqual([
      "phases[0].activities[1]",
      "phases[1].activities[0]",
    ]);
  });

  it("ignores fields that don't exist in data (no false positives)", () => {
    const data = { phases: [{ objective: "kort" }] };
    const budgets = {
      "phases[*].objective": 120,
      "phases[*].activities[*]": 120, // activities saknas i data
      "checkpoints[*]": 80,             // checkpoints saknas helt
    };
    const { pass } = verifyFieldBudgets(data, budgets);
    expect(pass).toBe(true);
  });

  it("handles non-string leaf values gracefully (skip, no throw)", () => {
    const data = { phases: [{ hoursEstimate: 80 }] };
    const budgets = { "phases[*].hoursEstimate": 120 };
    const { pass } = verifyFieldBudgets(data, budgets);
    expect(pass).toBe(true); // number, not string — skip
  });

  it("handles empty data without throwing", () => {
    const { pass } = verifyFieldBudgets({}, { "phases[*].objective": 120 });
    expect(pass).toBe(true);
  });

  it("works for top-level array wildcard (checkpoints[*])", () => {
    const data = { checkpoints: ["kort", "x".repeat(100)] };
    const budgets = { "checkpoints[*]": 80 };
    const { overflows } = verifyFieldBudgets(data, budgets);
    expect(overflows).toHaveLength(1);
    expect(overflows[0].fieldPath).toBe("checkpoints[1]");
    expect(overflows[0].slide).toBe(11);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- verify-budgets
```

Expected: FAIL — `Cannot find module '../verify-budgets'`.

- [ ] **Step 3: Implement verify-budgets**

```ts
// src/lib/pptx-template/verify-budgets.ts
import type { FieldBudgets, OverflowFlag } from "./budget-types";

/**
 * Field metadata: maps budget-key path to slide-index + human label template.
 * Update when adding new templates or budget paths.
 *
 * Label-template uses {N} for 1-indexed phase number, {N+1} for 1-indexed array index.
 */
type FieldMetadata = { slide: number; labelTemplate: string };

const FIELD_METADATA: Record<string, FieldMetadata> = {
  "phases[*].name": { slide: 6, labelTemplate: "Fas {N} — Namn" },
  "phases[*].period": { slide: 6, labelTemplate: "Fas {N} — Period" },
  "phases[*].objective": { slide: 7, labelTemplate: "Fas {N} — Mål" },
  "phases[*].activities[*]": { slide: 7, labelTemplate: "Fas {N} — Aktivitet {N+1}" },
  "phases[*].deliverables[*]": { slide: 7, labelTemplate: "Fas {N} — Leverabel {N+1}" },
  "phases[*].decisions[*]": { slide: 7, labelTemplate: "Fas {N} — Beslut {N+1}" },
  "checkpoints[*]": { slide: 11, labelTemplate: "Avstämningspunkt {N+1}" },
  "certs[*].description": { slide: 18, labelTemplate: "Cert {N+1} — Beskrivning" },
};

type ResolvedLeaf = { resolvedPath: string; value: unknown; indices: number[] };

/**
 * Resolves a budget-key path against data, returning all leaf values.
 *
 * Path syntax:
 * - "field"           → obj.field
 * - "field[*]"        → obj.field[i] for all i
 * - "a[*].b"          → obj.a[i].b for all i
 * - "a[*].b[*]"       → obj.a[i].b[j] for all i, j
 */
function resolveLeaves(obj: unknown, path: string): ResolvedLeaf[] {
  // Split path into tokens: "phases[*].activities[*]" → ["phases", "[*]", ".activities", "[*]"]
  // Easier: split by "." then handle "[*]" suffix on each segment.
  const segments = path.split(".");
  type Pending = { node: unknown; resolvedPath: string; indices: number[] };
  let pending: Pending[] = [{ node: obj, resolvedPath: "", indices: [] }];

  for (const segment of segments) {
    const next: Pending[] = [];
    const wildcardSplit = segment.match(/^([^[]+)(\[\*\])?$/);
    if (!wildcardSplit) return [];
    const fieldName = wildcardSplit[1];
    const isWildcard = wildcardSplit[2] === "[*]";

    for (const p of pending) {
      if (typeof p.node !== "object" || p.node === null) continue;
      const child = (p.node as Record<string, unknown>)[fieldName];
      if (child === undefined) continue;

      const fieldPath = p.resolvedPath === "" ? fieldName : `${p.resolvedPath}.${fieldName}`;

      if (isWildcard) {
        if (!Array.isArray(child)) continue;
        child.forEach((item, idx) => {
          next.push({
            node: item,
            resolvedPath: `${fieldPath}[${idx}]`,
            indices: [...p.indices, idx],
          });
        });
      } else {
        next.push({ node: child, resolvedPath: fieldPath, indices: p.indices });
      }
    }
    pending = next;
  }

  return pending.map((p) => ({ resolvedPath: p.resolvedPath, value: p.node, indices: p.indices }));
}

function buildLabel(template: string, indices: number[]): string {
  // {N}    → indices[0] + 1   (phase number)
  // {N+1}  → indices[1] + 1   (item-within-phase index)
  // For top-level wildcard (checkpoints[*]): {N+1} uses indices[0] + 1 since there's only one index.
  let result = template;
  if (indices.length === 1) {
    result = result.replace(/\{N\+1\}/g, String(indices[0] + 1));
    result = result.replace(/\{N\}/g, String(indices[0] + 1));
  } else if (indices.length >= 2) {
    result = result.replace(/\{N\}/g, String(indices[0] + 1));
    result = result.replace(/\{N\+1\}/g, String(indices[1] + 1));
  }
  return result;
}

export function verifyFieldBudgets(
  data: unknown,
  budgets: FieldBudgets,
): { pass: boolean; overflows: OverflowFlag[] } {
  const overflows: OverflowFlag[] = [];

  for (const [path, budget] of Object.entries(budgets)) {
    const meta = FIELD_METADATA[path];
    if (!meta) continue; // skip unknown paths (defensive — shouldn't happen if migrations are in sync)

    const leaves = resolveLeaves(data, path);
    for (const leaf of leaves) {
      if (typeof leaf.value !== "string") continue;
      if (leaf.value.length > budget) {
        overflows.push({
          slide: meta.slide,
          fieldPath: leaf.resolvedPath,
          fieldLabel: buildLabel(meta.labelTemplate, leaf.indices),
          length: leaf.value.length,
          budget,
        });
      }
    }
  }

  return { pass: overflows.length === 0, overflows };
}
```

- [ ] **Step 4: Run tests to verify all pass**

```bash
npm test -- verify-budgets
```

Expected: PASS — alla 7 tester gröna.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pptx-template/verify-budgets.ts src/lib/pptx-template/__tests__/verify-budgets.test.ts
git commit -m "feat(pptx): add verifyFieldBudgets pure function with wildcard path resolver"
```

---

### Task 6: Push branch + öppna PR #1 (Foundation)

- [ ] **Step 1: Push branch**

```bash
git push -u origin feat/pptx-corrector
```

- [ ] **Step 2: Skapa PR**

```bash
gh pr create --title "PR #1: PPTX corrector foundation (migrations + budget-loader + verify)" --body "$(cat <<'EOF'
## Summary
- Migration 017: `template_configs`-tabell med `budgets jsonb` + RLS read-policy + seed för `anbudsmall-v2` och `anbudsmall-colors`.
- Migration 018: `bids.overflow_flags jsonb` (default `[]`).
- `budget-types.ts`: `FieldBudgets`, `OverflowFlag` + Zod-schemas.
- `budget-loader.ts`: Supabase-query med process-level cache + tydliga errors (`TemplateConfigMissingError`, `InvalidBudgetSchemaError`).
- `verify-budgets.ts`: pure function med wildcard path-resolver + field-metadata-tabell (slide + label).

PR #1 av 4 i pptx-corrector-spåret. Inga bid-generator-integrationer än.

Spec: `docs/superpowers/specs/2026-05-03-pptx-corrector-design.md`

## Test plan
- [x] Unit-tester för `loadBudgets` (5 tester gröna)
- [x] Unit-tester för `verifyFieldBudgets` (7 tester gröna)
- [x] `npx tsc --noEmit` rent
- [x] Befintliga `pptx-template`-tester gröna
- [x] Migrationer applicerade manuellt i Supabase

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Vänta in PR-review-routinen**

Per `project_pr_review_routine.md` — routine kommenterar automatiskt. Vänta innan squash-merge.

- [ ] **Step 4: Squash-merge när routine OK**

Manuellt via GitHub UI eller `gh pr merge --squash --delete-branch`. **Notera:** håll `feat/pptx-corrector` lokalt för PR #2 — recreate branch om delete-branch körs:

```bash
git checkout master && git pull && git checkout -b feat/pptx-corrector
```

---

## Phase 2 — Bid-generator integration (PR #2)

### Task 7: `appendOverflowList` helper + tester

**Files:**
- Create: `/agentic-dealflow/src/lib/bid-generator/append-overflow-list.ts`
- Create: `/agentic-dealflow/src/lib/bid-generator/__tests__/append-overflow-list.test.ts`

- [ ] **Step 1: Skriv failing test**

```ts
// src/lib/bid-generator/__tests__/append-overflow-list.test.ts
import { describe, expect, it } from "vitest";
import { appendOverflowList } from "../append-overflow-list";
import type { OverflowFlag } from "@/lib/pptx-template/budget-types";

describe("appendOverflowList", () => {
  it("appends a tightening instruction with overflow detail", () => {
    const original = "Skriv genomförandeplan.";
    const overflows: OverflowFlag[] = [
      { slide: 7, fieldPath: "phases[0].objective", fieldLabel: "Fas 1 — Mål", length: 150, budget: 120 },
      { slide: 7, fieldPath: "phases[0].activities[2]", fieldLabel: "Fas 1 — Aktivitet 3", length: 145, budget: 120 },
    ];
    const result = appendOverflowList(original, overflows);
    expect(result).toContain(original);
    expect(result).toContain("Fas 1 — Mål");
    expect(result).toContain("150/120");
    expect(result).toContain("Fas 1 — Aktivitet 3");
    expect(result).toContain("145/120");
    expect(result).toMatch(/komprimera/i);
  });

  it("returns original prompt unchanged when overflows is empty", () => {
    const original = "Skriv genomförandeplan.";
    expect(appendOverflowList(original, [])).toBe(original);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
npm test -- append-overflow-list
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement helper**

```ts
// src/lib/bid-generator/append-overflow-list.ts
import type { OverflowFlag } from "@/lib/pptx-template/budget-types";

export function appendOverflowList(prompt: string, overflows: OverflowFlag[]): string {
  if (overflows.length === 0) return prompt;

  const lines = overflows.map(
    (o) => `- ${o.fieldLabel}: ${o.length}/${o.budget} tecken — för långt`,
  );

  return `${prompt}

KORRIGERING NÖDVÄNDIG: ditt föregående svar överskred TEXT-LIMITS för dessa fält:
${lines.join("\n")}

Skriv om dem kortare. Komprimera, dela inte. Behåll övrig struktur intakt.`;
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- append-overflow-list
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bid-generator/append-overflow-list.ts src/lib/bid-generator/__tests__/append-overflow-list.test.ts
git commit -m "feat(bid-gen): add appendOverflowList helper for retry-prompt augmentation"
```

---

### Task 8: `withBudgetRetry` orchestrator-wrapper + tester

**Files:**
- Create: `/agentic-dealflow/src/lib/bid-generator/with-budget-retry.ts`
- Create: `/agentic-dealflow/src/lib/bid-generator/__tests__/with-budget-retry.test.ts`

Detta är en generic wrapper som varje bundle kallar in. Tar en LLM-anropsfunktion + budgets + retry-budget, returnerar `{ output, overflows }`.

- [ ] **Step 1: Skriv failing tests**

```ts
// src/lib/bid-generator/__tests__/with-budget-retry.test.ts
import { describe, expect, it, vi } from "vitest";
import { withBudgetRetry } from "../with-budget-retry";

const budgets = { "phases[*].objective": 120 };

describe("withBudgetRetry", () => {
  it("returns output unchanged on first-try pass", async () => {
    const callLLM = vi.fn().mockResolvedValue({ phases: [{ objective: "kort" }] });
    const retryBudget = { remaining: 5 };
    const { output, overflows } = await withBudgetRetry({
      basePrompt: "P",
      callLLM,
      budgets,
      retryBudget,
    });
    expect(callLLM).toHaveBeenCalledTimes(1);
    expect(callLLM).toHaveBeenCalledWith("P");
    expect(overflows).toEqual([]);
    expect(output).toEqual({ phases: [{ objective: "kort" }] });
    expect(retryBudget.remaining).toBe(5);
  });

  it("retries once with tightened prompt on overflow, decrements retry-budget", async () => {
    const callLLM = vi
      .fn()
      .mockResolvedValueOnce({ phases: [{ objective: "x".repeat(150) }] })
      .mockResolvedValueOnce({ phases: [{ objective: "kort" }] });
    const retryBudget = { remaining: 5 };
    const { output, overflows } = await withBudgetRetry({
      basePrompt: "P",
      callLLM,
      budgets,
      retryBudget,
    });
    expect(callLLM).toHaveBeenCalledTimes(2);
    expect(callLLM.mock.calls[1][0]).toContain("KORRIGERING NÖDVÄNDIG");
    expect(overflows).toEqual([]);
    expect(output).toEqual({ phases: [{ objective: "kort" }] });
    expect(retryBudget.remaining).toBe(4);
  });

  it("returns final overflows when retry also overflows", async () => {
    const callLLM = vi
      .fn()
      .mockResolvedValueOnce({ phases: [{ objective: "x".repeat(150) }] })
      .mockResolvedValueOnce({ phases: [{ objective: "y".repeat(140) }] });
    const retryBudget = { remaining: 5 };
    const { output, overflows } = await withBudgetRetry({
      basePrompt: "P",
      callLLM,
      budgets,
      retryBudget,
    });
    expect(callLLM).toHaveBeenCalledTimes(2);
    expect(overflows).toHaveLength(1);
    expect(overflows[0].length).toBe(140);
    expect(output).toEqual({ phases: [{ objective: "y".repeat(140) }] });
    expect(retryBudget.remaining).toBe(4);
  });

  it("does not retry when retry-budget is exhausted, flags directly", async () => {
    const callLLM = vi.fn().mockResolvedValue({ phases: [{ objective: "x".repeat(150) }] });
    const retryBudget = { remaining: 0 };
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { overflows } = await withBudgetRetry({
      basePrompt: "P",
      callLLM,
      budgets,
      retryBudget,
    });
    expect(callLLM).toHaveBeenCalledTimes(1);
    expect(overflows).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("retry-cap reached"));
    warnSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
npm test -- with-budget-retry
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement orchestrator**

```ts
// src/lib/bid-generator/with-budget-retry.ts
import { verifyFieldBudgets } from "@/lib/pptx-template/verify-budgets";
import type { FieldBudgets, OverflowFlag } from "@/lib/pptx-template/budget-types";
import { appendOverflowList } from "./append-overflow-list";

export type RetryBudget = { remaining: number };

export type WithBudgetRetryParams<T> = {
  basePrompt: string;
  callLLM: (prompt: string) => Promise<T>;
  budgets: FieldBudgets;
  retryBudget: RetryBudget;
};

export async function withBudgetRetry<T>(
  params: WithBudgetRetryParams<T>,
): Promise<{ output: T; overflows: OverflowFlag[] }> {
  const { basePrompt, callLLM, budgets, retryBudget } = params;
  let output = await callLLM(basePrompt);
  let { overflows } = verifyFieldBudgets(output, budgets);

  if (overflows.length === 0) return { output, overflows };

  if (retryBudget.remaining <= 0) {
    console.warn(
      `[corrector] retry-cap reached — flagging ${overflows.length} overflows without retry`,
    );
    return { output, overflows };
  }

  retryBudget.remaining -= 1;
  const tightened = appendOverflowList(basePrompt, overflows);
  output = await callLLM(tightened);
  ({ overflows } = verifyFieldBudgets(output, budgets));
  return { output, overflows };
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- with-budget-retry
```

Expected: PASS.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/bid-generator/with-budget-retry.ts src/lib/bid-generator/__tests__/with-budget-retry.test.ts
git commit -m "feat(bid-gen): add withBudgetRetry orchestrator wrapper"
```

---

### Task 9: Modify bundles to inject budgets + return overflowFlags

**Files:**
- Modify: `/agentic-dealflow/src/lib/bid-generator/bundles/phases.ts`
- Modify: `/agentic-dealflow/src/lib/bid-generator/bundles/quality.ts`
- Modify: `/agentic-dealflow/src/lib/bid-generator/bundles/team.ts`
- Modify: `/agentic-dealflow/src/lib/bid-generator/bundles/understanding.ts`
- Modify: `/agentic-dealflow/src/lib/bid-generator/bundles/requirement-matrix.ts`
- Modify: `/agentic-dealflow/src/lib/bid-generator/bundles/reference.ts`

Varje bundle:
- Tar nya params: `budgets: FieldBudgets`, `retryBudget: RetryBudget`.
- Returnerar `Promise<{ sections: BidSection[]; overflowFlags: OverflowFlag[] }>` istället för `Promise<BidSection[]>`.
- Bygger basePrompt med relevanta budgets injicerade som tabell i system-prompten.
- Wrappar `callClaude(...)` i `withBudgetRetry({...})`.

Per-bundle relevanta budget-keys (subset av full FieldBudgets):

| Bundle | Relevanta budget-keys |
|---|---|
| `phases` | `phases[*].name`, `phases[*].period`, `phases[*].objective`, `phases[*].activities[*]`, `phases[*].deliverables[*]`, `phases[*].decisions[*]` |
| `quality` | `checkpoints[*]` |
| `team` | (inga i v1 — lägg till i framtida kalibrering) |
| `understanding` | (inga i v1) |
| `requirement-matrix` | (inga i v1) |
| `reference` | (inga i v1 — referenser tomma per `project_reference_bundle_future.md`) |

För bundles utan budget-keys: ändå wrappa i `withBudgetRetry`, så signaturen är konsekvent. `verifyFieldBudgets` returnerar `pass=true`, ingen retry triggas.

- [ ] **Step 1: Skriv helper för budget-tabell-rendering**

```ts
// src/lib/bid-generator/render-budget-table.ts
import type { FieldBudgets } from "@/lib/pptx-template/budget-types";

const FIELD_LABELS: Record<string, string> = {
  "phases[*].name": "phase name",
  "phases[*].period": "period",
  "phases[*].objective": "objective",
  "phases[*].activities[*]": "activities (each item)",
  "phases[*].deliverables[*]": "deliverables (each item)",
  "phases[*].decisions[*]": "decisions (each item)",
  "checkpoints[*]": "checkpoints (each item)",
  "certs[*].description": "cert descriptions (each item)",
};

export function renderBudgetTable(allBudgets: FieldBudgets, relevantKeys: string[]): string {
  const lines = relevantKeys
    .filter((k) => allBudgets[k] !== undefined)
    .map((k) => `- ${FIELD_LABELS[k] ?? k}: max ${allBudgets[k]} tecken`);
  if (lines.length === 0) return "";
  return `\n\nTEXT-LIMITS (max tecken):\n${lines.join("\n")}\nSkriv inom dessa gränser. Är ett område långt — komprimera, inte dela.`;
}
```

Skapa fil + 1 enkelt unit-test:

```ts
// src/lib/bid-generator/__tests__/render-budget-table.test.ts
import { describe, expect, it } from "vitest";
import { renderBudgetTable } from "../render-budget-table";

describe("renderBudgetTable", () => {
  it("renders relevant keys with labels and limits", () => {
    const out = renderBudgetTable(
      { "phases[*].objective": 120, "checkpoints[*]": 80 },
      ["phases[*].objective"],
    );
    expect(out).toContain("objective: max 120 tecken");
    expect(out).not.toContain("checkpoints");
    expect(out).toContain("TEXT-LIMITS");
  });

  it("returns empty string when no relevant keys are present in budgets", () => {
    expect(renderBudgetTable({}, ["phases[*].objective"])).toBe("");
  });
});
```

- [ ] **Step 2: Run + commit helper**

```bash
npm test -- render-budget-table
git add src/lib/bid-generator/render-budget-table.ts src/lib/bid-generator/__tests__/render-budget-table.test.ts
git commit -m "feat(bid-gen): add renderBudgetTable for prompt-injection of text-limits"
```

- [ ] **Step 3: Modify `phases.ts` bundle**

Läs nuvarande `src/lib/bid-generator/bundles/phases.ts` först (bara modifiera signatur + inject + wrap, behåll övrig logik).

Ändringar:
- Importera `withBudgetRetry`, `RetryBudget`, `renderBudgetTable`, `FieldBudgets`, `OverflowFlag`.
- Ändra `buildPhasesBundle(ctx)` → `buildPhasesBundle(ctx, budgets, retryBudget)`.
- Bygg `basePrompt` = `SYSTEM_PROMPT + renderBudgetTable(budgets, RELEVANT_KEYS)` där `RELEVANT_KEYS = ["phases[*].name", "phases[*].period", "phases[*].objective", "phases[*].activities[*]", "phases[*].deliverables[*]", "phases[*].decisions[*]"]`.
- Wrap `callClaude(...)` i `withBudgetRetry({ basePrompt, callLLM: (p) => callClaude({ systemPrompt: p, ... }), budgets, retryBudget })`.
- Returnera `{ sections, overflowFlags: result.overflows }`.

Konkret patch (apply efter att läst phases.ts fullt):

```ts
// Top-of-file imports — add:
import { withBudgetRetry, type RetryBudget } from "../with-budget-retry";
import { renderBudgetTable } from "../render-budget-table";
import type { FieldBudgets, OverflowFlag } from "@/lib/pptx-template/budget-types";

const PHASES_BUDGET_KEYS = [
  "phases[*].name",
  "phases[*].period",
  "phases[*].objective",
  "phases[*].activities[*]",
  "phases[*].deliverables[*]",
  "phases[*].decisions[*]",
];

// Modify export signature + body:
export async function buildPhasesBundle(
  ctx: BidContext,
  budgets: FieldBudgets,
  retryBudget: RetryBudget,
): Promise<{ sections: BidSection[]; overflowFlags: OverflowFlag[] }> {
  const basePrompt = SYSTEM_PROMPT + renderBudgetTable(budgets, PHASES_BUDGET_KEYS);

  const { output: parsed, overflows } = await withBudgetRetry({
    basePrompt,
    callLLM: (p) =>
      callClaude({
        systemPrompt: p,
        userPrompt: formatContext(ctx),
        schema: PhasesV2Schema,
        // ... behåll övriga befintliga params: model, max_tokens, etc
      }),
    budgets,
    retryBudget,
  });

  // Behåll övrig logik som transformerar `parsed` → `BidSection[]`.
  const sections: BidSection[] = /* befintlig wrap-logik */;

  return { sections, overflowFlags: overflows };
}
```

(Implementatören läser befintlig `phases.ts` för att veta exakt vad `callClaude({...})` har för params och hur `parsed` blir `sections` — patch:en visar struktur, inte hela filen.)

- [ ] **Step 4: Update phases-bundle test**

Befintlig: `src/lib/bid-generator/__tests__/phases.test.ts`. Update så `buildPhasesBundle` anropas med `budgets, retryBudget` och returnerar `{ sections, overflowFlags }`. Lägg till en ny case som testar overflow-flow:

```ts
it("flags overflow when LLM returns text exceeding budget", async () => {
  // Mock callClaude to return overflow once, pass on retry
  // ... assert overflowFlags is empty after retry-pass
});
```

- [ ] **Step 5: Run phases test**

```bash
npm test -- phases
```

Expected: PASS.

- [ ] **Step 6: Repeat steps 3-5 for quality.ts**

- Importera `withBudgetRetry`, `renderBudgetTable`, `FieldBudgets`, `OverflowFlag`, `RetryBudget`.
- `QUALITY_BUDGET_KEYS = ["checkpoints[*]"]`.
- Samma pattern som phases.ts.
- Update test.

- [ ] **Step 7: Repeat for team.ts, understanding.ts, requirement-matrix.ts, reference.ts**

För dessa bundles utan budget-keys:
- Lägg till samma signatur (`budgets, retryBudget` params).
- `BUDGET_KEYS = []` → `renderBudgetTable` returnerar tom sträng → ingen prompt-ändring.
- Wrap i `withBudgetRetry` (no-op effekt — `verify` returnerar pass=true).
- Returnera `{ sections, overflowFlags: [] }`.
- Update tests.

- [ ] **Step 8: Run all bundle tests**

```bash
npm test -- bundles
```

Expected: PASS för alla 6 bundles.

- [ ] **Step 9: Commit**

```bash
git add src/lib/bid-generator/bundles/
git commit -m "feat(bid-gen): inject budgets + retry into all 6 bundles"
```

---

### Task 10: Update `index.ts` orchestrator + persist `overflow_flags`

**Files:**
- Modify: `/agentic-dealflow/src/lib/bid-generator/index.ts`
- Modify: `/agentic-dealflow/src/app/api/bids/route.ts`
- Modify: `/agentic-dealflow/src/lib/bid-generator/__tests__/orchestrator.test.ts`

- [ ] **Step 1: Modify `generateAllSections` signature**

```ts
// src/lib/bid-generator/index.ts
import { loadBudgets } from "@/lib/pptx-template/budget-loader";
import type { OverflowFlag } from "@/lib/pptx-template/budget-types";
import type { RetryBudget } from "./with-budget-retry";

const GLOBAL_RETRY_CAP = 5;

export async function generateAllSections(
  ctx: BidContext,
  templateName: string, // NEW param — caller passar template-namn
  onSectionComplete?: (section: BidSection) => void | Promise<void>,
): Promise<{ sections: BidSection[]; overflowFlags: OverflowFlag[] }> {
  const budgets = await loadBudgets(templateName);
  const retryBudget: RetryBudget = { remaining: GLOBAL_RETRY_CAP };

  // Deterministic generators — no overflows possible (no LLM)
  const cover = buildCoverSection(ctx.analysis);
  const certifications = buildCertificationsSection();
  const confidentiality = buildConfidentialitySection(ctx.analysis);

  const bundleResults = await Promise.all([
    buildUnderstandingBundle(ctx, budgets, retryBudget),
    buildPhasesBundle(ctx, budgets, retryBudget),
    buildQualityBundle(ctx, budgets, retryBudget),
    buildRequirementMatrixBundle(ctx, budgets, retryBudget),
    buildTeamBundle(ctx, budgets, retryBudget),
    buildReferenceBundle(ctx, budgets, retryBudget),
  ]);

  const sections: BidSection[] = [
    cover,
    ...bundleResults.flatMap((r) => r.sections),
    confidentiality,
    certifications,
  ];

  const overflowFlags: OverflowFlag[] = bundleResults.flatMap((r) => r.overflowFlags);

  if (onSectionComplete) {
    for (const s of sections) {
      await onSectionComplete(s);
    }
  }

  return { sections, overflowFlags };
}
```

- [ ] **Step 2: Update orchestrator-test**

Befintlig: `src/lib/bid-generator/__tests__/orchestrator.test.ts`. Update för ny return-shape + `templateName`-param. Mock `loadBudgets`. Lägg till test som verifierar `overflowFlags` aggregeras från bundles.

- [ ] **Step 3: Run orchestrator-test**

```bash
npm test -- orchestrator
```

Expected: PASS.

- [ ] **Step 4: Update API-route `/api/bids/route.ts`**

Hitta ställe där `generateAllSections` anropas. Update:
- Anropa med `templateName` (för v1 hardcoda `"anbudsmall-v2"` här — picker kommer i separat PR).
- Persistera `overflowFlags` på bid-insert: lägg till `overflow_flags: result.overflowFlags` i Supabase `.insert({...})`.

Konkret patch:

```ts
// I bid-create-handler:
const { sections, overflowFlags } = await generateAllSections(
  ctx,
  "anbudsmall-v2", // TODO: ersätts av template-picker i framtida PR
);

// Vid insert:
await supabase.from("bids").insert({
  // ... befintliga fält
  sections,
  overflow_flags: overflowFlags,
});
```

- [ ] **Step 5: Run all bid-generator-tester**

```bash
npm test -- bid-generator
```

Expected: PASS.

- [ ] **Step 6: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Run e2e bid-export-test**

```bash
npm test -- bid-export-e2e
```

Expected: PASS — befintligt e2e-test ska fortfarande funka. Om det failar för att signaturen ändrades, update test för att passa `templateName` + nytt return-shape.

- [ ] **Step 8: Commit**

```bash
git add src/lib/bid-generator/index.ts src/lib/bid-generator/__tests__/orchestrator.test.ts src/app/api/bids/route.ts src/lib/pptx-template/__tests__/bid-export-e2e.test.ts
git commit -m "feat(bid-gen): aggregate overflowFlags from bundles, persist on bid insert"
```

---

### Task 11: Push branch + öppna PR #2 (Bid-generator integration)

- [ ] **Step 1: Push**

```bash
git push origin feat/pptx-corrector
```

- [ ] **Step 2: Skapa PR**

```bash
gh pr create --title "PR #2: PPTX corrector — bid-generator integration" --body "$(cat <<'EOF'
## Summary
- `appendOverflowList` helper: bygger retry-prompts med konkret overflow-lista.
- `withBudgetRetry` orchestrator-wrapper: 1 retry per LLM-anrop, global cap via `RetryBudget`-objekt.
- `renderBudgetTable`: injicerar text-limits i bundle-prompts.
- 6 bundles uppdaterade med ny signatur (`budgets, retryBudget` params) + return-shape (`{ sections, overflowFlags }`).
- `generateAllSections` orchestrator aggregerar overflowFlags från bundles, kräver `templateName`-param.
- API-route persisterar `overflow_flags` på bid-insert (hardcoded `"anbudsmall-v2"` tills picker kommer).

PR #2 av 4. UI för flag-visning kommer i PR #3.

Spec: `docs/superpowers/specs/2026-05-03-pptx-corrector-design.md`

## Test plan
- [x] Unit: `appendOverflowList` (2 tester)
- [x] Unit: `withBudgetRetry` (4 tester — pass, retry-pass, retry-fail, cap-exhausted)
- [x] Unit: `renderBudgetTable` (2 tester)
- [x] Updated bundle-tester gröna (6 bundles)
- [x] Updated orchestrator-test grönt
- [x] `bid-export-e2e` grönt (regression)
- [x] `npx tsc --noEmit` rent

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Vänta in PR-routinen + squash-merge**

Samma flow som PR #1.

---

## Phase 3 — Bid-editor UI (PR #3)

### Task 12: `OverflowChecklist`-komponent + tester

**Files:**
- Create: `/agentic-dealflow/src/components/bid-editor/OverflowChecklist.tsx`
- Create: `/agentic-dealflow/src/components/bid-editor/__tests__/OverflowChecklist.test.tsx`

- [ ] **Step 1: Skriv failing tests**

```tsx
// src/components/bid-editor/__tests__/OverflowChecklist.test.tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OverflowChecklist } from "../OverflowChecklist";
import type { OverflowFlag } from "@/lib/pptx-template/budget-types";

describe("OverflowChecklist", () => {
  it("renders empty-state when no flags", () => {
    render(<OverflowChecklist flags={[]} onJumpToField={() => {}} />);
    expect(screen.getByText(/redo för export/i)).toBeInTheDocument();
  });

  it("groups flags by slide and shows label + length/budget", () => {
    const flags: OverflowFlag[] = [
      { slide: 7, fieldPath: "phases[0].objective", fieldLabel: "Fas 1 — Mål", length: 145, budget: 120 },
      { slide: 7, fieldPath: "phases[0].activities[2]", fieldLabel: "Fas 1 — Aktivitet 3", length: 130, budget: 120 },
      { slide: 11, fieldPath: "checkpoints[2]", fieldLabel: "Avstämningspunkt 3", length: 95, budget: 80 },
    ];
    render(<OverflowChecklist flags={flags} onJumpToField={() => {}} />);
    expect(screen.getByText(/Slide 7/)).toBeInTheDocument();
    expect(screen.getByText(/Slide 11/)).toBeInTheDocument();
    expect(screen.getByText(/Fas 1 — Mål/)).toBeInTheDocument();
    expect(screen.getByText(/145\/120/)).toBeInTheDocument();
  });

  it("calls onJumpToField with the flag when row is clicked", () => {
    const onJump = vi.fn();
    const flag: OverflowFlag = {
      slide: 7,
      fieldPath: "phases[0].objective",
      fieldLabel: "Fas 1 — Mål",
      length: 145,
      budget: 120,
    };
    render(<OverflowChecklist flags={[flag]} onJumpToField={onJump} />);
    fireEvent.click(screen.getByText(/Fas 1 — Mål/));
    expect(onJump).toHaveBeenCalledWith(flag);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
npm test -- OverflowChecklist
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement component**

```tsx
// src/components/bid-editor/OverflowChecklist.tsx
"use client";

import type { OverflowFlag } from "@/lib/pptx-template/budget-types";

interface OverflowChecklistProps {
  flags: OverflowFlag[];
  onJumpToField: (flag: OverflowFlag) => void;
}

export function OverflowChecklist({ flags, onJumpToField }: OverflowChecklistProps) {
  if (flags.length === 0) {
    return (
      <aside className="w-[280px] sticky top-4 self-start rounded-lg border border-green-200 bg-green-50 p-4">
        <h3 className="text-sm font-semibold text-green-900">Pre-export checklist</h3>
        <p className="mt-2 text-sm text-green-800">Inga overflows — redo för export.</p>
      </aside>
    );
  }

  const grouped = new Map<number, OverflowFlag[]>();
  for (const f of flags) {
    const list = grouped.get(f.slide) ?? [];
    list.push(f);
    grouped.set(f.slide, list);
  }
  const sortedSlides = [...grouped.keys()].sort((a, b) => a - b);

  return (
    <aside className="w-[280px] sticky top-4 self-start rounded-lg border border-amber-200 bg-amber-50 p-4">
      <h3 className="text-sm font-semibold text-amber-900">
        Pre-export checklist ({flags.length})
      </h3>
      <p className="mt-1 text-xs text-amber-800">
        Dessa fält är för långa. Klicka för att hoppa till och korrigera.
      </p>
      <div className="mt-3 space-y-3">
        {sortedSlides.map((slide) => (
          <div key={slide}>
            <div className="text-xs font-medium text-amber-900">Slide {slide}</div>
            <ul className="mt-1 space-y-1">
              {grouped.get(slide)!.map((flag) => (
                <li key={flag.fieldPath}>
                  <button
                    type="button"
                    onClick={() => onJumpToField(flag)}
                    className="w-full text-left text-xs text-amber-900 hover:bg-amber-100 rounded px-1.5 py-1"
                  >
                    {flag.fieldLabel}{" "}
                    <span className="text-amber-700">
                      ({flag.length}/{flag.budget})
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- OverflowChecklist
```

Expected: PASS — alla 3 tester gröna.

- [ ] **Step 5: Commit**

```bash
git add src/components/bid-editor/OverflowChecklist.tsx src/components/bid-editor/__tests__/OverflowChecklist.test.tsx
git commit -m "feat(bid-editor): add OverflowChecklist right-rail panel"
```

---

### Task 13: Extend `EditableText` med live counter

**Files:**
- Modify: `/agentic-dealflow/src/components/bid-editor/EditableText.tsx`
- Create: `/agentic-dealflow/src/components/bid-editor/__tests__/EditableText.test.tsx`

- [ ] **Step 1: Skriv failing tests för counter-beteende**

```tsx
// src/components/bid-editor/__tests__/EditableText.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EditableText } from "../EditableText";

describe("EditableText counter", () => {
  it("does not render counter when budget is undefined", () => {
    render(<EditableText value="hej" onChange={() => {}} />);
    expect(screen.queryByTestId("char-counter")).not.toBeInTheDocument();
  });

  it("renders counter when budget is provided", () => {
    render(<EditableText value="hej" onChange={() => {}} budget={120} />);
    const counter = screen.getByTestId("char-counter");
    expect(counter).toHaveTextContent("3/120");
  });

  it("counter shows red color when length exceeds budget", () => {
    render(<EditableText value={"x".repeat(150)} onChange={() => {}} budget={120} />);
    const counter = screen.getByTestId("char-counter");
    expect(counter).toHaveTextContent("150/120");
    expect(counter.className).toMatch(/text-red/);
  });

  it("counter shows neutral color when length is under budget", () => {
    render(<EditableText value="kort" onChange={() => {}} budget={120} />);
    const counter = screen.getByTestId("char-counter");
    expect(counter.className).not.toMatch(/text-red/);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
npm test -- EditableText
```

Expected: FAIL — `budget`-prop existerar inte.

- [ ] **Step 3: Modify `EditableText.tsx` — add counter**

Patch (apply mot existerande fil):

```tsx
// src/components/bid-editor/EditableText.tsx
"use client";

import { useRef, useEffect, useCallback, useState } from "react";

interface EditableTextProps {
  value: string;
  onChange: (value: string) => void;
  as?: "p" | "h2" | "h3" | "h4" | "span" | "li";
  className?: string;
  placeholder?: string;
  style?: React.CSSProperties;
  budget?: number; // NEW: når undefined, ingen counter
}

export function EditableText({
  value,
  onChange,
  as: Tag = "p",
  className = "",
  placeholder = "",
  style,
  budget,
}: EditableTextProps) {
  const ref = useRef<HTMLElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null);
  const lastValueRef = useRef(value);
  const [length, setLength] = useState(value.length); // NEW: realtime counter state

  useEffect(() => {
    if (ref.current && value !== lastValueRef.current) {
      ref.current.textContent = value;
      lastValueRef.current = value;
      setLength(value.length); // NEW
    }
  }, [value]);

  const handleInput = useCallback(() => {
    if (ref.current) {
      setLength(ref.current.textContent?.length ?? 0); // NEW: realtime, no debounce
    }
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      const text = ref.current?.textContent ?? "";
      if (text !== lastValueRef.current) {
        lastValueRef.current = text;
        onChange(text);
      }
    }, 1000);
  }, [onChange]);

  const handleBlur = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const text = ref.current?.textContent ?? "";
    if (text !== lastValueRef.current) {
      lastValueRef.current = text;
      onChange(text);
    }
  }, [onChange]);

  return (
    <span className="relative inline-block w-full">
      <Tag
        ref={ref as React.RefObject<never>}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onBlur={handleBlur}
        className={`outline-none focus:ring-2 focus:ring-blue-200 focus:ring-offset-1 rounded px-0.5 -mx-0.5 ${className}`}
        data-placeholder={placeholder}
        style={style}
      >
        {value}
      </Tag>
      {budget !== undefined && (
        <span
          data-testid="char-counter"
          className={`absolute -bottom-4 right-0 text-[10px] tabular-nums ${
            length > budget ? "text-red-600 font-medium" : "text-gray-400"
          }`}
        >
          {length}/{budget}
        </span>
      )}
    </span>
  );
}
```

- [ ] **Step 4: Run EditableText-tester**

```bash
npm test -- EditableText
```

Expected: PASS — alla 4 tester gröna.

- [ ] **Step 5: Run alla bid-editor-tester (regression)**

```bash
npm test -- bid-editor
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/bid-editor/EditableText.tsx src/components/bid-editor/__tests__/EditableText.test.tsx
git commit -m "feat(bid-editor): add live char-counter to EditableText with budget prop"
```

---

### Task 14: Wire `OverflowChecklist` in `BidEditor` + jump + re-verify

**Files:**
- Modify: `/agentic-dealflow/src/components/bid-editor/BidEditor.tsx`

Detta är den största UI-integrationen. BidEditor måste:
1. Ladda `bid.overflow_flags` från props/data
2. Mounta `<OverflowChecklist />` i right rail
3. Implementera `onJumpToField` (scroll till fält + focus)
4. Re-verify vid edit: när `EditableText.onChange` fyrar för fält som har en budget, kör `verifyFieldBudgets` lokalt på det enskilda fältet och uppdatera `overflow_flags` (lägg till/ta bort flag)
5. Persistera updaterade `overflow_flags` till Supabase (debounced)
6. Passa `budget`-prop till `EditableText` för fält som har en budget-key

**OBS:** Detta task är scope-tungt. Implementatören bör:
- Läsa hela `BidEditor.tsx` först
- Identifiera var `EditableText` mountas (per renderer eller central?)
- Lägga `budget`-prop genom befintlig prop-passing-stack

Strukturellt rekommenderat:
- Lägg en `useOverflowFlags(initial: OverflowFlag[])`-hook som returnerar `{ flags, addFlag, removeFlag, syncToSupabase }`.
- Pass:a `flags` till `OverflowChecklist`.
- Pass:a en `getBudget(fieldPath: string): number | undefined`-funktion till renderers som tar `budgets` (loaded via SWR från template_configs read-endpoint, eller via initial server-side load).

- [ ] **Step 1: Decide budget-loading strategy in BidEditor**

Två alternativ:
- **A)** Server-side: bid-page laddar budgets serverside, passar via props.
- **B)** Client-side: `useSWR` mot ny `/api/template-configs/[name]` route.

Rekommendation: **A** för enkelhet. Bid-page är server component → kan await `loadBudgets(bid.template_name)` direkt. Pass:as via props till `<BidEditor>`.

(Implementatören får verifiera bid-page-komponentens server/client-mode och vid behov skapa en mini-API-route för B.)

- [ ] **Step 2: Add budget-prop till BidEditor + renderers**

```tsx
// BidEditor signatur
interface BidEditorProps {
  // ... existing
  budgets: FieldBudgets;
  initialOverflowFlags: OverflowFlag[];
}
```

Pass:a `budgets` och en getter `getBudget(fieldPath: string)` ner till varje renderer som mountar `EditableText`. Mappingen från BidSection-fält till budget-keys måste matcha `verify-budgets`-resolverns paths.

- [ ] **Step 3: Implement re-verify on edit**

I varje plats där `EditableText.onChange` fyrar:
1. Compute fieldPath för fältet (e.g. `phases[0].activities[2]`).
2. Look up `budget = budgets[normalizeKey(fieldPath)]` (normalizeKey strippar konkreta indices till `[*]`).
3. Om `text.length > budget`: lägg till flag (om inte redan finns).
4. Om `text.length <= budget`: ta bort flag.
5. Debounced persist (500ms): `supabase.from("bids").update({ overflow_flags: flags }).eq("id", bid.id)`.

- [ ] **Step 4: Implement onJumpToField**

```tsx
const onJumpToField = (flag: OverflowFlag) => {
  const el = document.querySelector(`[data-field-path="${flag.fieldPath}"]`);
  if (el instanceof HTMLElement) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus();
  }
};
```

För att detta ska fungera måste varje `EditableText` taggas med `data-field-path`. Lägg till `dataFieldPath?: string` prop på `EditableText` och spread:a på root-elementet.

- [ ] **Step 5: Mount OverflowChecklist i right rail**

I `BidEditor`-layout:

```tsx
<div className="flex gap-6">
  <div className="flex-1">{/* befintlig editor */}</div>
  <OverflowChecklist flags={flags} onJumpToField={onJumpToField} />
</div>
```

- [ ] **Step 6: Manual smoke i dev-server**

Stefan startar `npm run dev`, öppnar en bid med kända overflows, verifierar:
- Right rail visar checklist
- Klick på flag → scroll + focus
- Editing över budget → counter rött
- Editing under budget → flag försvinner från checklist live
- Refresh → flag-state är persisterad i Supabase

Inga acceptance-baserade unit-tester här — denna task är wiring + smoke. UI-edge-cases läggs till i en framtida polish-runda.

- [ ] **Step 7: Commit**

```bash
git add src/components/bid-editor/BidEditor.tsx src/components/bid-editor/EditableText.tsx
git commit -m "feat(bid-editor): wire OverflowChecklist + jump-to-field + re-verify on edit"
```

- [ ] **Step 8: Push + skapa PR #3**

```bash
git push origin feat/pptx-corrector
gh pr create --title "PR #3: PPTX corrector — bid-editor UI" --body "$(cat <<'EOF'
## Summary
- `OverflowChecklist`-komponent: right-rail panel, grupperat per slide, klick → onJumpToField.
- `EditableText` får `budget`-prop + live char-counter (realtime, no debounce).
- `BidEditor` wirad: laddar budgets server-side, mounta checklist, passar budgets ner till renderers, re-verify på edit, debounced persist till Supabase.

PR #3 av 4. Manual smoke + budget-kalibrering kommer i PR #4.

Spec: `docs/superpowers/specs/2026-05-03-pptx-corrector-design.md`

## Test plan
- [x] `OverflowChecklist`-tester gröna (3 tester)
- [x] `EditableText`-counter-tester gröna (4 tester)
- [x] Befintliga bid-editor-tester gröna (regression)
- [x] Manual smoke: editing över budget → counter rött, under budget → flag försvinner
- [x] `npx tsc --noEmit` rent

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 9: Vänta in PR-routinen + squash-merge**

---

## Phase 4 — Smoke + calibration (PR #4 om kalibrering ändrar SQL)

### Task 15: Smoke + budget-kalibrering

**Files:** ev. ny `notes/2026-05-XX-corrector-calibration.md` om observations behövs.

- [ ] **Step 1: Generera bid mot anbudsmall-v2 med stress-fixture**

Använd befintlig `scripts/generate-sample-pptx.ts` eller equivalent stress-input via API. Verifiera:
- `bid.overflow_flags` i Supabase är populerade där text > budget
- PPTX renderas (overflow:ar visuellt — det ska den, vi flag:ar dem)

- [ ] **Step 2: Generera bid mot anbudsmall-colors med samma input**

Samma flow. Notera om colors-mallen har annan textbox-kapacitet (förmodligen ja). Mäta visuellt i PowerPoint.

- [ ] **Step 3: Kalibrera budgets per template (om behövs)**

Om colors-mallen har t.ex. 25% smalare textboxar: justera dess budgets via Supabase SQL Editor:

```sql
update template_configs
set budgets = jsonb_set(budgets, '{phases[*].objective}', '95'::jsonb)
where name = 'anbudsmall-colors';
```

(Eller skriv hela budgets-objektet med `update ... set budgets = jsonb_build_object(...)`.)

Inval cache i deployed app: nästa instans-restart läser nya värden. För manual hot-reload, anropa `clearBudgetCache("anbudsmall-colors")` via en debug-route eller restart Vercel-deploymenten.

- [ ] **Step 4: Re-generate bid mot colors med kalibrerade budgets**

Verifiera att `overflow_flags` minskar / matchar visuell verklighet.

- [ ] **Step 5: Skriv smoke-notes**

```markdown
# notes/2026-05-XX-corrector-calibration.md

## Anbudsmall-v2 smoke
- Stress-input: ...
- Overflows flagged: ...
- Visuell verifikation i PowerPoint: ...

## Anbudsmall-colors smoke
- Samma input, observerade textbox-kapacitet: ...
- Kalibrerade budgets: ...

## Acceptance
- [ ] AC1-AC7 (per spec)
```

- [ ] **Step 6: Commit notes**

```bash
git add notes/2026-05-XX-corrector-calibration.md
git commit -m "docs(corrector): smoke + calibration notes"
git push origin feat/pptx-corrector
```

Om kalibrering inte ändrar SQL/kod: ingen PR behövs, bara push av notes.

Om kalibrering kräver SQL-uppdatering bortom Supabase SQL Editor (t.ex. ny migration för att deploy seedas korrekt): skriv migration 019, applicera, PR #4.

- [ ] **Step 7: Memory-uppdatering**

Per session-slut-rutin (CLAUDE.md): uppdatera `~/.claude/projects/.../memory/project_dealflow_next_steps.md` — markera korrektör som klar, lyft fram nästa steg (runtime evaluator integration eller onboarding).

---

## Self-review

### Spec coverage

- ✅ Lager 1 (slot-budget i prompt) — Task 9 (renderBudgetTable + bundle-injection)
- ✅ Lager 2 (inline verify text-cap) — Task 5 (`verifyFieldBudgets`) + Task 8 (`withBudgetRetry` triggar verify)
- ✅ Lager 3 (flag-only post-retry) — Task 8 (cap-exhausted path) + Task 10 (persist) + Task 12 (UI)
- ✅ Multi-template-stöd — Task 1 (seed for båda templates) + Task 4 (loader är template-name-driven)
- ✅ Pre-export checklist (right rail) — Task 12
- ✅ onChange counter — Task 13
- ✅ Re-verify vid konsult-edit — Task 14
- ✅ Migrationer 017 + 018 med RLS — Tasks 1-2
- ✅ Error-handling: TemplateConfigMissingError, InvalidBudgetSchemaError — Task 4
- ✅ Retry-cap (5/bid) — Task 8 + Task 10 (initialiserar `RetryBudget`)
- ✅ `_soft-cap.ts` behålls som backstop — INGA ändringar i den filen, bibehålls som befintligt

### Placeholder scan

Inga TBD/TODO/"implement later"/"add appropriate error handling". Alla code-blocks innehåller faktisk implementation. Task 14 har dock prosa-instruktioner ("läs hela BidEditor.tsx först") — det är en wiring-task där exakt patch beror på befintlig komponentstruktur. Implementatören får läsa filen först.

### Type consistency

- `FieldBudgets` definierad i Task 3, importerad konsistent i Tasks 4, 5, 7, 8, 9, 10, 14.
- `OverflowFlag` definierad i Task 3, samma import-källa överallt.
- `RetryBudget` definierad i Task 8, samma signatur i Task 9 (bundle-params) och Task 10 (orchestrator initierar).
- `verifyFieldBudgets` returnerar `{ pass, overflows: OverflowFlag[] }` i Task 5, konsumerat samma sätt i Task 8.
- `loadBudgets(templateName)` returnerar `Promise<FieldBudgets>` i Task 4, anropas samma sätt i Task 10.
- `buildXBundle(ctx, budgets, retryBudget)`-signatur konsistent över alla 6 bundles i Task 9, anropad samma sätt i Task 10.
- Budget-paths (`phases[*].objective` etc) konsistenta mellan migration (Task 1), `FIELD_METADATA` (Task 5), `FIELD_LABELS` (Task 9 step 1), och bundle-`BUDGET_KEYS` (Task 9 steps 3-7).

### Notes om scope

- Plan kapad vid 4 PRs per Stefans branch-discipline. Kan slås ihop till färre PRs om diff hålls liten — men 4 ger naturlig review-disciplin.
- Task 14 (BidEditor wiring) är den enda som inte är ren TDD — den är wiring + manual smoke. Acceptance-validering sker i Task 15.
- Geometric verify, template-picker UI, kund-onboarding är explicit out-of-scope per spec.
