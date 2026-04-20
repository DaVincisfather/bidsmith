# M1: Template Renderer Switch + DiaryNumber Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch the production export route from the legacy pptxgenjs renderer to the new template-based renderer (anbudsmall-v2), extract diaryNumber from RFP source documents, and delete all legacy renderer code (12 source files + 4 test files).

**Architecture:** Single producer change (API route `/api/bids/[id]/export`) + extractor extension (one prompt + one schema field) + bulk delete. The new `renderTemplate` already exists and works (visually verified slide 1-17). This plan flips the switch, sources MasterContext from real data, and removes the dead renderer.

**Tech Stack:** Next.js 16 (App Router), Vitest, Zod, Anthropic SDK, Supabase (PostgreSQL), pptx-automizer

**Out of scope (deferred to M2):**
- Aligning bid-generator output to v2 slot formats (it currently emits a mix; v2 renderer will silently skip unknown formats — that's acceptable for M1)
- Quality-assurance / confidentiality / certifications content generation (slides will render with template defaults from anbudsmall-v2)
- Org-level template config (templateId hardcoded to "anbudsmall-v2" in M1)

---

## File Structure

**Modify:**
- `src/lib/types.ts` — add `diaryNumber?: string` to `RfpAnalysis`
- `src/lib/ai-schemas.ts` — add optional field to `RfpAnalysisSchema`
- `src/lib/rfp-analyzer.ts` — extend `SYSTEM_PROMPT` with diaryNumber instruction
- `src/app/api/bids/[id]/export/route.ts` — swap `renderBidToPptx` → `renderTemplate`

**Create:**
- `src/app/api/bids/[id]/export/build-master-context.ts` — pure helper, easy to unit-test (route handlers are awkward to test)
- `src/app/api/bids/[id]/export/__tests__/build-master-context.test.ts` — unit tests for the helper

**Delete:**
- `src/lib/pptx-renderer.ts`
- `src/lib/pptx/` (entire directory — 13 files: constants, content-three-col, content-two-col, cover, gantt, master, phase-detail, placeholder, references, requirement-matrix, section-divider, team-cards, index)
- `src/lib/__tests__/pptx-constants.test.ts`
- `src/lib/__tests__/pptx-master.test.ts`
- `src/lib/__tests__/pptx-pagination.test.ts`
- `src/lib/__tests__/pptx-renderer.test.ts`

---

### Task 1: Add `diaryNumber` to RfpAnalysis type + Zod schema

**Files:**
- Modify: `src/lib/types.ts:13-25`
- Modify: `src/lib/ai-schemas.ts:5-29`

This is a pure type addition — no separate test needed; downstream type errors will surface in subsequent tasks if anything is misaligned.

- [ ] **Step 1: Add field to RfpAnalysis interface**

In `src/lib/types.ts`, change the `RfpAnalysis` interface to:

```ts
export interface RfpAnalysis {
  title: string;
  client: string;
  deadline: string | null;
  summary: string;
  background?: string;
  diaryNumber?: string;
  requirements: RfpRequirement[];
  evaluationCriteria: EvaluationCriterion[];
  requiredCompetencies: string[];
  estimatedScope: string;
  redFlags: string[];
  domain: string;
}
```

Place `diaryNumber?: string;` right after `background?: string;` so optional metadata stays grouped.

- [ ] **Step 2: Add field to Zod schema**

In `src/lib/ai-schemas.ts`, change the `RfpAnalysisSchema` to:

```ts
export const RfpAnalysisSchema = z.object({
  title: z.string(),
  client: z.string(),
  deadline: z.string().nullable(),
  summary: z.string(),
  background: z.string().optional(),
  diaryNumber: z.string().optional(),
  requirements: z.array(
    z.object({
      category: z.string(),
      description: z.string(),
      priority: z.enum(["must", "should", "nice-to-have"]),
    })
  ),
  evaluationCriteria: z.array(
    z.object({
      name: z.string(),
      weight: z.number(),
      description: z.string(),
    })
  ),
  requiredCompetencies: z.array(z.string()),
  estimatedScope: z.string(),
  redFlags: z.array(z.string()),
  domain: z.string(),
});
```

- [ ] **Step 3: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: No errors. (If errors appear in other files referencing `RfpAnalysis`, they're pre-existing — note them but don't fix here.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts src/lib/ai-schemas.ts
git commit -m "feat: add optional diaryNumber to RfpAnalysis"
```

---

### Task 2: Extend RFP analyzer prompt to extract diaryNumber

**Files:**
- Modify: `src/lib/rfp-analyzer.ts:5-39`
- Test: `src/lib/__tests__/rfp-analyzer.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/rfp-analyzer.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCallClaude = vi.hoisted(() => vi.fn());
vi.mock("../ai-client", () => ({
  callClaude: mockCallClaude,
}));

import { analyzeRfp } from "../rfp-analyzer";

describe("analyzeRfp", () => {
  beforeEach(() => {
    mockCallClaude.mockReset();
  });

  it("passes diaryNumber instruction to the LLM in the system prompt", async () => {
    mockCallClaude.mockResolvedValueOnce({
      title: "Test",
      client: "Kund",
      deadline: null,
      summary: "s",
      requirements: [],
      evaluationCriteria: [],
      requiredCompetencies: [],
      estimatedScope: "x",
      redFlags: [],
      domain: "IT",
    });

    await analyzeRfp("Diarienummer: VGR-2026-0042\n\nResten av RFP:n...");

    expect(mockCallClaude).toHaveBeenCalledOnce();
    const args = mockCallClaude.mock.calls[0][0];
    expect(args.system).toContain("diaryNumber");
    expect(args.system).toMatch(/diarienummer|diarienr|dnr/i);
  });

  it("returns the diaryNumber when LLM extracts one", async () => {
    mockCallClaude.mockResolvedValueOnce({
      title: "Test",
      client: "Kund",
      deadline: null,
      summary: "s",
      diaryNumber: "VGR-2026-0042",
      requirements: [],
      evaluationCriteria: [],
      requiredCompetencies: [],
      estimatedScope: "x",
      redFlags: [],
      domain: "IT",
    });

    const result = await analyzeRfp("Diarienummer: VGR-2026-0042\n\n...");
    expect(result.diaryNumber).toBe("VGR-2026-0042");
  });

  it("returns undefined diaryNumber when not present in source", async () => {
    mockCallClaude.mockResolvedValueOnce({
      title: "Test",
      client: "Kund",
      deadline: null,
      summary: "s",
      requirements: [],
      evaluationCriteria: [],
      requiredCompetencies: [],
      estimatedScope: "x",
      redFlags: [],
      domain: "IT",
    });

    const result = await analyzeRfp("RFP utan diarienummer");
    expect(result.diaryNumber).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/rfp-analyzer.test.ts`
Expected: FAIL on first test with "expected 'system' to contain 'diaryNumber'" — current SYSTEM_PROMPT has no such instruction.

- [ ] **Step 3: Update SYSTEM_PROMPT to include diaryNumber**

In `src/lib/rfp-analyzer.ts`, modify the `SYSTEM_PROMPT` constant. Change the JSON skeleton block and the guidance bullets:

```ts
const SYSTEM_PROMPT = `Du är en expert på att analysera förfrågningsunderlag (RFP:er) för konsultuppdrag.
Du läser ett RFP-dokument och producerar en strukturerad analys i JSON-format.

Svara ALLTID med giltig JSON som matchar detta schema:
{
  "title": "Uppdragets titel",
  "client": "Kund/beställare (om angivet, annars 'Ej angivet')",
  "deadline": "Sista anbudsdag i ISO-format, eller null",
  "diaryNumber": "Diarienummer/upphandlings-ID om angivet i dokumentet (t.ex. 'VGR-2026-0042', 'Dnr 12345/2024'). Utelämna fältet helt om det inte anges.",
  "summary": "2-3 meningar som sammanfattar uppdraget — kort och skarpt",
  "background": "4-6 meningar som beskriver uppdragets kontext: varför upphandlingen sker, vad kunden vill åstadkomma, eventuell historik eller strategisk riktning. Skriv flytande prosa, inte punktlista.",
  "requirements": [
    {
      "category": "Kategori (t.ex. Kompetens, Erfarenhet, Kapacitet)",
      "description": "Beskrivning av kravet",
      "priority": "must | should | nice-to-have"
    }
  ],
  "evaluationCriteria": [
    {
      "name": "Kriteriets namn",
      "weight": 40,
      "description": "Vad som bedöms"
    }
  ],
  "requiredCompetencies": ["kompetens1", "kompetens2"],
  "estimatedScope": "Uppskattad omfattning i tid/resurser",
  "redFlags": ["Potentiella risker eller oklarheter i underlaget"],
  "domain": "Kort domäntagg, t.ex. IT, management, ekonomi, HR, hälsa, infrastruktur"
}

Var noggrann med att:
- Skilja mellan ska-krav (must) och bör-krav (should)
- Extrahera utvärderingskriterier med vikter om de anges
- Identifiera oklarheter eller potentiella problem (redFlags)
- Plocka diarienummer/upphandlings-ID exakt som det står i dokumentet — utelämna fältet om det saknas, gissa aldrig
- Sammanfatta i professionell ton`;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/rfp-analyzer.test.ts`
Expected: All 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rfp-analyzer.ts src/lib/__tests__/rfp-analyzer.test.ts
git commit -m "feat: extract diaryNumber from RFP documents"
```

---

### Task 3: Extract `buildMasterContext` helper + unit tests

**Files:**
- Create: `src/app/api/bids/[id]/export/build-master-context.ts`
- Test: `src/app/api/bids/[id]/export/__tests__/build-master-context.test.ts`

The route handler is awkward to test directly in Next.js App Router. Extracting MasterContext construction into a pure helper makes it trivially testable and keeps the route thin.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/bids/[id]/export/__tests__/build-master-context.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildMasterContext } from "../build-master-context";
import type { RfpAnalysis } from "@/lib/types";

const baseAnalysis: RfpAnalysis = {
  title: "Strategiskt utvecklingsstöd",
  client: "Region Västra Götaland",
  deadline: "2026-05-01",
  summary: "x",
  requirements: [],
  evaluationCriteria: [],
  requiredCompetencies: [],
  estimatedScope: "x",
  redFlags: [],
  domain: "management",
};

describe("buildMasterContext", () => {
  it("populates all fields from analysis + organization", () => {
    const ctx = buildMasterContext({
      analysis: { ...baseAnalysis, diaryNumber: "VGR-2026-0042" },
      organizationName: "Edgren Konsult AB",
      now: new Date("2026-04-19T10:00:00Z"),
    });

    expect(ctx).toEqual({
      companyName: "Edgren Konsult AB",
      clientName: "Region Västra Götaland",
      bidName: "Strategiskt utvecklingsstöd",
      diaryNumber: "VGR-2026-0042",
      bidDate: "2026-04-19",
    });
  });

  it("falls back to empty diaryNumber when analysis has none", () => {
    const ctx = buildMasterContext({
      analysis: baseAnalysis,
      organizationName: "Edgren Konsult AB",
      now: new Date("2026-04-19T10:00:00Z"),
    });

    expect(ctx.diaryNumber).toBe("");
  });

  it("formats bidDate as ISO date (no time)", () => {
    const ctx = buildMasterContext({
      analysis: baseAnalysis,
      organizationName: "Org",
      now: new Date("2026-04-19T23:59:59Z"),
    });

    expect(ctx.bidDate).toBe("2026-04-19");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/bids/\[id\]/export/__tests__/build-master-context.test.ts`
Expected: FAIL — file not found / import error.

- [ ] **Step 3: Create the helper**

Create `src/app/api/bids/[id]/export/build-master-context.ts`:

```ts
import type { RfpAnalysis } from "@/lib/types";
import type { MasterContext } from "@/lib/pptx-template/types";

interface BuildMasterContextInput {
  analysis: RfpAnalysis;
  organizationName: string;
  now: Date;
}

export function buildMasterContext(
  input: BuildMasterContextInput,
): MasterContext {
  return {
    companyName: input.organizationName,
    clientName: input.analysis.client,
    bidName: input.analysis.title,
    diaryNumber: input.analysis.diaryNumber ?? "",
    bidDate: input.now.toISOString().split("T")[0],
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/api/bids/\[id\]/export/__tests__/build-master-context.test.ts`
Expected: All 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/bids/[id]/export/build-master-context.ts" "src/app/api/bids/[id]/export/__tests__/build-master-context.test.ts"
git commit -m "feat: extract buildMasterContext helper for export route"
```

---

### Task 4: Migrate API export route to renderTemplate

**Files:**
- Modify: `src/app/api/bids/[id]/export/route.ts`

The route currently fetches bid + organization style_guide and calls `renderBidToPptx(sections, styleGuide)`. After this task it fetches bid + analysis + organization (name only) and calls `renderTemplate("anbudsmall-v2", sections, master)`.

- [ ] **Step 1: Replace the route file**

Overwrite `src/app/api/bids/[id]/export/route.ts` with:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { getOrgId } from "@/lib/org";
import { renderTemplate } from "@/lib/pptx-template/loader";
import { BidSection, RfpAnalysis } from "@/lib/types";
import { buildMasterContext } from "./build-master-context";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const authed = await createClient();
  const orgId = await getOrgId(authed);
  const supabase = createServiceClient();

  const { data: bid, error: bidError } = await supabase
    .from("bids")
    .select("*")
    .eq("id", id)
    .eq("organization_id", orgId)
    .single();

  if (bidError || !bid) {
    return NextResponse.json({ error: "Bid not found" }, { status: 404 });
  }

  if (bid.status === "generating") {
    return NextResponse.json(
      { error: "Bid is still generating. Wait until status is 'draft'." },
      { status: 409 },
    );
  }

  const { data: analysisRow, error: analysisError } = await supabase
    .from("analyses")
    .select("analysis")
    .eq("id", bid.analysis_id)
    .single();

  if (analysisError || !analysisRow) {
    return NextResponse.json(
      { error: "Analysis not found for bid" },
      { status: 500 },
    );
  }

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", bid.organization_id)
    .single();

  if (orgError || !org) {
    return NextResponse.json(
      { error: "Organization not found" },
      { status: 500 },
    );
  }

  const sections = bid.sections as BidSection[];
  const master = buildMasterContext({
    analysis: analysisRow.analysis as RfpAnalysis,
    organizationName: org.name,
    now: new Date(),
  });

  const buffer = await renderTemplate("anbudsmall-v2", sections, master);

  await supabase
    .from("bids")
    .update({ status: "exported", exported_at: new Date().toISOString() })
    .eq("id", id);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="anbud-${id.substring(0, 8)}.pptx"`,
    },
  });
}
```

- [ ] **Step 2: Verify the `organizations` table has a `name` column**

Run: `grep -n "name" supabase/migrations/002_consultant_matching.sql`
Expected: a `name text not null` line in the `create table organizations` block. If missing (column is named differently like `org_name` or `display_name`), adjust the `.select("name")` and `org.name` references accordingly. Document the actual column name in this step's commit message if it differs.

- [ ] **Step 3: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: No errors. The legacy `pptx-renderer` import is gone; `StyleGuide` import is gone (route no longer uses it). If TS complains about the legacy renderer being imported elsewhere, leave that for Task 5.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/bids/[id]/export/route.ts"
git commit -m "feat: switch bid export route to template-based renderer"
```

---

### Task 5: Delete legacy renderer files + tests

**Files:**
- Delete: `src/lib/pptx-renderer.ts`
- Delete: `src/lib/pptx/` (entire directory, 13 files)
- Delete: `src/lib/__tests__/pptx-constants.test.ts`
- Delete: `src/lib/__tests__/pptx-master.test.ts`
- Delete: `src/lib/__tests__/pptx-pagination.test.ts`
- Delete: `src/lib/__tests__/pptx-renderer.test.ts`

- [ ] **Step 1: Find any remaining importers of the legacy renderer**

Run: `grep -rn "from.*pptx-renderer\|from.*'@/lib/pptx'\|from.*\"\.\./pptx\"" src/`
Expected: No results. If any results appear, list them and STOP — those need migration before deletion. (At time of writing, only the export route imported it; that's already migrated in Task 4.)

- [ ] **Step 2: Delete the legacy renderer entry point**

Run: `rm src/lib/pptx-renderer.ts`

- [ ] **Step 3: Delete the legacy renderer directory**

Run: `rm -rf src/lib/pptx`

- [ ] **Step 4: Delete the legacy renderer tests**

Run: `rm src/lib/__tests__/pptx-constants.test.ts src/lib/__tests__/pptx-master.test.ts src/lib/__tests__/pptx-pagination.test.ts src/lib/__tests__/pptx-renderer.test.ts`

- [ ] **Step 5: Verify type-check + tests pass**

Run: `npx tsc --noEmit`
Expected: No errors.

Run: `npx vitest run`
Expected: All remaining tests pass. Test count drops by however many tests were in the 4 deleted files.

- [ ] **Step 6: Check if `pptxgenjs` is still needed**

Run: `grep -rn "from \"pptxgenjs\"\|require(\"pptxgenjs\")" src/ scripts/`
Expected: No results. If no results, remove the dependency:

```bash
npm uninstall pptxgenjs
```

If `pptxgenjs` is still referenced somewhere (e.g., a script we missed), leave it installed and note where in the commit.

- [ ] **Step 7: Commit**

```bash
git add -A src/lib/pptx-renderer.ts src/lib/pptx src/lib/__tests__/pptx-constants.test.ts src/lib/__tests__/pptx-master.test.ts src/lib/__tests__/pptx-pagination.test.ts src/lib/__tests__/pptx-renderer.test.ts package.json package-lock.json
git commit -m "chore: delete legacy pptxgenjs renderer + tests"
```

---

### Task 6: End-to-end visual verification

**Files:**
- Run: `scripts/generate-sample-pptx.ts`
- Run: `scripts/render-and-verify.ps1`
- Run: `scripts/compose-slide-grid.ps1`

This is a smoke test that the renderer pipeline still works and produces the same visual output as before legacy deletion.

- [ ] **Step 1: Regenerate the sample PPTX**

Run: `npx tsx scripts/generate-sample-pptx.ts`
Expected: `tmp/sample-bid.pptx` written, byte count printed.

- [ ] **Step 2: Render to PNG**

Run: `pwsh -File scripts/render-and-verify.ps1`
Expected: 17 PNGs in `tmp/slides-png/slide-NN.png`. Should take ~30s. Mockup is cached from prior runs.

- [ ] **Step 3: Compose grid for review**

Run: `pwsh -File scripts/compose-slide-grid.ps1`
Expected: `tmp/slides-png/composite.png` written. Open it (or Read it via the tool) and confirm:
- Slide 1: Cover with company + client + bid name + diary number + date
- Slides 2-17: All slides render without errors
- No regressions vs prior reference (pre-M1 grid)

- [ ] **Step 4: Manual gate — Stefan visual review**

Stop here and ask Stefan to confirm the composite looks correct before opening a PR. Do not auto-approve.

- [ ] **Step 5: Final commit + PR prep**

If Stefan approves, no extra commit needed (the previous tasks are atomic). If he requests visual fixes, add them as a separate commit before opening the PR.

```bash
git log --oneline main..HEAD
```

Expected: 5 commits (Tasks 1-5; Task 6 is verification only).

---

## Self-Review Checklist (run after writing — already done)

- **Spec coverage:**
  - Diarienummer extraction → Task 2 ✓
  - Diarienummer to MasterContext (not hardcoded) → Task 3 ✓
  - API route migration → Task 4 ✓
  - Delete legacy code → Task 5 ✓
  - Verify pipeline still works → Task 6 ✓

- **Placeholder scan:** No "TBD" / "TODO" / "implement later" / "similar to Task N" found.

- **Type consistency:**
  - `RfpAnalysis.diaryNumber` (Task 1) ↔ `analysis.diaryNumber` (Task 3) ↔ used by `buildMasterContext` ✓
  - `MasterContext` shape (Task 3) matches existing `src/lib/pptx-template/types.ts` (verified by reading the file)
  - `buildMasterContext` signature consistent across Tasks 3 and 4 ✓

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-19-m1-template-renderer-switch.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — Fresh subagent per task, two-stage review (spec → quality), fast iteration in this session.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
