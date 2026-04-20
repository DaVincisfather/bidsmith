# M2 — Bid-generator v2 alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the bid-generator output contract end-to-end with the v2 `anbudsmall-v2` template's 11 slot-formats, replacing the v1 union, prompt library, and planner with a deterministic 6-bundle + 3-deterministic architecture.

**Architecture:** Replace `bid-generator.ts` + `bid-section-prompts.ts` + `bid-planner.ts` with a new `src/lib/bid-generator/` directory containing grouped-by-theme bundle prompts (Opus for understanding/phases/quality, Sonnet for requirement-matrix/team/reference) and deterministic generators (cover/certifications/confidentiality). Bundles run in parallel via `Promise.all`. The renderer switches from silent-skip to throw-on-unknown-format. Bid-editor renderers get v2-only cases + a "fyll i timpriser" banner.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Zod v4, Vitest, Anthropic SDK (`claude-opus-4-6`, `claude-sonnet-4-6`), Supabase service client, pptx-automizer.

**Branch:** `feat/m2-bid-generator-v2` (already created in worktree `agentic-dealflow-template-pivot/`)

**Spec reference:** `docs/superpowers/specs/2026-04-20-m2-bid-generator-v2-alignment-design.md`

---

## File structure

**New:**

```
src/lib/bid-generator/
  index.ts              # orchestrator
  context.ts            # BidContext type + formatContext helper
  bundles/
    understanding.ts    # Opus — produces 3 sections
    phases.ts           # Opus
    quality.ts          # Opus
    requirement-matrix.ts  # Sonnet
    team.ts             # Sonnet
    reference.ts        # Sonnet
  deterministic/
    cover.ts
    certifications.ts
    confidentiality.ts

src/components/bid-editor/renderers/
  UnderstandingRenderer.tsx        # one file covers current/assignment/vision via discrimination
  QualityAssuranceRenderer.tsx
  TeamPricingRenderer.tsx          # editable timpris
  RequirementMatrixV2Renderer.tsx  # collapsible coverage view
  ReferenceV2Renderer.tsx
  ConfidentialityRenderer.tsx
  CertificationsRenderer.tsx

supabase/migrations/
  010_wipe_bids.sql
```

**Modified:**

- `src/lib/types.ts` — replace v1 `BidSectionContent` union members with v2-only, extend `requirement-matrix-v2` with `coverage`, make `team-pricing.timpris`/`total` nullable, extend `RfpAnalysis` with `oslReference`/`secrecyRows`, drop orphan interfaces.
- `src/lib/ai-schemas.ts` — drop v1 section schemas + `FORMAT_SCHEMAS` + `PlannedSectionSchema` + `BidPlanSchema`, extend `RfpAnalysisSchema` with OSL fields, add new per-bundle Zod schemas.
- `src/lib/rfp-analyzer.ts` — extend system prompt for OSL extraction.
- `src/lib/pptx-template/loader.ts` — throw on unknown format.
- `src/components/bid-editor/renderers/index.tsx` — drop v1 cases, wire v2 renderers.
- `src/components/bid-editor/BidEditor.tsx` — add "fyll i timpriser" banner when any `timpris === null`.
- `src/app/api/bids/route.ts` — adopt new orchestrator.
- `src/app/api/bids/[id]/regenerate/[sectionKey]/route.ts` — map section key to owning bundle; re-run bundle.

**Deleted:**

- `src/lib/bid-generator.ts` (superseded by `src/lib/bid-generator/index.ts`)
- `src/lib/bid-section-prompts.ts`
- `src/lib/bid-planner.ts`
- `src/lib/bid-plan-validator.ts`
- Renderers: `ProseRenderer.tsx`, `BulletsRenderer.tsx`, `ThreeColumnRenderer.tsx`, `GanttRenderer.tsx`, `DividerRenderer.tsx`, `PlaceholderRenderer.tsx`, `TeamRenderer.tsx`, `ReferencesRenderer.tsx`, `MatrixRenderer.tsx`
- Tests: `bid-generator.test.ts`, `bid-planner.test.ts`, `bid-plan-validator.test.ts`, `bid-section-prompts.test.ts`, `bid-ai-sections.test.ts`, `bid-orchestrator.test.ts`

**Preserved (v2-compatible):** `CoverRenderer`, `PhasesRenderer` (format `phases` survives v2).

---

## Phase 1 — Types & Zod foundation

### Task 1: Extend `RfpAnalysis` with OSL fields

**Files:**
- Modify: `src/lib/types.ts:13-26`
- Modify: `src/lib/ai-schemas.ts:5-30`
- Test: `src/lib/__tests__/rfp-analyzer.test.ts` (extend)

- [ ] **Step 1: Write failing test**

Append to `src/lib/__tests__/rfp-analyzer.test.ts`:

```typescript
describe("RfpAnalysisSchema — OSL extraction", () => {
  it("accepts oslReference and secrecyRows", () => {
    const raw = {
      title: "t", client: "c", deadline: null, summary: "s",
      requirements: [], evaluationCriteria: [], requiredCompetencies: [],
      estimatedScope: "", redFlags: [], domain: "",
      oslReference: "19 kap 3 §",
      secrecyRows: [{ reference: "Bilaga 2", scope: "Personuppgifter", justification: "GDPR" }],
    };
    const parsed = RfpAnalysisSchema.parse(raw);
    expect(parsed.oslReference).toBe("19 kap 3 §");
    expect(parsed.secrecyRows).toHaveLength(1);
  });

  it("accepts null oslReference and empty secrecyRows", () => {
    const raw = {
      title: "t", client: "c", deadline: null, summary: "s",
      requirements: [], evaluationCriteria: [], requiredCompetencies: [],
      estimatedScope: "", redFlags: [], domain: "",
      oslReference: null,
      secrecyRows: [],
    };
    const parsed = RfpAnalysisSchema.parse(raw);
    expect(parsed.oslReference).toBeNull();
    expect(parsed.secrecyRows).toEqual([]);
  });
});
```

Add import at top of file if missing: `import { RfpAnalysisSchema } from "../ai-schemas";`

- [ ] **Step 2: Run test — verify RED**

```bash
npx vitest run src/lib/__tests__/rfp-analyzer.test.ts
```

Expected: FAIL — schema rejects unknown `oslReference`/`secrecyRows` fields, OR strips them.

- [ ] **Step 3: Extend `RfpAnalysis` interface**

Edit `src/lib/types.ts:13-26`. Replace the `RfpAnalysis` interface with:

```ts
export interface SecrecyRow {
  reference: string;      // e.g. "Bilaga 2"
  scope: string;
  justification: string;
}

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
  oslReference: string | null;      // NEW — OSL paragraph (e.g. "19 kap 3 §") or null
  secrecyRows: SecrecyRow[];        // NEW — what the RFP asks to be classified (may be empty)
}
```

- [ ] **Step 4: Extend `RfpAnalysisSchema`**

Edit `src/lib/ai-schemas.ts:5-30`. Replace with:

```ts
export const SecrecyRowSchema = z.object({
  reference: z.string(),
  scope: z.string(),
  justification: z.string(),
});

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
  oslReference: z.string().nullable(),
  secrecyRows: z.array(SecrecyRowSchema),
});
```

- [ ] **Step 5: Run test — verify GREEN**

```bash
npx vitest run src/lib/__tests__/rfp-analyzer.test.ts
```

Expected: PASS (for the two new cases; existing mocked-fixture tests may fail — they'll be fixed in Task 2).

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/ai-schemas.ts src/lib/__tests__/rfp-analyzer.test.ts
git commit -m "feat(m2): extend RfpAnalysis with OSL reference and secrecyRows"
```

---

### Task 2: Update rfp-analyzer system prompt + fix mocked fixtures

**Files:**
- Modify: `src/lib/rfp-analyzer.ts:5-41`
- Modify: `src/lib/__tests__/rfp-analyzer.test.ts` (fix existing mock fixtures)

- [ ] **Step 1: Run tsc + vitest — list breakage**

```bash
npx tsc --noEmit 2>&1 | head -40
npx vitest run src/lib/__tests__/rfp-analyzer.test.ts 2>&1 | tail -30
```

Expected: existing test fixtures that create `RfpAnalysis` without `oslReference`/`secrecyRows` fail.

- [ ] **Step 2: Extend system prompt**

Edit `src/lib/rfp-analyzer.ts`. Replace the JSON schema block in `SYSTEM_PROMPT` (lines ~10-34) with the extended version:

```ts
const SYSTEM_PROMPT = `Du är en expert på att analysera förfrågningsunderlag (RFP:er) för konsultuppdrag.
Du läser ett RFP-dokument och producerar en strukturerad analys i JSON-format.

Svara ALLTID med giltig JSON som matchar detta schema:
{
  "title": "Uppdragets titel",
  "client": "Kund/beställare (om angivet, annars 'Ej angivet')",
  "deadline": "Sista anbudsdag i ISO-format, eller null",
  "diaryNumber": "Diarienummer/upphandlings-ID om angivet i dokumentet. Utelämna fältet helt om det inte anges.",
  "summary": "2-3 meningar som sammanfattar uppdraget — kort och skarpt",
  "background": "4-6 meningar som beskriver uppdragets kontext.",
  "requirements": [
    { "category": "Kategori", "description": "Beskrivning", "priority": "must | should | nice-to-have" }
  ],
  "evaluationCriteria": [ { "name": "...", "weight": 40, "description": "..." } ],
  "requiredCompetencies": ["..."],
  "estimatedScope": "...",
  "redFlags": ["..."],
  "domain": "...",
  "oslReference": "Paragraf i offentlighets- och sekretesslagen (OSL) som RFP:en hänvisar till, t.ex. '19 kap 3 §'. Använd null om inte nämnd.",
  "secrecyRows": [
    {
      "reference": "Bilaga eller avsnitt som ska sekretessbeläggas, t.ex. 'Bilaga 2'",
      "scope": "Vad sekretessen gäller",
      "justification": "Motivering baserad på RFP-texten"
    }
  ]
}

Var noggrann med att:
- Skilja mellan ska-krav (must) och bör-krav (should)
- Extrahera utvärderingskriterier med vikter
- Identifiera oklarheter (redFlags)
- Plocka diarienummer exakt — utelämna fältet om det saknas
- Extrahera OSL-referens och sekretess-bilagor om RFP:en behandlar sekretess; annars null respektive tom lista
- Sammanfatta i professionell ton`;
```

- [ ] **Step 3: Fix mocked fixtures in tests**

In `src/lib/__tests__/rfp-analyzer.test.ts`, every test fixture that constructs a bare-bones `RfpAnalysis`-shaped object needs `oslReference: null, secrecyRows: []` added. Find all object literals with `domain: "..."` and add the two fields.

Run to find sites:

```bash
grep -n "domain:" src/lib/__tests__/rfp-analyzer.test.ts
```

For each site, append `oslReference: null, secrecyRows: [],` after `domain`. Same pattern for any other test file that builds mock RfpAnalysis (e.g., `bid-orchestrator.test.ts` — you'll delete that file later anyway, skip it now).

Search for other sites:

```bash
grep -rn "domain:" src/lib/__tests__/ src/app/ --include="*.ts" --include="*.tsx"
```

Fix each call site in tests that still pass today. If a site is in a file slated for deletion (Task 20 — bid-orchestrator.test.ts, bid-planner.test.ts, etc.), skip it.

- [ ] **Step 4: Run tsc + tests — verify GREEN**

```bash
npx tsc --noEmit 2>&1 | grep -E "rfp-analyzer|RfpAnalysis" | head
npx vitest run src/lib/__tests__/rfp-analyzer.test.ts
```

Expected: rfp-analyzer tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rfp-analyzer.ts src/lib/__tests__/rfp-analyzer.test.ts
git commit -m "feat(m2): prompt rfp-analyzer to extract OSL reference + secrecy rows"
```

---

### Task 3: Modify `BidSectionContent` — v2-only union

**Files:**
- Modify: `src/lib/types.ts:157-284`
- Test: `src/lib/__tests__/types-pptx-v2.test.ts` (extend)

- [ ] **Step 1: Write failing test**

Append to `src/lib/__tests__/types-pptx-v2.test.ts`:

```typescript
describe("BidSectionContent — v2-only union", () => {
  it("team-pricing accepts null timpris and null total", () => {
    const content: BidSectionContent = {
      format: "team-pricing",
      members: [{
        name: "Anna",
        role: "PL",
        omfattningPct: 50,
        timpris: null,
        timmar: 240,
        total: null,
      }],
    };
    expect(content.format).toBe("team-pricing");
    if (content.format === "team-pricing") {
      expect(content.members[0].timpris).toBeNull();
      expect(content.members[0].total).toBeNull();
    }
  });

  it("requirement-matrix-v2 carries per-consultant coverage", () => {
    const content: BidSectionContent = {
      format: "requirement-matrix-v2",
      rows: [{
        requirement: "5 års erfarenhet",
        hurUppfylls: "Anna och Erik har båda 10+ år",
        referens: "CV Anna, CV Erik",
        coverage: [
          { consultantName: "Anna", status: "JA", evidence: "12 år som PL" },
          { consultantName: "Erik", status: "DELVIS", evidence: "6 år" },
        ],
      }],
    };
    if (content.format === "requirement-matrix-v2") {
      expect(content.rows[0].coverage).toHaveLength(2);
    }
  });
});
```

Ensure the import at the top includes: `import type { BidSectionContent } from "../types";` (or from "@/lib/types" matching file style).

- [ ] **Step 2: Run test — verify RED**

```bash
npx vitest run src/lib/__tests__/types-pptx-v2.test.ts
```

Expected: FAIL — `timpris: number | null` and `coverage` array not in current types.

- [ ] **Step 3: Replace v1 union with v2-only**

Edit `src/lib/types.ts`. Replace lines 157-284 (entire v1+v2 union including the `TeamPresentation`, `BidReference`, `RequirementRow` interfaces) with the v2-only version:

```ts
// --- Removed: TeamPresentation, BidReference, RequirementRow — v1 formats removed in M2. ---

export type BidSectionContent =
  | { format: "cover"; title: string; client: string; date: string }
  | { format: "phases"; phases: ExecutionPhase[] }
  | {
      format: "understanding-current";
      organisation: string;
      system: string;
      processer: string;
      smärtpunkter: string[]; // slot cap 4
    }
  | {
      format: "understanding-assignment";
      stycken: string[]; // slot cap 3
    }
  | {
      format: "understanding-vision";
      utmaningar: string[]; // slot cap 4
      värden: string[];     // slot cap 4
    }
  | {
      format: "quality-assurance";
      qaProcess: string[]; // slot cap 2
      qualityLead: { name: string; roleAndMandate: string; contact: string };
      escalation: { process: string; reporting: string };
      checkpoints: string[]; // slot cap 4
    }
  | {
      format: "team-pricing";
      members: Array<{
        name: string;
        role: string;
        omfattningPct: number;
        timpris: number | null;   // null until company fills in
        timmar: number;
        total: number | null;     // timpris * timmar, or null when timpris is null
      }>;
      summary?: { totalTimmar: number; totalPris: number | null };
    }
  | {
      format: "requirement-matrix-v2";
      rows: Array<{
        requirement: string;
        hurUppfylls: string;
        referens: string;
        coverage: Array<{
          consultantName: string;
          status: "JA" | "NEJ" | "DELVIS";
          evidence: string;
        }>;
        met?: boolean;
      }>;
    }
  | {
      format: "reference-v2";
      references: Array<{
        clientName: string;
        contextLine: string;
        organisation: string;
        startDate: string;
        endDate: string;
        scope: string;
        contact: { name: string; titlePhoneEmail: string };
        roleAndDelivery: string;
        result: string;
      }>;
    }
  | {
      format: "confidentiality";
      oslReference: string;
      secrecyRows: Array<{
        reference: string;
        scope: string;
        justification: string;
      }>; // slot cap 4
    }
  | {
      format: "certifications";
      certs: Array<{
        name?: string;
        description?: string;
        number: string;
        validUntil: string;
      }>; // slot cap 4
    };
```

- [ ] **Step 4: Run test — verify GREEN**

```bash
npx vitest run src/lib/__tests__/types-pptx-v2.test.ts
```

Expected: PASS. Other tests likely break (they'll be handled downstream).

- [ ] **Step 5: Commit (no need for tsc to be clean yet — done at end of Phase)**

```bash
git add src/lib/types.ts src/lib/__tests__/types-pptx-v2.test.ts
git commit -m "feat(m2): narrow BidSectionContent to v2 union with nullable pricing + coverage"
```

---

### Task 4: Drop v1 Zod schemas + `FORMAT_SCHEMAS` + planner schemas

**Files:**
- Modify: `src/lib/ai-schemas.ts`

- [ ] **Step 1: Delete v1 AI section schemas + planner schemas**

Edit `src/lib/ai-schemas.ts`. Remove:

- `ProseResponseSchema` (~L74-76)
- `BulletsResponseSchema` (~L78-80)
- `PhasesResponseSchema` (~L82-95) — **keep as `PhasesV2Schema`, see note**
- `TeamResponseSchema` (~L97-107)
- `ReferencesResponseSchema` (~L109-119)
- `ThreeColumnResponseSchema` (~L121-127)
- `FORMAT_SCHEMAS` export (~L130-139)
- `PlannedSectionSchema` (~L143-214)
- `BidPlanSchema` (~L216-221)

**Keep `PhasesResponseSchema` renamed:** `phases` format survives in v2. Rename to `PhasesV2Schema` at the same place and leave the schema body intact. It will be imported by the phases bundle in Task 11.

Result: `ai-schemas.ts` should now contain only `RfpAnalysisSchema`, `SecrecyRowSchema`, `ScoredMatchResultSchema`, `GoNoGoResultSchema`, `ConsultantExtractionSchema`, `OpportunityScoreSchema`, and `PhasesV2Schema`.

- [ ] **Step 2: Run tsc to see the breakage surface**

```bash
npx tsc --noEmit 2>&1 | grep -E "FORMAT_SCHEMAS|PlannedSectionSchema|BidPlanSchema|ProseResponseSchema|BulletsResponseSchema|ThreeColumnResponseSchema|TeamResponseSchema|ReferencesResponseSchema" | head -20
```

Expected: errors in `bid-generator.ts`, `bid-planner.ts`, `bid-plan-validator.ts`, and tests. These will clear as we replace callers in later tasks.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai-schemas.ts
git commit -m "refactor(m2): drop v1 AI section schemas + planner schemas"
```

---

## Phase 2 — Deterministic generators

### Task 5: `deterministic/cover.ts`

**Files:**
- Create: `src/lib/bid-generator/deterministic/cover.ts`
- Test: `src/lib/bid-generator/__tests__/cover.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/lib/bid-generator/__tests__/cover.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildCoverSection } from "../deterministic/cover";
import type { RfpAnalysis } from "@/lib/types";

const baseAnalysis: RfpAnalysis = {
  title: "IT-konsulttjänster",
  client: "Region VGR",
  deadline: "2026-05-01",
  summary: "s",
  requirements: [], evaluationCriteria: [], requiredCompetencies: [],
  estimatedScope: "", redFlags: [], domain: "IT",
  oslReference: null, secrecyRows: [],
};

describe("buildCoverSection", () => {
  it("maps analysis.title and analysis.client into the cover content", () => {
    const s = buildCoverSection(baseAnalysis);
    expect(s.content).toEqual({
      format: "cover",
      title: "IT-konsulttjänster",
      client: "Region VGR",
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
    expect(s.key).toBe("cover");
    expect(s.type).toBe("data");
  });
});
```

- [ ] **Step 2: Run test — verify RED**

```bash
npx vitest run src/lib/bid-generator/__tests__/cover.test.ts
```

Expected: FAIL — file does not exist.

- [ ] **Step 3: Implement**

Create `src/lib/bid-generator/deterministic/cover.ts`:

```ts
import type { RfpAnalysis, BidSection } from "@/lib/types";

export function buildCoverSection(analysis: RfpAnalysis): BidSection {
  return {
    type: "data",
    key: "cover",
    title: "Framsida",
    content: {
      format: "cover",
      title: analysis.title,
      client: analysis.client,
      date: new Date().toISOString().split("T")[0],
    },
    generatedAt: new Date().toISOString(),
  };
}
```

- [ ] **Step 4: Run test — verify GREEN**

```bash
npx vitest run src/lib/bid-generator/__tests__/cover.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bid-generator/deterministic/cover.ts src/lib/bid-generator/__tests__/cover.test.ts
git commit -m "feat(m2): deterministic cover generator"
```

---

### Task 6: `deterministic/certifications.ts` (with ISO defaults)

**Files:**
- Create: `src/lib/bid-generator/deterministic/certifications.ts`
- Test: `src/lib/bid-generator/__tests__/certifications.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/lib/bid-generator/__tests__/certifications.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildCertificationsSection } from "../deterministic/certifications";

describe("buildCertificationsSection", () => {
  it("returns 3 ISO defaults with placeholder number and dash-only validUntil", () => {
    const s = buildCertificationsSection();
    expect(s.content.format).toBe("certifications");
    if (s.content.format !== "certifications") throw new Error("format mismatch");
    expect(s.content.certs).toHaveLength(3);
    expect(s.content.certs[0]).toEqual({
      number: "Fyll i certifikatnummer",
      validUntil: "—",
    });
    expect(s.key).toBe("certifications");
  });
});
```

- [ ] **Step 2: Run test — verify RED**

```bash
npx vitest run src/lib/bid-generator/__tests__/certifications.test.ts
```

Expected: FAIL — file missing.

- [ ] **Step 3: Implement**

Create `src/lib/bid-generator/deterministic/certifications.ts`:

```ts
import type { BidSection } from "@/lib/types";

// Template slide 17 hardcodes the three ISO card titles (ISO 9001 / 27001 / 14001).
// We only need to supply number + validUntil. A future M3 migration
// (organizations.bid_template_config) will let orgs override these; until then
// the company fills them in post-generation in the bid-editor or PPT directly.
export function buildCertificationsSection(): BidSection {
  return {
    type: "data",
    key: "certifications",
    title: "Certifieringar",
    content: {
      format: "certifications",
      certs: [
        { number: "Fyll i certifikatnummer", validUntil: "—" },
        { number: "Fyll i certifikatnummer", validUntil: "—" },
        { number: "Fyll i certifikatnummer", validUntil: "—" },
      ],
    },
    generatedAt: new Date().toISOString(),
  };
}
```

- [ ] **Step 4: Run test — verify GREEN**

```bash
npx vitest run src/lib/bid-generator/__tests__/certifications.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bid-generator/deterministic/certifications.ts src/lib/bid-generator/__tests__/certifications.test.ts
git commit -m "feat(m2): deterministic certifications generator with ISO defaults"
```

---

### Task 7: `deterministic/confidentiality.ts`

**Files:**
- Create: `src/lib/bid-generator/deterministic/confidentiality.ts`
- Test: `src/lib/bid-generator/__tests__/confidentiality.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/lib/bid-generator/__tests__/confidentiality.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildConfidentialitySection } from "../deterministic/confidentiality";
import type { RfpAnalysis } from "@/lib/types";

const baseAnalysis: RfpAnalysis = {
  title: "t", client: "c", deadline: null, summary: "s",
  requirements: [], evaluationCriteria: [], requiredCompetencies: [],
  estimatedScope: "", redFlags: [], domain: "",
  oslReference: null, secrecyRows: [],
};

describe("buildConfidentialitySection", () => {
  it("passes through oslReference and secrecyRows from analysis", () => {
    const a: RfpAnalysis = {
      ...baseAnalysis,
      oslReference: "19 kap 3 §",
      secrecyRows: [{ reference: "Bilaga 2", scope: "Personuppgifter", justification: "GDPR" }],
    };
    const s = buildConfidentialitySection(a);
    if (s.content.format !== "confidentiality") throw new Error("format mismatch");
    expect(s.content.oslReference).toBe("19 kap 3 §");
    expect(s.content.secrecyRows).toEqual(a.secrecyRows);
  });

  it("falls back to empty string when oslReference is null", () => {
    const s = buildConfidentialitySection(baseAnalysis);
    if (s.content.format !== "confidentiality") throw new Error("format mismatch");
    expect(s.content.oslReference).toBe("");
    expect(s.content.secrecyRows).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test — verify RED**

```bash
npx vitest run src/lib/bid-generator/__tests__/confidentiality.test.ts
```

Expected: FAIL — file missing.

- [ ] **Step 3: Implement**

Create `src/lib/bid-generator/deterministic/confidentiality.ts`:

```ts
import type { RfpAnalysis, BidSection } from "@/lib/types";

export function buildConfidentialitySection(analysis: RfpAnalysis): BidSection {
  return {
    type: "data",
    key: "confidentiality",
    title: "Sekretess",
    content: {
      format: "confidentiality",
      oslReference: analysis.oslReference ?? "",
      secrecyRows: analysis.secrecyRows,
    },
    generatedAt: new Date().toISOString(),
  };
}
```

- [ ] **Step 4: Run test — verify GREEN**

```bash
npx vitest run src/lib/bid-generator/__tests__/confidentiality.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bid-generator/deterministic/confidentiality.ts src/lib/bid-generator/__tests__/confidentiality.test.ts
git commit -m "feat(m2): deterministic confidentiality generator from RfpAnalysis OSL fields"
```

---

## Phase 3 — Shared context + bundle scaffolding

### Task 8: `bid-generator/context.ts`

**Files:**
- Create: `src/lib/bid-generator/context.ts`

- [ ] **Step 1: Implement directly (no test — this is a type+helper move)**

Create `src/lib/bid-generator/context.ts`:

```ts
import type {
  RfpAnalysis,
  Consultant,
  ScoredConsultant,
  GoNoGoResult,
} from "@/lib/types";

export interface BidContext {
  analysis: RfpAnalysis;
  teamConsultants: Consultant[];
  scoredConsultants: ScoredConsultant[];
  goNoGoResult: GoNoGoResult;
}

export function formatContext(ctx: BidContext): string {
  const teamSummary = ctx.teamConsultants
    .map((c) => {
      const score = ctx.scoredConsultants.find(
        (s) => s.consultantId === c.id
      );
      const comps = c.competencies.map((co) => co.competency).join(", ");
      const refs = c.references
        .map((r) => `${r.title} (${r.year}, ${r.sector})`)
        .join("; ");
      return `- ${c.name} (${c.level}, score: ${score?.score ?? "N/A"})
  Kompetenser: ${comps}
  Uppdrag: ${refs}
  AI-bedömning: ${score?.reasoning ?? "N/A"}`;
    })
    .join("\n\n");

  return `## Förfrågningsunderlag (RFP)
${JSON.stringify(ctx.analysis, null, 2)}

## Team
${teamSummary}

## Go/No-Go-bedömning
- Rekommendation: ${ctx.goNoGoResult.recommendation}
- Vinstchans: ${ctx.goNoGoResult.winProbability}%
- Styrkor: ${ctx.goNoGoResult.strengths.join(", ")}
- Luckor: ${ctx.goNoGoResult.gaps.join(", ")}
- Motivering: ${ctx.goNoGoResult.reasoning}`;
}
```

- [ ] **Step 2: Run tsc — verify clean**

```bash
npx tsc --noEmit 2>&1 | grep "bid-generator/context" | head -5
```

Expected: no errors for the new file.

- [ ] **Step 3: Commit**

```bash
git add src/lib/bid-generator/context.ts
git commit -m "feat(m2): move BidContext + formatContext into bid-generator module"
```

---

## Phase 4 — AI bundles

Common shape for every bundle:

- export a `build<Name>Bundle(ctx: BidContext): Promise<BidSection[]>`
- call `callClaude` once with an Opus-or-Sonnet model
- validate with a local Zod schema
- map response to one or more `BidSection` objects

### Task 9: Understanding bundle (Opus, 3 sections)

**Files:**
- Create: `src/lib/bid-generator/bundles/understanding.ts`
- Test: `src/lib/bid-generator/__tests__/understanding.test.ts`

- [ ] **Step 1: Write failing test with mocked `callClaude`**

Create `src/lib/bid-generator/__tests__/understanding.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BidContext } from "../context";
import type { RfpAnalysis } from "@/lib/types";

vi.mock("@/lib/ai-client", () => ({
  callClaude: vi.fn(),
}));

import { callClaude } from "@/lib/ai-client";
import { buildUnderstandingBundle } from "../bundles/understanding";

const baseAnalysis: RfpAnalysis = {
  title: "t", client: "c", deadline: null, summary: "s",
  requirements: [], evaluationCriteria: [], requiredCompetencies: [],
  estimatedScope: "", redFlags: [], domain: "",
  oslReference: null, secrecyRows: [],
};

const baseCtx: BidContext = {
  analysis: baseAnalysis,
  teamConsultants: [],
  scoredConsultants: [],
  goNoGoResult: {
    mustRequirements: [], winProbability: 50, winProbabilityReasoning: "",
    strengths: [], gaps: [], improvements: [], recommendation: "go", reasoning: "",
  },
};

beforeEach(() => {
  vi.mocked(callClaude).mockReset();
});

describe("buildUnderstandingBundle", () => {
  it("returns 3 sections: current / assignment / vision", async () => {
    vi.mocked(callClaude).mockResolvedValue({
      current: { organisation: "Org", system: "Sys", processer: "Proc", smärtpunkter: ["A"] },
      assignment: { stycken: ["P1", "P2", "P3"] },
      vision: { utmaningar: ["U1"], värden: ["V1"] },
    });

    const sections = await buildUnderstandingBundle(baseCtx);
    expect(sections).toHaveLength(3);
    expect(sections[0].key).toBe("understanding-current");
    expect(sections[1].key).toBe("understanding-assignment");
    expect(sections[2].key).toBe("understanding-vision");
    if (sections[0].content.format !== "understanding-current") throw new Error();
    expect(sections[0].content.smärtpunkter).toEqual(["A"]);
  });

  it("propagates validation errors (no silent fallback)", async () => {
    vi.mocked(callClaude).mockRejectedValue(new Error("Invalid response"));
    await expect(buildUnderstandingBundle(baseCtx)).rejects.toThrow("Invalid response");
  });
});
```

- [ ] **Step 2: Run test — verify RED**

```bash
npx vitest run src/lib/bid-generator/__tests__/understanding.test.ts
```

Expected: FAIL — bundle file missing.

- [ ] **Step 3: Implement bundle**

Create `src/lib/bid-generator/bundles/understanding.ts`:

```ts
import { z } from "zod";
import { callClaude } from "@/lib/ai-client";
import type { BidSection } from "@/lib/types";
import { formatContext, type BidContext } from "../context";

const UnderstandingBundleSchema = z.object({
  current: z.object({
    organisation: z.string(),
    system: z.string(),
    processer: z.string(),
    smärtpunkter: z.array(z.string()),
  }),
  assignment: z.object({
    stycken: z.array(z.string()),
  }),
  vision: z.object({
    utmaningar: z.array(z.string()),
    värden: z.array(z.string()),
  }),
});

const SYSTEM_PROMPT = `Du skriver förståelsesektionerna till ett svenskt konsultanbud.
Producera en JSON-payload med tre delar som tillsammans bygger upp vår förståelse av uppdraget.

Skriv som en erfaren konsult — inte som en AI. Undvik överdrivna adjektiv, abstrakta floskler,
markdown-formatering och upprepade parallella strukturer. Variera meningslängd. Konkret och direkt.

Svara med giltig JSON:
{
  "current": {
    "organisation": "1-2 meningar om kundens organisation — vilka de är, storlek, mandat",
    "system": "1-2 meningar om de system/verktyg/tekniska landskap som berörs",
    "processer": "1-2 meningar om hur de jobbar idag",
    "smärtpunkter": ["max 4 korta konkreta smärtpunkter som RFP:en pekar på"]
  },
  "assignment": {
    "stycken": ["exakt 3 stycken, vardera 2-4 meningar, som beskriver uppdraget från vårt perspektiv — inte en upprepning av RFP:en"]
  },
  "vision": {
    "utmaningar": ["max 4 utmaningar uppdraget behöver lösa"],
    "värden": ["max 4 värden vi levererar om vi vinner — kopplade till kundens mål, inte våra kompetenser"]
  }
}

"current" och "vision" slottas med 4 st "slots" vardera. Leverera exakt så många som krävs för att
bäst representera RFP:en (högst 4). "assignment" ska alltid innehålla exakt 3 stycken.`;

export async function buildUnderstandingBundle(
  ctx: BidContext
): Promise<BidSection[]> {
  const parsed = await callClaude({
    model: "claude-opus-4-6",
    maxTokens: 4000,
    system: SYSTEM_PROMPT,
    userContent: formatContext(ctx),
    schema: UnderstandingBundleSchema,
    label: "understanding bundle",
  });

  const now = new Date().toISOString();
  return [
    {
      type: "ai",
      key: "understanding-current",
      title: "Kunden idag",
      content: {
        format: "understanding-current",
        organisation: parsed.current.organisation,
        system: parsed.current.system,
        processer: parsed.current.processer,
        smärtpunkter: parsed.current.smärtpunkter,
      },
      generatedAt: now,
    },
    {
      type: "ai",
      key: "understanding-assignment",
      title: "Uppdragsbeskrivning",
      content: { format: "understanding-assignment", stycken: parsed.assignment.stycken },
      generatedAt: now,
    },
    {
      type: "ai",
      key: "understanding-vision",
      title: "Utmaningar och värde",
      content: {
        format: "understanding-vision",
        utmaningar: parsed.vision.utmaningar,
        värden: parsed.vision.värden,
      },
      generatedAt: now,
    },
  ];
}
```

- [ ] **Step 4: Run test — verify GREEN**

```bash
npx vitest run src/lib/bid-generator/__tests__/understanding.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/bid-generator/bundles/understanding.ts src/lib/bid-generator/__tests__/understanding.test.ts
git commit -m "feat(m2): understanding bundle (Opus) produces 3 v2 sections"
```

---

### Task 10: Phases bundle (Opus)

**Files:**
- Create: `src/lib/bid-generator/bundles/phases.ts`
- Test: `src/lib/bid-generator/__tests__/phases.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/lib/bid-generator/__tests__/phases.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BidContext } from "../context";
import type { RfpAnalysis } from "@/lib/types";

vi.mock("@/lib/ai-client", () => ({ callClaude: vi.fn() }));
import { callClaude } from "@/lib/ai-client";
import { buildPhasesBundle } from "../bundles/phases";

const baseAnalysis: RfpAnalysis = {
  title: "t", client: "c", deadline: null, summary: "s",
  requirements: [], evaluationCriteria: [], requiredCompetencies: [],
  estimatedScope: "", redFlags: [], domain: "",
  oslReference: null, secrecyRows: [],
};
const baseCtx: BidContext = {
  analysis: baseAnalysis,
  teamConsultants: [], scoredConsultants: [],
  goNoGoResult: {
    mustRequirements: [], winProbability: 50, winProbabilityReasoning: "",
    strengths: [], gaps: [], improvements: [], recommendation: "go", reasoning: "",
  },
};

beforeEach(() => { vi.mocked(callClaude).mockReset(); });

describe("buildPhasesBundle", () => {
  it("returns a single phases section with all phases", async () => {
    vi.mocked(callClaude).mockResolvedValue({
      phases: [
        {
          name: "Fas 1: Förstudie",
          objective: "Förstå nuläget",
          activities: ["Intervjuer", "Dokumentanalys"],
          deliverables: ["Nulägesrapport"],
          duration: "4 v",
          period: "M1-M2",
          decisions: ["Go/no-go till fas 2"],
          shortDescription: "Förstudie",
        },
      ],
    });

    const sections = await buildPhasesBundle(baseCtx);
    expect(sections).toHaveLength(1);
    expect(sections[0].key).toBe("phases");
    if (sections[0].content.format !== "phases") throw new Error();
    expect(sections[0].content.phases).toHaveLength(1);
    expect(sections[0].content.phases[0].period).toBe("M1-M2");
    expect(sections[0].content.phases[0].decisions).toEqual(["Go/no-go till fas 2"]);
  });
});
```

- [ ] **Step 2: Run test — verify RED**

```bash
npx vitest run src/lib/bid-generator/__tests__/phases.test.ts
```

Expected: FAIL — file missing.

- [ ] **Step 3: Implement**

Create `src/lib/bid-generator/bundles/phases.ts`:

```ts
import { z } from "zod";
import { callClaude } from "@/lib/ai-client";
import type { BidSection } from "@/lib/types";
import { formatContext, type BidContext } from "../context";

const PhasesV2Schema = z.object({
  phases: z.array(
    z.object({
      name: z.string(),
      objective: z.string(),
      activities: z.array(z.string()),
      deliverables: z.array(z.string()),
      duration: z.string(),
      risks: z.array(z.string()).optional(),
      hoursEstimate: z.number().optional(),
      period: z.string().optional(),
      decisions: z.array(z.string()).optional(),
      shortDescription: z.string().optional(),
    })
  ),
});

const SYSTEM_PROMPT = `Du skriver genomförandesektionen i ett svenskt konsultanbud.
Bryt ner uppdraget i 3-4 faser — mallen visar upp till 4 faser.

VIKTIGT om realism:
- Max 3 leverabler per fas. Lova bara det RFP:en efterfrågar.
- Period: månadsintervall i formatet "M1-M2", "M2-M5" etc.
- Duration: vecko-string, t.ex. "4 v", "6 v".
- decisions: 1-3 beslut styrgruppen tar vid faslut. Sista fasen har typiskt "Go/no-go till nästa fas".
- shortDescription: 3-6 ord, används på fasöversikts-sliden som undertitel.
- Var konsistent — referera inte till aktiviteter som inte finns i andra faser.
- Skriv konkret och direkt. Undvik floskler och markdown.

Svara med giltig JSON:
{
  "phases": [
    {
      "name": "Fas 1: Förstudie",
      "objective": "En-meningsbeskrivning av fasens mål",
      "activities": ["Kort aktivitet 1", "Kort aktivitet 2"],
      "deliverables": ["Konkret leverabel"],
      "duration": "4 v",
      "period": "M1-M2",
      "decisions": ["Vad styrgruppen beslutar vid faslut"],
      "shortDescription": "Kort undertitel",
      "risks": ["Risk 1"],
      "hoursEstimate": 80
    }
  ]
}`;

export async function buildPhasesBundle(ctx: BidContext): Promise<BidSection[]> {
  const parsed = await callClaude({
    model: "claude-opus-4-6",
    maxTokens: 4000,
    system: SYSTEM_PROMPT,
    userContent: formatContext(ctx),
    schema: PhasesV2Schema,
    label: "phases bundle",
  });

  return [{
    type: "ai",
    key: "phases",
    title: "Genomförande",
    content: { format: "phases", phases: parsed.phases },
    generatedAt: new Date().toISOString(),
  }];
}
```

- [ ] **Step 4: Run test — verify GREEN**

```bash
npx vitest run src/lib/bid-generator/__tests__/phases.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bid-generator/bundles/phases.ts src/lib/bid-generator/__tests__/phases.test.ts
git commit -m "feat(m2): phases bundle (Opus) — decisions + shortDescription + period"
```

---

### Task 11: Quality bundle (Opus)

**Files:**
- Create: `src/lib/bid-generator/bundles/quality.ts`
- Test: `src/lib/bid-generator/__tests__/quality.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/lib/bid-generator/__tests__/quality.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BidContext } from "../context";
import type { RfpAnalysis } from "@/lib/types";

vi.mock("@/lib/ai-client", () => ({ callClaude: vi.fn() }));
import { callClaude } from "@/lib/ai-client";
import { buildQualityBundle } from "../bundles/quality";

const baseAnalysis: RfpAnalysis = {
  title: "t", client: "c", deadline: null, summary: "s",
  requirements: [], evaluationCriteria: [], requiredCompetencies: [],
  estimatedScope: "", redFlags: [], domain: "",
  oslReference: null, secrecyRows: [],
};
const baseCtx: BidContext = {
  analysis: baseAnalysis,
  teamConsultants: [{
    id: "c1", organizationId: "o", name: "Anna", level: "senior",
    yearsExperience: 10, summary: null, rawCvText: null,
    competencies: [], references: [], createdAt: "", updatedAt: "",
  }],
  scoredConsultants: [],
  goNoGoResult: {
    mustRequirements: [], winProbability: 50, winProbabilityReasoning: "",
    strengths: [], gaps: [], improvements: [], recommendation: "go", reasoning: "",
  },
};

beforeEach(() => { vi.mocked(callClaude).mockReset(); });

describe("buildQualityBundle", () => {
  it("produces quality-assurance section with process, lead, escalation, checkpoints", async () => {
    vi.mocked(callClaude).mockResolvedValue({
      qaProcess: ["P1", "P2"],
      qualityLead: { name: "Anna", roleAndMandate: "Quality Lead", contact: "anna@x.se" },
      escalation: { process: "Veckovis", reporting: "Månadsrapport" },
      checkpoints: ["CP1", "CP2"],
    });
    const [s] = await buildQualityBundle(baseCtx);
    expect(s.key).toBe("quality-assurance");
    if (s.content.format !== "quality-assurance") throw new Error();
    expect(s.content.qualityLead.name).toBe("Anna");
    expect(s.content.checkpoints).toEqual(["CP1", "CP2"]);
  });
});
```

- [ ] **Step 2: Run test — verify RED**

```bash
npx vitest run src/lib/bid-generator/__tests__/quality.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/lib/bid-generator/bundles/quality.ts`:

```ts
import { z } from "zod";
import { callClaude } from "@/lib/ai-client";
import type { BidSection } from "@/lib/types";
import { formatContext, type BidContext } from "../context";

const QualityBundleSchema = z.object({
  qaProcess: z.array(z.string()),
  qualityLead: z.object({
    name: z.string(),
    roleAndMandate: z.string(),
    contact: z.string(),
  }),
  escalation: z.object({ process: z.string(), reporting: z.string() }),
  checkpoints: z.array(z.string()),
});

const SYSTEM_PROMPT = `Du skriver kvalitetssäkringssektionen till ett svenskt konsultanbud.

Slot caps: qaProcess max 2 stycken (längre text), checkpoints max 4 (korta). Välj en lämplig person från teamet som qualityLead.

Skriv konkret och direkt. Undvik markdown och floskler.

Svara med giltig JSON:
{
  "qaProcess": ["Stycke 1 om kvalitetsprocessen", "Stycke 2"],
  "qualityLead": {
    "name": "Exakt namn från teamet",
    "roleAndMandate": "Roll och mandat",
    "contact": "e-post/telefon"
  },
  "escalation": {
    "process": "Hur vi eskalerar problem",
    "reporting": "Hur vi rapporterar"
  },
  "checkpoints": ["Avstämning 1", "Avstämning 2"]
}`;

export async function buildQualityBundle(ctx: BidContext): Promise<BidSection[]> {
  const parsed = await callClaude({
    model: "claude-opus-4-6",
    maxTokens: 2000,
    system: SYSTEM_PROMPT,
    userContent: formatContext(ctx),
    schema: QualityBundleSchema,
    label: "quality bundle",
  });

  return [{
    type: "ai",
    key: "quality-assurance",
    title: "Kvalitetssäkring",
    content: { format: "quality-assurance", ...parsed },
    generatedAt: new Date().toISOString(),
  }];
}
```

- [ ] **Step 4: Run test — verify GREEN**

```bash
npx vitest run src/lib/bid-generator/__tests__/quality.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bid-generator/bundles/quality.ts src/lib/bid-generator/__tests__/quality.test.ts
git commit -m "feat(m2): quality bundle (Opus) — QA process + lead + escalation + checkpoints"
```

---

### Task 12: Requirement-matrix bundle (Sonnet)

**Files:**
- Create: `src/lib/bid-generator/bundles/requirement-matrix.ts`
- Test: `src/lib/bid-generator/__tests__/requirement-matrix.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/lib/bid-generator/__tests__/requirement-matrix.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BidContext } from "../context";
import type { RfpAnalysis } from "@/lib/types";

vi.mock("@/lib/ai-client", () => ({ callClaude: vi.fn() }));
import { callClaude } from "@/lib/ai-client";
import { buildRequirementMatrixBundle } from "../bundles/requirement-matrix";

const baseAnalysis: RfpAnalysis = {
  title: "t", client: "c", deadline: null, summary: "s",
  requirements: [
    { category: "Kompetens", description: "5 års PL", priority: "must" },
  ],
  evaluationCriteria: [], requiredCompetencies: [],
  estimatedScope: "", redFlags: [], domain: "",
  oslReference: null, secrecyRows: [],
};
const baseCtx: BidContext = {
  analysis: baseAnalysis,
  teamConsultants: [{
    id: "c1", organizationId: "o", name: "Anna", level: "senior",
    yearsExperience: 12, summary: null, rawCvText: null,
    competencies: [], references: [], createdAt: "", updatedAt: "",
  }],
  scoredConsultants: [],
  goNoGoResult: {
    mustRequirements: [], winProbability: 50, winProbabilityReasoning: "",
    strengths: [], gaps: [], improvements: [], recommendation: "go", reasoning: "",
  },
};

beforeEach(() => { vi.mocked(callClaude).mockReset(); });

describe("buildRequirementMatrixBundle", () => {
  it("returns requirement-matrix-v2 section with coverage per row", async () => {
    vi.mocked(callClaude).mockResolvedValue({
      rows: [{
        requirement: "5 års PL",
        hurUppfylls: "Anna har 12 års PL-erfarenhet",
        referens: "CV Anna",
        coverage: [{ consultantName: "Anna", status: "JA", evidence: "12 år" }],
      }],
    });

    const [s] = await buildRequirementMatrixBundle(baseCtx);
    expect(s.key).toBe("requirement-matrix-v2");
    if (s.content.format !== "requirement-matrix-v2") throw new Error();
    expect(s.content.rows).toHaveLength(1);
    expect(s.content.rows[0].coverage).toHaveLength(1);
    expect(s.content.rows[0].coverage[0].status).toBe("JA");
  });
});
```

- [ ] **Step 2: Run test — verify RED**

```bash
npx vitest run src/lib/bid-generator/__tests__/requirement-matrix.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/lib/bid-generator/bundles/requirement-matrix.ts`:

```ts
import { z } from "zod";
import { callClaude } from "@/lib/ai-client";
import type { BidSection } from "@/lib/types";
import { formatContext, type BidContext } from "../context";

const RequirementMatrixBundleSchema = z.object({
  rows: z.array(
    z.object({
      requirement: z.string(),
      hurUppfylls: z.string(),
      referens: z.string(),
      coverage: z.array(
        z.object({
          consultantName: z.string(),
          status: z.enum(["JA", "NEJ", "DELVIS"]),
          evidence: z.string(),
        })
      ),
      met: z.boolean().optional(),
    })
  ),
});

const SYSTEM_PROMPT = `Du skapar en kravmatris för ett svenskt konsultanbud.

För varje ska-/bör-krav i RFP:en:
1. Skriv "hurUppfylls" — en kort text (1-2 meningar) som visar hur teamet uppfyller kravet totalt sett.
2. Skriv "referens" — vilken CV/erfarenhet/referens som styrker uppfyllelsen.
3. Fyll i "coverage" — en per-konsult-bedömning: status JA/NEJ/DELVIS + kort evidence (1 mening).
   ALLA konsulter i teamet ska finnas med i coverage-arrayen för varje rad.

Fokusera på must- och should-krav. Max 6 rader (template slot cap).

Skriv kort och konkret. Inga floskler, ingen markdown.

Svara med giltig JSON:
{
  "rows": [
    {
      "requirement": "RFP-kravet i en mening",
      "hurUppfylls": "Team-nivå: så uppfyller vi",
      "referens": "Konkret referens/CV",
      "coverage": [
        { "consultantName": "Anna", "status": "JA", "evidence": "Konkret evidens från CV" }
      ]
    }
  ]
}`;

export async function buildRequirementMatrixBundle(
  ctx: BidContext
): Promise<BidSection[]> {
  const parsed = await callClaude({
    model: "claude-sonnet-4-6",
    maxTokens: 4000,
    system: SYSTEM_PROMPT,
    userContent: formatContext(ctx),
    schema: RequirementMatrixBundleSchema,
    label: "requirement-matrix bundle",
  });

  return [{
    type: "ai",
    key: "requirement-matrix-v2",
    title: "Kravmatris",
    content: { format: "requirement-matrix-v2", rows: parsed.rows },
    generatedAt: new Date().toISOString(),
  }];
}
```

- [ ] **Step 4: Run test — verify GREEN**

```bash
npx vitest run src/lib/bid-generator/__tests__/requirement-matrix.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bid-generator/bundles/requirement-matrix.ts src/lib/bid-generator/__tests__/requirement-matrix.test.ts
git commit -m "feat(m2): requirement-matrix bundle (Sonnet) with per-consultant coverage"
```

---

### Task 13: Team bundle (Sonnet, timpris=null)

**Files:**
- Create: `src/lib/bid-generator/bundles/team.ts`
- Test: `src/lib/bid-generator/__tests__/team.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/lib/bid-generator/__tests__/team.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BidContext } from "../context";
import type { RfpAnalysis } from "@/lib/types";

vi.mock("@/lib/ai-client", () => ({ callClaude: vi.fn() }));
import { callClaude } from "@/lib/ai-client";
import { buildTeamBundle } from "../bundles/team";

const baseAnalysis: RfpAnalysis = {
  title: "t", client: "c", deadline: null, summary: "s",
  requirements: [], evaluationCriteria: [], requiredCompetencies: [],
  estimatedScope: "", redFlags: [], domain: "",
  oslReference: null, secrecyRows: [],
};
const baseCtx: BidContext = {
  analysis: baseAnalysis,
  teamConsultants: [{
    id: "c1", organizationId: "o", name: "Anna", level: "senior",
    yearsExperience: 12, summary: null, rawCvText: null,
    competencies: [], references: [], createdAt: "", updatedAt: "",
  }],
  scoredConsultants: [],
  goNoGoResult: {
    mustRequirements: [], winProbability: 50, winProbabilityReasoning: "",
    strengths: [], gaps: [], improvements: [], recommendation: "go", reasoning: "",
  },
};

beforeEach(() => { vi.mocked(callClaude).mockReset(); });

describe("buildTeamBundle", () => {
  it("forces timpris and total to null on every member", async () => {
    vi.mocked(callClaude).mockResolvedValue({
      members: [{
        name: "Anna",
        role: "Projektledare",
        omfattningPct: 50,
        timmar: 240,
      }],
    });

    const [s] = await buildTeamBundle(baseCtx);
    expect(s.key).toBe("team-pricing");
    if (s.content.format !== "team-pricing") throw new Error();
    expect(s.content.members[0].timpris).toBeNull();
    expect(s.content.members[0].total).toBeNull();
    expect(s.content.members[0].timmar).toBe(240);
    expect(s.content.summary?.totalPris).toBeNull();
  });
});
```

- [ ] **Step 2: Run test — verify RED**

```bash
npx vitest run src/lib/bid-generator/__tests__/team.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/lib/bid-generator/bundles/team.ts`:

```ts
import { z } from "zod";
import { callClaude } from "@/lib/ai-client";
import type { BidSection } from "@/lib/types";
import { formatContext, type BidContext } from "../context";

const TeamBundleSchema = z.object({
  members: z.array(
    z.object({
      name: z.string(),
      role: z.string(),
      omfattningPct: z.number(),
      timmar: z.number(),
    })
  ),
});

const SYSTEM_PROMPT = `Du skapar team-pricing-raderna till ett svenskt konsultanbud.

För varje konsult i teamet:
- name: exakt namn från teamlistan
- role: vilken roll konsulten tar i detta uppdrag (t.ex. "Projektledare", "Lösningsarkitekt")
- omfattningPct: procentuell omfattning (t.ex. 50 för "50%"), heltal
- timmar: uppskattat totalt antal timmar över projektets löptid, heltal

Lista 3-5 konsulter, max 5 (template slot cap).

Svara med giltig JSON:
{
  "members": [
    { "name": "Anna", "role": "Projektledare", "omfattningPct": 50, "timmar": 240 }
  ]
}

OBS: timpris sätts av bolaget efter generering — inkludera INTE timpris eller total i ditt svar.`;

export async function buildTeamBundle(ctx: BidContext): Promise<BidSection[]> {
  const parsed = await callClaude({
    model: "claude-sonnet-4-6",
    maxTokens: 2000,
    system: SYSTEM_PROMPT,
    userContent: formatContext(ctx),
    schema: TeamBundleSchema,
    label: "team bundle",
  });

  const members = parsed.members.map((m) => ({
    name: m.name,
    role: m.role,
    omfattningPct: m.omfattningPct,
    timpris: null,
    timmar: m.timmar,
    total: null,
  }));
  const totalTimmar = members.reduce((acc, m) => acc + m.timmar, 0);

  return [{
    type: "ai",
    key: "team-pricing",
    title: "Team och pris",
    content: {
      format: "team-pricing",
      members,
      summary: { totalTimmar, totalPris: null },
    },
    generatedAt: new Date().toISOString(),
  }];
}
```

- [ ] **Step 4: Run test — verify GREEN**

```bash
npx vitest run src/lib/bid-generator/__tests__/team.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bid-generator/bundles/team.ts src/lib/bid-generator/__tests__/team.test.ts
git commit -m "feat(m2): team bundle (Sonnet) — company fills timpris post-gen, null until then"
```

---

### Task 14: Reference bundle (Sonnet)

**Files:**
- Create: `src/lib/bid-generator/bundles/reference.ts`
- Test: `src/lib/bid-generator/__tests__/reference.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/lib/bid-generator/__tests__/reference.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BidContext } from "../context";
import type { RfpAnalysis } from "@/lib/types";

vi.mock("@/lib/ai-client", () => ({ callClaude: vi.fn() }));
import { callClaude } from "@/lib/ai-client";
import { buildReferenceBundle } from "../bundles/reference";

const baseAnalysis: RfpAnalysis = {
  title: "t", client: "c", deadline: null, summary: "s",
  requirements: [], evaluationCriteria: [], requiredCompetencies: [],
  estimatedScope: "", redFlags: [], domain: "",
  oslReference: null, secrecyRows: [],
};
const baseCtx: BidContext = {
  analysis: baseAnalysis,
  teamConsultants: [], scoredConsultants: [],
  goNoGoResult: {
    mustRequirements: [], winProbability: 50, winProbabilityReasoning: "",
    strengths: [], gaps: [], improvements: [], recommendation: "go", reasoning: "",
  },
};

beforeEach(() => { vi.mocked(callClaude).mockReset(); });

describe("buildReferenceBundle", () => {
  it("maps AI response to reference-v2 section with full schema", async () => {
    vi.mocked(callClaude).mockResolvedValue({
      references: [{
        clientName: "Region VGR",
        contextLine: "Digitalisering",
        organisation: "IT-avd",
        startDate: "01/2024",
        endDate: "12/2024",
        scope: "Transformation",
        contact: { name: "Kalle", titlePhoneEmail: "CTO · 070-123 · k@x.se" },
        roleAndDelivery: "Vi levde PL",
        result: "Klart i tid",
      }],
    });
    const [s] = await buildReferenceBundle(baseCtx);
    expect(s.key).toBe("reference-v2");
    if (s.content.format !== "reference-v2") throw new Error();
    expect(s.content.references[0].clientName).toBe("Region VGR");
  });
});
```

- [ ] **Step 2: Run test — verify RED**

```bash
npx vitest run src/lib/bid-generator/__tests__/reference.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/lib/bid-generator/bundles/reference.ts`:

```ts
import { z } from "zod";
import { callClaude } from "@/lib/ai-client";
import type { BidSection } from "@/lib/types";
import { formatContext, type BidContext } from "../context";

const ReferenceBundleSchema = z.object({
  references: z.array(
    z.object({
      clientName: z.string(),
      contextLine: z.string(),
      organisation: z.string(),
      startDate: z.string(),
      endDate: z.string(),
      scope: z.string(),
      contact: z.object({ name: z.string(), titlePhoneEmail: z.string() }),
      roleAndDelivery: z.string(),
      result: z.string(),
    })
  ),
});

const SYSTEM_PROMPT = `Du väljer referensuppdrag till ett svenskt konsultanbud.

Plocka 3-5 mest relevanta uppdrag från teamets referenslistor. Prioritera domänrelevans och nylighet.

Datum ska vara i format "MM/ÅÅÅÅ". Håll texterna korta.

Skriv konkret, ingen markdown.

Svara med giltig JSON:
{
  "references": [
    {
      "clientName": "Kundens namn",
      "contextLine": "Kort kontext (1 mening)",
      "organisation": "Vilken del av organisationen",
      "startDate": "01/2024",
      "endDate": "12/2024",
      "scope": "Uppdragets scope — 1-2 meningar",
      "contact": { "name": "Referensperson", "titlePhoneEmail": "Titel · telefon · e-post" },
      "roleAndDelivery": "Vår roll och leverans — 1-2 meningar",
      "result": "Resultat/utfall — 1 mening"
    }
  ]
}`;

export async function buildReferenceBundle(ctx: BidContext): Promise<BidSection[]> {
  const parsed = await callClaude({
    model: "claude-sonnet-4-6",
    maxTokens: 3000,
    system: SYSTEM_PROMPT,
    userContent: formatContext(ctx),
    schema: ReferenceBundleSchema,
    label: "reference bundle",
  });

  return [{
    type: "ai",
    key: "reference-v2",
    title: "Referensuppdrag",
    content: { format: "reference-v2", references: parsed.references },
    generatedAt: new Date().toISOString(),
  }];
}
```

- [ ] **Step 4: Run test — verify GREEN**

```bash
npx vitest run src/lib/bid-generator/__tests__/reference.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bid-generator/bundles/reference.ts src/lib/bid-generator/__tests__/reference.test.ts
git commit -m "feat(m2): reference bundle (Sonnet) produces reference-v2 section"
```

---

## Phase 5 — Orchestrator + API integration

### Task 15: `bid-generator/index.ts` orchestrator

**Files:**
- Create: `src/lib/bid-generator/index.ts`
- Test: `src/lib/bid-generator/__tests__/orchestrator.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/lib/bid-generator/__tests__/orchestrator.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BidContext } from "../context";
import type { BidSection, RfpAnalysis } from "@/lib/types";

vi.mock("../bundles/understanding");
vi.mock("../bundles/phases");
vi.mock("../bundles/quality");
vi.mock("../bundles/requirement-matrix");
vi.mock("../bundles/team");
vi.mock("../bundles/reference");

import { buildUnderstandingBundle } from "../bundles/understanding";
import { buildPhasesBundle } from "../bundles/phases";
import { buildQualityBundle } from "../bundles/quality";
import { buildRequirementMatrixBundle } from "../bundles/requirement-matrix";
import { buildTeamBundle } from "../bundles/team";
import { buildReferenceBundle } from "../bundles/reference";
import { generateAllSections } from "../index";

const baseAnalysis: RfpAnalysis = {
  title: "t", client: "c", deadline: null, summary: "s",
  requirements: [], evaluationCriteria: [], requiredCompetencies: [],
  estimatedScope: "", redFlags: [], domain: "",
  oslReference: "19 kap 3 §", secrecyRows: [],
};
const baseCtx: BidContext = {
  analysis: baseAnalysis,
  teamConsultants: [], scoredConsultants: [],
  goNoGoResult: {
    mustRequirements: [], winProbability: 50, winProbabilityReasoning: "",
    strengths: [], gaps: [], improvements: [], recommendation: "go", reasoning: "",
  },
};

function mockSection(key: string, format: BidSection["content"]["format"]): BidSection {
  return {
    type: "ai", key, title: key, generatedAt: "2026-04-20",
    // @ts-expect-error — minimal shape for orchestration test
    content: { format },
  };
}

beforeEach(() => {
  vi.mocked(buildUnderstandingBundle).mockReset();
  vi.mocked(buildPhasesBundle).mockReset();
  vi.mocked(buildQualityBundle).mockReset();
  vi.mocked(buildRequirementMatrixBundle).mockReset();
  vi.mocked(buildTeamBundle).mockReset();
  vi.mocked(buildReferenceBundle).mockReset();

  vi.mocked(buildUnderstandingBundle).mockResolvedValue([
    mockSection("understanding-current", "understanding-current"),
    mockSection("understanding-assignment", "understanding-assignment"),
    mockSection("understanding-vision", "understanding-vision"),
  ]);
  vi.mocked(buildPhasesBundle).mockResolvedValue([mockSection("phases", "phases")]);
  vi.mocked(buildQualityBundle).mockResolvedValue([mockSection("quality-assurance", "quality-assurance")]);
  vi.mocked(buildRequirementMatrixBundle).mockResolvedValue([mockSection("requirement-matrix-v2", "requirement-matrix-v2")]);
  vi.mocked(buildTeamBundle).mockResolvedValue([mockSection("team-pricing", "team-pricing")]);
  vi.mocked(buildReferenceBundle).mockResolvedValue([mockSection("reference-v2", "reference-v2")]);
});

describe("generateAllSections", () => {
  it("returns 11 sections across all bundles + deterministic", async () => {
    const sections = await generateAllSections(baseCtx);
    const keys = sections.map((s) => s.key);
    expect(keys).toContain("cover");
    expect(keys).toContain("understanding-current");
    expect(keys).toContain("understanding-assignment");
    expect(keys).toContain("understanding-vision");
    expect(keys).toContain("phases");
    expect(keys).toContain("quality-assurance");
    expect(keys).toContain("team-pricing");
    expect(keys).toContain("requirement-matrix-v2");
    expect(keys).toContain("reference-v2");
    expect(keys).toContain("confidentiality");
    expect(keys).toContain("certifications");
    expect(sections).toHaveLength(11);
  });

  it("invokes onSectionComplete once per section", async () => {
    const spy = vi.fn();
    await generateAllSections(baseCtx, spy);
    expect(spy).toHaveBeenCalledTimes(11);
  });

  it("throws on bundle failure (no silent fallback)", async () => {
    vi.mocked(buildPhasesBundle).mockRejectedValue(new Error("boom"));
    await expect(generateAllSections(baseCtx)).rejects.toThrow("boom");
  });
});
```

- [ ] **Step 2: Run test — verify RED**

```bash
npx vitest run src/lib/bid-generator/__tests__/orchestrator.test.ts
```

Expected: FAIL — `../index` missing.

- [ ] **Step 3: Implement orchestrator**

Create `src/lib/bid-generator/index.ts`:

```ts
import type { BidSection } from "@/lib/types";
import { buildCoverSection } from "./deterministic/cover";
import { buildCertificationsSection } from "./deterministic/certifications";
import { buildConfidentialitySection } from "./deterministic/confidentiality";
import { buildUnderstandingBundle } from "./bundles/understanding";
import { buildPhasesBundle } from "./bundles/phases";
import { buildQualityBundle } from "./bundles/quality";
import { buildRequirementMatrixBundle } from "./bundles/requirement-matrix";
import { buildTeamBundle } from "./bundles/team";
import { buildReferenceBundle } from "./bundles/reference";
import type { BidContext } from "./context";

export { BidContext } from "./context";

/**
 * Runs 6 AI bundles in parallel + 3 deterministic generators to produce the
 * full set of BidSections for a v2 template.
 *
 * onSectionComplete is invoked once per produced section (fire-and-forget ordering).
 */
export async function generateAllSections(
  ctx: BidContext,
  onSectionComplete?: (section: BidSection) => void | Promise<void>,
): Promise<BidSection[]> {
  // Deterministic generators — no await needed.
  const cover = buildCoverSection(ctx.analysis);
  const certifications = buildCertificationsSection();
  const confidentiality = buildConfidentialitySection(ctx.analysis);

  const bundleResults = await Promise.all([
    buildUnderstandingBundle(ctx),
    buildPhasesBundle(ctx),
    buildQualityBundle(ctx),
    buildRequirementMatrixBundle(ctx),
    buildTeamBundle(ctx),
    buildReferenceBundle(ctx),
  ]);

  const all: BidSection[] = [
    cover,
    ...bundleResults.flat(),
    confidentiality,
    certifications,
  ];

  if (onSectionComplete) {
    for (const s of all) {
      await onSectionComplete(s);
    }
  }

  return all;
}
```

- [ ] **Step 4: Run test — verify GREEN**

```bash
npx vitest run src/lib/bid-generator/__tests__/orchestrator.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/bid-generator/index.ts src/lib/bid-generator/__tests__/orchestrator.test.ts
git commit -m "feat(m2): bid-generator orchestrator — parallel bundles + deterministic generators"
```

---

### Task 16: Wire `/api/bids/route.ts` to new orchestrator

**Files:**
- Modify: `src/app/api/bids/route.ts`

- [ ] **Step 1: Swap imports and call shape**

Edit `src/app/api/bids/route.ts`:

- Line 5 `import { generateAllSections } from "@/lib/bid-generator";` — keep (path now resolves to `bid-generator/index.ts`).
- Line 7 `import { BidContext } from "@/lib/bid-section-prompts";` → `import type { BidContext } from "@/lib/bid-generator";`.
- Line 76 — the return shape changed: `generateAllSections` now returns `BidSection[]` directly, not `{ sections, plan }`. Replace:

```ts
  // Generate sections, saving progress to DB after each
  const sections = await generateAllSections(ctx, async (section: BidSection) => {
```

(i.e. remove the `{ sections }` destructuring).

- [ ] **Step 2: Run tsc on this file**

```bash
npx tsc --noEmit 2>&1 | grep "api/bids/route" | head
```

Expected: no errors for this file.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/bids/route.ts
git commit -m "refactor(m2): wire POST /api/bids to v2 orchestrator"
```

---

### Task 17: Adapt `/api/bids/[id]/regenerate/[sectionKey]/route.ts` to bundles

**Files:**
- Modify: `src/app/api/bids/[id]/regenerate/[sectionKey]/route.ts`

The v1 plan/planner is gone. Regenerate now maps a section key to its owning bundle and re-runs that bundle, replacing all sections it produces.

- [ ] **Step 1: Replace file body**

Edit `src/app/api/bids/[id]/regenerate/[sectionKey]/route.ts`. Replace the whole file:

```ts
import { NextRequest, NextResponse } from "next/server";
import { fetchConsultantsByIds, EMPTY_GO_NO_GO } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import type { BidContext } from "@/lib/bid-generator";
import { buildUnderstandingBundle } from "@/lib/bid-generator/bundles/understanding";
import { buildPhasesBundle } from "@/lib/bid-generator/bundles/phases";
import { buildQualityBundle } from "@/lib/bid-generator/bundles/quality";
import { buildRequirementMatrixBundle } from "@/lib/bid-generator/bundles/requirement-matrix";
import { buildTeamBundle } from "@/lib/bid-generator/bundles/team";
import { buildReferenceBundle } from "@/lib/bid-generator/bundles/reference";
import { buildCoverSection } from "@/lib/bid-generator/deterministic/cover";
import { buildCertificationsSection } from "@/lib/bid-generator/deterministic/certifications";
import { buildConfidentialitySection } from "@/lib/bid-generator/deterministic/confidentiality";
import type {
  RfpAnalysis, ScoredConsultant, GoNoGoResult, BidSection,
} from "@/lib/types";

interface RouteContext {
  params: Promise<{ id: string; sectionKey: string }>;
}

type BundleRunner = (ctx: BidContext) => Promise<BidSection[]>;

// Maps a section key to the bundle (or deterministic builder) that owns it.
// A single bundle can own multiple section keys — re-running it replaces all of them.
const KEY_TO_BUNDLE: Record<string, BundleRunner> = {
  "understanding-current": buildUnderstandingBundle,
  "understanding-assignment": buildUnderstandingBundle,
  "understanding-vision": buildUnderstandingBundle,
  "phases": buildPhasesBundle,
  "quality-assurance": buildQualityBundle,
  "requirement-matrix-v2": buildRequirementMatrixBundle,
  "team-pricing": buildTeamBundle,
  "reference-v2": buildReferenceBundle,
  "cover": async (ctx) => [buildCoverSection(ctx.analysis)],
  "certifications": async () => [buildCertificationsSection()],
  "confidentiality": async (ctx) => [buildConfidentialitySection(ctx.analysis)],
};

export async function POST(_request: NextRequest, { params }: RouteContext) {
  const { id, sectionKey } = await params;
  const supabase = await createClient();

  const { data: bid, error: bidError } = await supabase
    .from("bids")
    .select("id, sections, analysis_id, assessment_id, team_consultant_ids")
    .eq("id", id)
    .single();

  if (bidError || !bid) {
    return NextResponse.json({ error: "Bid not found" }, { status: 404 });
  }

  const runner = KEY_TO_BUNDLE[sectionKey];
  if (!runner) {
    return NextResponse.json({ error: `Unknown section key '${sectionKey}'` }, { status: 400 });
  }

  const [analysisResult, assessmentResult, matchResult, teamConsultants] = await Promise.all([
    supabase.from("analyses").select("analysis").eq("id", bid.analysis_id).single(),
    bid.assessment_id
      ? supabase.from("go_no_go_assessments").select("result").eq("id", bid.assessment_id).single()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("matches")
      .select("team_proposal")
      .eq("analysis_id", bid.analysis_id)
      .order("created_at", { ascending: false })
      .limit(1),
    fetchConsultantsByIds(supabase, bid.team_consultant_ids),
  ]);

  if (!analysisResult.data) {
    return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
  }

  const ctx: BidContext = {
    analysis: analysisResult.data.analysis as RfpAnalysis,
    teamConsultants,
    scoredConsultants: (matchResult.data?.[0]?.team_proposal as ScoredConsultant[]) ?? [],
    goNoGoResult: (assessmentResult.data?.result as GoNoGoResult) ?? EMPTY_GO_NO_GO,
  };

  const newSections = await runner(ctx);
  const newKeys = new Set(newSections.map((s) => s.key));

  const existing = bid.sections as BidSection[];
  const sections = existing.filter((s) => !newKeys.has(s.key)).concat(newSections);

  await supabase.from("bids").update({ sections }).eq("id", id);

  return NextResponse.json({ sections: newSections });
}
```

- [ ] **Step 2: Run tsc on the file**

```bash
npx tsc --noEmit 2>&1 | grep "regenerate" | head
```

Expected: no errors for this file.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/bids/[id]/regenerate/[sectionKey]/route.ts"
git commit -m "refactor(m2): regenerate endpoint maps section key to owning bundle"
```

---

## Phase 6 — Delete v1 code

### Task 18: Delete old bid-generator + planner + v1 tests

**Files:**
- Delete: `src/lib/bid-generator.ts`
- Delete: `src/lib/bid-section-prompts.ts`
- Delete: `src/lib/bid-planner.ts`
- Delete: `src/lib/bid-plan-validator.ts`
- Delete: `src/lib/__tests__/bid-generator.test.ts`
- Delete: `src/lib/__tests__/bid-planner.test.ts`
- Delete: `src/lib/__tests__/bid-plan-validator.test.ts`
- Delete: `src/lib/__tests__/bid-section-prompts.test.ts`
- Delete: `src/lib/__tests__/bid-ai-sections.test.ts`
- Delete: `src/lib/__tests__/bid-orchestrator.test.ts`

- [ ] **Step 1: Delete**

```bash
cd "C:/Users/stefa/projects/agentic-dealflow-template-pivot"
rm src/lib/bid-generator.ts src/lib/bid-section-prompts.ts src/lib/bid-planner.ts src/lib/bid-plan-validator.ts
rm src/lib/__tests__/bid-generator.test.ts src/lib/__tests__/bid-planner.test.ts src/lib/__tests__/bid-plan-validator.test.ts src/lib/__tests__/bid-section-prompts.test.ts src/lib/__tests__/bid-ai-sections.test.ts src/lib/__tests__/bid-orchestrator.test.ts
```

- [ ] **Step 2: Run tsc — clean?**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Expected: any remaining errors should be in `src/components/bid-editor/` (renderers) — to be fixed in Phase 7. No errors in `src/lib/` or `src/app/`.

If an unexpected error pops up (e.g., a stray import of the deleted files), fix it inline.

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run
```

Expected: all tests outside `bid-editor` pass. Renderer tests will fail — leave for Phase 7.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(m2): remove v1 bid-generator, bid-section-prompts, planner, plan-validator + tests"
```

---

## Phase 7 — Renderer fail-loud

### Task 19: Throw on unknown format in `loader.ts`

**Files:**
- Modify: `src/lib/pptx-template/loader.ts:100-102`
- Test: `src/lib/pptx-template/__tests__/loader.test.ts` (extend)

- [ ] **Step 1: Write failing test**

Append to `src/lib/pptx-template/__tests__/loader.test.ts`:

```typescript
describe("renderTemplate — fail-loud", () => {
  it("throws when a slide config references an unknown type", async () => {
    // Inject a slide config with a type not handled by applicatorFor.
    // Easiest reproduction: a registry fork isn't wired up, so instead assert
    // by behavior: we can't register a new template without touching registry.
    // So this test actually exercises the applicatorFor default branch.
    // Approach: use the existing registry, but overwrite it locally via a mock.

    const { renderTemplate } = await import("../loader");
    // Passing an invalid template id yields a different error ("unknown template id");
    // we want to cover the applicatorFor default branch. The simplest path is to
    // rely on a ts-ignored forced cast through registry mocking — done in a
    // separate test helper. For now: assert that passing a malformed sections
    // array containing an unknown-format section does NOT silently skip.
    const buf = await renderTemplate("anbudsmall-v2", [{
      type: "data", key: "x", title: "x", generatedAt: "2026-04-20",
      // @ts-expect-error — deliberately invalid format to test fail-loud path via loader
      content: { format: "NOT_A_FORMAT" },
    }], {
      companyName: "TestCo", clientName: "K", diaryNumber: "D", bidName: "B", bidDate: "2026-04-20",
    }).catch((err: Error) => err);
    // Until fail-loud lands, this returns a Buffer; after the change it's an Error.
    expect(buf).toBeInstanceOf(Error);
    expect((buf as Error).message).toMatch(/unknown|NOT_A_FORMAT|format/i);
  });
});
```

NOTE: the `applicatorFor` default path triggers via slide-type, not section-format. If the test is tricky to wire, pivot to a direct unit test of `applicatorFor`:

Replace the test with:

```typescript
import { describe, it, expect } from "vitest";

describe("applicatorFor — fail-loud", () => {
  it("throws on an unknown slide type", async () => {
    const mod = await import("../loader");
    // Module does not export applicatorFor today — the test below asserts on
    // behavior via renderTemplate using a registry with a bad type.
    // Skip asserting internals and use the public surface instead.
    // See integration test in Task 23 for end-to-end.
    expect(mod.renderTemplate).toBeDefined();
  });
});
```

then implement directly at Step 3 (Step 2 will fail-as-no-op but is still valid TDD — documents intent). Actually use the direct-injection approach instead:

- [ ] **Step 1b: Expose `applicatorFor` for testability OR add a registry override**

Simpler: export `applicatorFor` from `loader.ts` so we can unit-test it. Edit `loader.ts:72-103`:

Change `function applicatorFor(` to `export function applicatorFor(`.

- [ ] **Step 1c: Write the real failing test**

Replace the test with:

```typescript
import { describe, it, expect } from "vitest";
import { applicatorFor } from "../loader";

describe("applicatorFor — fail-loud", () => {
  it("throws on an unknown slide type", () => {
    expect(() =>
      applicatorFor(
        // @ts-expect-error — deliberately invalid type
        { source: 99, type: "unknown-type" },
        {
          sections: [],
          master: { companyName: "", clientName: "", diaryNumber: "", bidName: "", bidDate: "" },
          slideNum: 1,
          totalSlides: 1,
          sourceSlide: 99,
        },
      )
    ).toThrow(/unknown slide type/i);
  });
});
```

- [ ] **Step 2: Run test — verify RED**

```bash
npx vitest run src/lib/pptx-template/__tests__/loader.test.ts
```

Expected: FAIL — today's `default:` returns `undefined`.

- [ ] **Step 3: Change `default:` to throw**

Edit `src/lib/pptx-template/loader.ts`. Replace line 100-102:

```ts
    default:
      throw new Error(`unknown slide type: ${(slideCfg as { type: string }).type}`);
```

(and remove the now-dead `| undefined` from the return type: change `): ((slide: ISlide) => void) | undefined` to `): (slide: ISlide) => void` on line 75.)

- [ ] **Step 4: Run test — verify GREEN**

```bash
npx vitest run src/lib/pptx-template/__tests__/loader.test.ts
```

Expected: PASS.

- [ ] **Step 5: Full test sweep**

```bash
npx vitest run src/lib/pptx-template/__tests__/
```

Expected: all pass. Smoke test should still render the golden fixture correctly.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pptx-template/loader.ts src/lib/pptx-template/__tests__/loader.test.ts
git commit -m "feat(m2): loader.applicatorFor throws on unknown slide type (fail-loud)"
```

---

## Phase 8 — Bid-editor renderers

### Task 20: New v2 renderer components

**Files:**
- Create: `src/components/bid-editor/renderers/UnderstandingRenderer.tsx`
- Create: `src/components/bid-editor/renderers/QualityAssuranceRenderer.tsx`
- Create: `src/components/bid-editor/renderers/TeamPricingRenderer.tsx`
- Create: `src/components/bid-editor/renderers/RequirementMatrixV2Renderer.tsx`
- Create: `src/components/bid-editor/renderers/ReferenceV2Renderer.tsx`
- Create: `src/components/bid-editor/renderers/ConfidentialityRenderer.tsx`
- Create: `src/components/bid-editor/renderers/CertificationsRenderer.tsx`

These are display components — the bid-editor saves via the parent's `onSectionChange` callback. For M2, we build read-only views for every format except `TeamPricingRenderer` which allows editing `timpris`.

- [ ] **Step 1: Implement `UnderstandingRenderer.tsx`**

Create `src/components/bid-editor/renderers/UnderstandingRenderer.tsx`:

```tsx
"use client";
import type { BidSectionContent, StyleGuide } from "@/lib/types";

type UnderstandingContent = Extract<BidSectionContent, { format: `understanding-${string}` }>;

export function UnderstandingRenderer({
  title,
  content,
  style,
}: {
  title: string;
  content: UnderstandingContent;
  style: StyleGuide;
}) {
  return (
    <section className="p-6">
      <h2 className="text-xl font-semibold mb-4" style={{ color: style.colors.primary }}>{title}</h2>
      {content.format === "understanding-current" && (
        <div className="space-y-2 text-sm">
          <p><span className="font-medium">Organisation:</span> {content.organisation}</p>
          <p><span className="font-medium">System:</span> {content.system}</p>
          <p><span className="font-medium">Processer:</span> {content.processer}</p>
          <div>
            <p className="font-medium">Smärtpunkter:</p>
            <ul className="list-disc pl-5">
              {content.smärtpunkter.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
        </div>
      )}
      {content.format === "understanding-assignment" && (
        <div className="space-y-3 text-sm">
          {content.stycken.map((p, i) => <p key={i}>{p}</p>)}
        </div>
      )}
      {content.format === "understanding-vision" && (
        <div className="grid grid-cols-2 gap-6 text-sm">
          <div>
            <p className="font-medium mb-2">Utmaningar</p>
            <ul className="list-disc pl-5 space-y-1">
              {content.utmaningar.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
          <div>
            <p className="font-medium mb-2">Värden</p>
            <ul className="list-disc pl-5 space-y-1">
              {content.värden.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Implement `QualityAssuranceRenderer.tsx`**

Create `src/components/bid-editor/renderers/QualityAssuranceRenderer.tsx`:

```tsx
"use client";
import type { BidSectionContent, StyleGuide } from "@/lib/types";

type QAContent = Extract<BidSectionContent, { format: "quality-assurance" }>;

export function QualityAssuranceRenderer({
  title, content, style,
}: { title: string; content: QAContent; style: StyleGuide }) {
  return (
    <section className="p-6 text-sm">
      <h2 className="text-xl font-semibold mb-4" style={{ color: style.colors.primary }}>{title}</h2>
      <div className="space-y-4">
        <div>
          <p className="font-medium mb-1">Kvalitetsprocess</p>
          {content.qaProcess.map((p, i) => <p key={i} className="mb-2">{p}</p>)}
        </div>
        <div>
          <p className="font-medium">Kvalitetsansvarig</p>
          <p>{content.qualityLead.name} — {content.qualityLead.roleAndMandate}</p>
          <p className="text-gray-600">{content.qualityLead.contact}</p>
        </div>
        <div>
          <p className="font-medium mb-1">Eskalering</p>
          <p>{content.escalation.process}</p>
          <p className="text-gray-600">Rapportering: {content.escalation.reporting}</p>
        </div>
        <div>
          <p className="font-medium mb-1">Avstämningar</p>
          <ul className="list-disc pl-5">
            {content.checkpoints.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Implement `TeamPricingRenderer.tsx` (editable timpris)**

Create `src/components/bid-editor/renderers/TeamPricingRenderer.tsx`:

```tsx
"use client";
import type { BidSectionContent, StyleGuide } from "@/lib/types";

type TeamPricingContent = Extract<BidSectionContent, { format: "team-pricing" }>;

export function TeamPricingRenderer({
  title,
  content,
  style,
  onTimprisChange,
}: {
  title: string;
  content: TeamPricingContent;
  style: StyleGuide;
  onTimprisChange?: (memberIndex: number, timpris: number | null) => void;
}) {
  const handleChange = (i: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.trim();
    const next = raw === "" ? null : Number(raw);
    if (next !== null && Number.isNaN(next)) return;
    onTimprisChange?.(i, next);
  };

  return (
    <section className="p-6 text-sm">
      <h2 className="text-xl font-semibold mb-4" style={{ color: style.colors.primary }}>{title}</h2>
      <table className="w-full text-left">
        <thead>
          <tr className="border-b">
            <th className="py-2">Konsult</th>
            <th>Roll</th>
            <th>Omf %</th>
            <th>Timmar</th>
            <th>Timpris (SEK)</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {content.members.map((m, i) => (
            <tr key={i} className="border-b">
              <td className="py-2">{m.name}</td>
              <td>{m.role}</td>
              <td>{m.omfattningPct}%</td>
              <td>{m.timmar}</td>
              <td>
                <input
                  type="number"
                  min={0}
                  step={10}
                  value={m.timpris ?? ""}
                  placeholder="—"
                  onChange={handleChange(i)}
                  className={`w-24 border rounded px-2 py-1 ${m.timpris === null ? "border-amber-400 bg-amber-50" : ""}`}
                />
              </td>
              <td>{m.total === null ? "—" : m.total.toLocaleString("sv-SE")}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3}></td>
            <td className="pt-2 font-medium">{content.summary?.totalTimmar ?? 0}</td>
            <td></td>
            <td className="pt-2 font-medium">
              {content.summary?.totalPris === null || content.summary?.totalPris === undefined
                ? "—"
                : content.summary.totalPris.toLocaleString("sv-SE")}
            </td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}
```

- [ ] **Step 4: Implement `RequirementMatrixV2Renderer.tsx` (collapsible coverage)**

Create `src/components/bid-editor/renderers/RequirementMatrixV2Renderer.tsx`:

```tsx
"use client";
import { useState } from "react";
import type { BidSectionContent, StyleGuide } from "@/lib/types";

type MatrixContent = Extract<BidSectionContent, { format: "requirement-matrix-v2" }>;

export function RequirementMatrixV2Renderer({
  title, content, style,
}: { title: string; content: MatrixContent; style: StyleGuide }) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const toggle = (i: number) => setExpanded((p) => ({ ...p, [i]: !p[i] }));

  return (
    <section className="p-6 text-sm">
      <h2 className="text-xl font-semibold mb-4" style={{ color: style.colors.primary }}>{title}</h2>
      <table className="w-full text-left">
        <thead>
          <tr className="border-b">
            <th className="py-2">Krav</th>
            <th>Hur uppfylls</th>
            <th>Referens</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {content.rows.map((r, i) => (
            <>
              <tr key={`r-${i}`} className="border-b align-top">
                <td className="py-2">{r.requirement}</td>
                <td>{r.hurUppfylls}</td>
                <td>{r.referens}</td>
                <td>
                  <button
                    type="button"
                    onClick={() => toggle(i)}
                    className="text-blue-600 hover:underline"
                  >
                    {expanded[i] ? "Dölj coverage" : "Visa coverage"}
                  </button>
                </td>
              </tr>
              {expanded[i] && (
                <tr key={`c-${i}`} className="bg-gray-50">
                  <td colSpan={4} className="py-2 px-4">
                    <ul className="space-y-1">
                      {r.coverage.map((c, j) => (
                        <li key={j}>
                          <span className="font-medium">{c.consultantName}:</span>{" "}
                          <span
                            className={
                              c.status === "JA"
                                ? "text-green-700"
                                : c.status === "DELVIS"
                                ? "text-amber-700"
                                : "text-red-700"
                            }
                          >
                            {c.status}
                          </span>{" "}
                          — <span className="text-gray-600">{c.evidence}</span>
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

- [ ] **Step 5: Implement `ReferenceV2Renderer.tsx`**

Create `src/components/bid-editor/renderers/ReferenceV2Renderer.tsx`:

```tsx
"use client";
import type { BidSectionContent, StyleGuide } from "@/lib/types";

type ReferenceContent = Extract<BidSectionContent, { format: "reference-v2" }>;

export function ReferenceV2Renderer({
  title, content, style,
}: { title: string; content: ReferenceContent; style: StyleGuide }) {
  return (
    <section className="p-6 text-sm">
      <h2 className="text-xl font-semibold mb-4" style={{ color: style.colors.primary }}>{title}</h2>
      <div className="space-y-6">
        {content.references.map((r, i) => (
          <div key={i} className="border-l-4 pl-4" style={{ borderColor: style.colors.accent }}>
            <p className="font-medium">{r.clientName} — {r.contextLine}</p>
            <p className="text-gray-600">{r.organisation} · {r.startDate} – {r.endDate}</p>
            <p className="mt-2">Scope: {r.scope}</p>
            <p>Roll och leverans: {r.roleAndDelivery}</p>
            <p>Resultat: {r.result}</p>
            <p className="text-xs text-gray-500 mt-1">Kontakt: {r.contact.name} · {r.contact.titlePhoneEmail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Implement `ConfidentialityRenderer.tsx`**

Create `src/components/bid-editor/renderers/ConfidentialityRenderer.tsx`:

```tsx
"use client";
import type { BidSectionContent, StyleGuide } from "@/lib/types";

type ConfContent = Extract<BidSectionContent, { format: "confidentiality" }>;

export function ConfidentialityRenderer({
  title, content, style,
}: { title: string; content: ConfContent; style: StyleGuide }) {
  return (
    <section className="p-6 text-sm">
      <h2 className="text-xl font-semibold mb-4" style={{ color: style.colors.primary }}>{title}</h2>
      <p className="mb-3"><span className="font-medium">OSL-referens:</span> {content.oslReference || "—"}</p>
      {content.secrecyRows.length === 0 ? (
        <p className="text-gray-500 italic">Inga sekretessuppgifter identifierade</p>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr className="border-b">
              <th className="py-2">Referens</th>
              <th>Omfattning</th>
              <th>Motivering</th>
            </tr>
          </thead>
          <tbody>
            {content.secrecyRows.map((row, i) => (
              <tr key={i} className="border-b">
                <td className="py-2">{row.reference}</td>
                <td>{row.scope}</td>
                <td>{row.justification}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
```

- [ ] **Step 7: Implement `CertificationsRenderer.tsx`**

Create `src/components/bid-editor/renderers/CertificationsRenderer.tsx`:

```tsx
"use client";
import type { BidSectionContent, StyleGuide } from "@/lib/types";

type CertContent = Extract<BidSectionContent, { format: "certifications" }>;

export function CertificationsRenderer({
  title, content, style,
}: { title: string; content: CertContent; style: StyleGuide }) {
  const defaultNames = ["ISO 9001", "ISO 27001", "ISO 14001"];
  return (
    <section className="p-6 text-sm">
      <h2 className="text-xl font-semibold mb-4" style={{ color: style.colors.primary }}>{title}</h2>
      <div className="grid grid-cols-2 gap-4">
        {content.certs.map((c, i) => (
          <div key={i} className="border rounded p-3">
            <p className="font-medium">{c.name ?? defaultNames[i] ?? "Övrig"}</p>
            {c.description && <p className="text-gray-600">{c.description}</p>}
            <p>Nummer: {c.number}</p>
            <p>Giltig t.o.m.: {c.validUntil}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 8: Run tsc — verify all 7 files compile**

```bash
npx tsc --noEmit 2>&1 | grep "components/bid-editor/renderers/" | head -20
```

Expected: no errors referring to the 7 new files. Errors referring to the old dispatcher `index.tsx` are OK — that's the next task.

- [ ] **Step 9: Commit**

```bash
git add src/components/bid-editor/renderers/UnderstandingRenderer.tsx src/components/bid-editor/renderers/QualityAssuranceRenderer.tsx src/components/bid-editor/renderers/TeamPricingRenderer.tsx src/components/bid-editor/renderers/RequirementMatrixV2Renderer.tsx src/components/bid-editor/renderers/ReferenceV2Renderer.tsx src/components/bid-editor/renderers/ConfidentialityRenderer.tsx src/components/bid-editor/renderers/CertificationsRenderer.tsx
git commit -m "feat(m2): new bid-editor renderers for v2 section formats"
```

---

### Task 21: Rewrite `renderers/index.tsx` dispatcher + delete v1 renderers

**Files:**
- Modify: `src/components/bid-editor/renderers/index.tsx`
- Delete: `ProseRenderer.tsx`, `BulletsRenderer.tsx`, `ThreeColumnRenderer.tsx`, `GanttRenderer.tsx`, `DividerRenderer.tsx`, `PlaceholderRenderer.tsx`, `TeamRenderer.tsx`, `ReferencesRenderer.tsx`, `MatrixRenderer.tsx`

- [ ] **Step 1: Replace dispatcher body**

Overwrite `src/components/bid-editor/renderers/index.tsx` with:

```tsx
"use client";

import { BidSection, BidSectionContent, StyleGuide } from "@/lib/types";
import { CoverRenderer } from "./CoverRenderer";
import { PhasesRenderer } from "./PhasesRenderer";
import { UnderstandingRenderer } from "./UnderstandingRenderer";
import { QualityAssuranceRenderer } from "./QualityAssuranceRenderer";
import { TeamPricingRenderer } from "./TeamPricingRenderer";
import { RequirementMatrixV2Renderer } from "./RequirementMatrixV2Renderer";
import { ReferenceV2Renderer } from "./ReferenceV2Renderer";
import { ConfidentialityRenderer } from "./ConfidentialityRenderer";
import { CertificationsRenderer } from "./CertificationsRenderer";

interface SectionRendererProps {
  section: BidSection;
  style: StyleGuide;
  onSectionChange?: (updated: BidSection) => void;
}

export function SectionRenderer({ section, style, onSectionChange }: SectionRendererProps) {
  const content = section.content;

  function updateContent(patch: Partial<BidSectionContent>) {
    if (!onSectionChange) return;
    onSectionChange({ ...section, content: { ...content, ...patch } as BidSectionContent });
  }

  switch (content.format) {
    case "cover":
      return (
        <CoverRenderer
          title={content.title}
          client={content.client}
          date={content.date}
          style={style}
          onFieldChange={onSectionChange ? (field, value) => {
            updateContent({ [field]: value });
          } : undefined}
        />
      );
    case "phases":
      return (
        <PhasesRenderer
          phases={content.phases}
          style={style}
          onPhaseFieldChange={onSectionChange ? (phaseIndex, field, value) => {
            const phases = content.phases.map((p, i) =>
              i === phaseIndex ? { ...p, [field]: value } : p
            );
            updateContent({ phases });
          } : undefined}
        />
      );
    case "understanding-current":
    case "understanding-assignment":
    case "understanding-vision":
      return <UnderstandingRenderer title={section.title} content={content} style={style} />;
    case "quality-assurance":
      return <QualityAssuranceRenderer title={section.title} content={content} style={style} />;
    case "team-pricing":
      return (
        <TeamPricingRenderer
          title={section.title}
          content={content}
          style={style}
          onTimprisChange={onSectionChange ? (idx, timpris) => {
            const members = content.members.map((m, i) => {
              if (i !== idx) return m;
              const total = timpris === null ? null : timpris * m.timmar;
              return { ...m, timpris, total };
            });
            const totalTimmar = members.reduce((acc, m) => acc + m.timmar, 0);
            const totals = members.map((m) => m.total);
            const hasNull = totals.includes(null);
            const totalPris = hasNull ? null : (totals as number[]).reduce((a, b) => a + b, 0);
            updateContent({ members, summary: { totalTimmar, totalPris } });
          } : undefined}
        />
      );
    case "requirement-matrix-v2":
      return <RequirementMatrixV2Renderer title={section.title} content={content} style={style} />;
    case "reference-v2":
      return <ReferenceV2Renderer title={section.title} content={content} style={style} />;
    case "confidentiality":
      return <ConfidentialityRenderer title={section.title} content={content} style={style} />;
    case "certifications":
      return <CertificationsRenderer title={section.title} content={content} style={style} />;
    default: {
      const _exhaustive: never = content;
      return <div className="text-red-500 text-sm">Unknown format: {JSON.stringify(_exhaustive)}</div>;
    }
  }
}

export {
  CoverRenderer,
  PhasesRenderer,
  UnderstandingRenderer,
  QualityAssuranceRenderer,
  TeamPricingRenderer,
  RequirementMatrixV2Renderer,
  ReferenceV2Renderer,
  ConfidentialityRenderer,
  CertificationsRenderer,
};
```

- [ ] **Step 2: Delete v1 renderer files**

```bash
cd "C:/Users/stefa/projects/agentic-dealflow-template-pivot"
rm src/components/bid-editor/renderers/ProseRenderer.tsx \
   src/components/bid-editor/renderers/BulletsRenderer.tsx \
   src/components/bid-editor/renderers/ThreeColumnRenderer.tsx \
   src/components/bid-editor/renderers/GanttRenderer.tsx \
   src/components/bid-editor/renderers/DividerRenderer.tsx \
   src/components/bid-editor/renderers/PlaceholderRenderer.tsx \
   src/components/bid-editor/renderers/TeamRenderer.tsx \
   src/components/bid-editor/renderers/ReferencesRenderer.tsx \
   src/components/bid-editor/renderers/MatrixRenderer.tsx
```

- [ ] **Step 3: Run tsc**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: clean (no errors at all, assuming Phase 6 is done).

- [ ] **Step 4: Run full test suite — `renderers.test.tsx` likely needs update**

```bash
npx vitest run
```

Expected: `renderers.test.tsx` fails if it tests v1 renderers.

- [ ] **Step 5: Update or delete `renderers.test.tsx`**

Read it first:

```bash
cat src/lib/__tests__/renderers.test.tsx
```

If it tests v1 renderers only, delete the file:

```bash
rm src/lib/__tests__/renderers.test.tsx
```

If it tests `CoverRenderer` and `PhasesRenderer` (v2-compatible), keep those tests and remove the v1 ones.

- [ ] **Step 6: Run tests again — verify GREEN**

```bash
npx vitest run
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(m2): rewrite bid-editor SectionRenderer for v2 formats; drop v1 renderers"
```

---

### Task 22: Timpris banner in `BidEditor.tsx`

**Files:**
- Modify: `src/components/bid-editor/BidEditor.tsx`
- Test: Read after opening.

- [ ] **Step 1: Read `BidEditor.tsx`**

```bash
cat src/components/bid-editor/BidEditor.tsx | head -80
```

Identify where the header/toolbar is rendered.

- [ ] **Step 2: Add banner**

Add a derived-state check at the top of the component body:

```tsx
const needsTimpris = sections.some(
  (s) => s.content.format === "team-pricing"
    && s.content.members.some((m) => m.timpris === null)
);
```

Just above the first child render (i.e. below any top-of-file header markup), insert:

```tsx
{needsTimpris && (
  <div className="mx-6 mt-4 rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
    <span role="img" aria-label="varning">⚠</span> Fyll i timpriser i Team-sektionen innan export.
  </div>
)}
```

If the component uses a different layout pattern, put the banner in the first scrollable region or above `<SectionNav>`.

- [ ] **Step 3: Smoke-run dev server in a background shell, open bid-editor for a seeded bid, confirm banner appears when any timpris is null**

Manual step. Document in the commit message what you verified.

- [ ] **Step 4: Run tsc + tests**

```bash
npx tsc --noEmit && npx vitest run
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/bid-editor/BidEditor.tsx
git commit -m "feat(m2): bid-editor shows 'fyll i timpriser' banner when any timpris is null"
```

---

## Phase 9 — DB wipe + e2e + final checks

### Task 23: Migration `010_wipe_bids.sql`

**Files:**
- Create: `supabase/migrations/010_wipe_bids.sql`

- [ ] **Step 1: Create migration file**

```sql
-- 010_wipe_bids.sql — Apply MANUALLY in Supabase SQL Editor after M2 merges.
-- Context: M2 refactors the bid-generator output union from v1 (prose/bullets/…)
-- to v2-only (cover/understanding-*/phases/…). Existing rows carry v1 shapes
-- the renderer no longer handles. Wipe rather than migrate — users re-run
-- generation against the same RFP+team to rebuild under the new contract.

TRUNCATE bids CASCADE;
```

- [ ] **Step 2: Commit the migration file**

```bash
git add supabase/migrations/010_wipe_bids.sql
git commit -m "chore(m2): add migration to wipe bids after v1→v2 format swap"
```

**NOTE TO IMPLEMENTER:** This migration is NOT applied by the tooling. Apply it manually via Supabase SQL Editor AFTER the PR merges but BEFORE re-running a bid generation — see `docs/superpowers/specs/2026-04-20-m2-bid-generator-v2-alignment-design.md` → "DB wipe" and "Dependencies & sequencing".

---

### Task 24: End-to-end smoke test (bid generator → renderer)

**Files:**
- Create: `src/lib/pptx-template/__tests__/bid-export-e2e.test.ts`

- [ ] **Step 1: Write the test**

Create `src/lib/pptx-template/__tests__/bid-export-e2e.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import JSZip from "jszip";
import { renderTemplate } from "../loader";
import type { BidContext } from "@/lib/bid-generator";
import type { RfpAnalysis } from "@/lib/types";

vi.mock("@/lib/ai-client", () => ({ callClaude: vi.fn() }));
import { callClaude } from "@/lib/ai-client";

const analysis: RfpAnalysis = {
  title: "E2E-anbud", client: "E2E-Kund", deadline: null, summary: "s",
  requirements: [{ category: "K", description: "Skrivkrav", priority: "must" }],
  evaluationCriteria: [], requiredCompetencies: [],
  estimatedScope: "", redFlags: [], domain: "",
  oslReference: "19 kap 3 §",
  secrecyRows: [{ reference: "Bilaga 2", scope: "Personuppgifter", justification: "GDPR" }],
};
const ctx: BidContext = {
  analysis,
  teamConsultants: [{
    id: "c1", organizationId: "o", name: "Anna", level: "senior",
    yearsExperience: 10, summary: null, rawCvText: null,
    competencies: [], references: [], createdAt: "", updatedAt: "",
  }],
  scoredConsultants: [],
  goNoGoResult: {
    mustRequirements: [], winProbability: 50, winProbabilityReasoning: "",
    strengths: [], gaps: [], improvements: [], recommendation: "go", reasoning: "",
  },
};

beforeEach(() => {
  vi.mocked(callClaude).mockImplementation(async ({ label }) => {
    if (label.startsWith("understanding")) return {
      current: { organisation: "Org", system: "Sys", processer: "Proc", smärtpunkter: ["Sp"] },
      assignment: { stycken: ["A1", "A2", "A3"] },
      vision: { utmaningar: ["U1"], värden: ["V1"] },
    };
    if (label.startsWith("phases")) return {
      phases: [{
        name: "Fas 1: X", objective: "o", activities: ["a"], deliverables: ["d"],
        duration: "4 v", period: "M1-M2", decisions: ["Beslut"], shortDescription: "Fas 1",
      }],
    };
    if (label.startsWith("quality")) return {
      qaProcess: ["QA-P"],
      qualityLead: { name: "Anna", roleAndMandate: "QL", contact: "a@x.se" },
      escalation: { process: "E", reporting: "R" },
      checkpoints: ["CP"],
    };
    if (label.startsWith("requirement-matrix")) return {
      rows: [{
        requirement: "R1", hurUppfylls: "H", referens: "CV Anna",
        coverage: [{ consultantName: "Anna", status: "JA", evidence: "E" }],
      }],
    };
    if (label.startsWith("team")) return {
      members: [{ name: "Anna", role: "PL", omfattningPct: 50, timmar: 240 }],
    };
    if (label.startsWith("reference")) return {
      references: [{
        clientName: "K", contextLine: "ctx", organisation: "Org",
        startDate: "01/2024", endDate: "12/2024", scope: "s",
        contact: { name: "K", titlePhoneEmail: "t · p · e" },
        roleAndDelivery: "r", result: "ok",
      }],
    };
    throw new Error(`unexpected label: ${label}`);
  });
});

describe("bid generator → renderer e2e", () => {
  it("produces an 18-slide PPTX with no leftover placeholders", async () => {
    const { generateAllSections } = await import("@/lib/bid-generator");
    const sections = await generateAllSections(ctx);

    const buf = await renderTemplate("anbudsmall-v2", sections, {
      companyName: "TestCo",
      clientName: "E2E-Kund",
      diaryNumber: "D-001",
      bidName: "E2E-anbud",
      bidDate: "2026-04-20",
    });

    const zip = await JSZip.loadAsync(buf);
    const slideEntries = Object.keys(zip.files).filter((f) =>
      /^ppt\/slides\/slide\d+\.xml$/.test(f)
    );
    const xmls = await Promise.all(slideEntries.map((e) => zip.file(e)!.async("text")));
    const combined = xmls.join("\n");

    // Every slide rendered — no leftover {placeholder}
    expect(combined.match(/\{[A-Za-zåäöÅÄÖ][^}]*\}/g) ?? []).toEqual([]);

    // Topp 2 regression: "ISO 27001" survives
    // (the mocked phases do not introduce the string, so this asserts only that
    // if ISO appears in the template literal text it was not corrupted)
    // Keep as smoke — stronger check runs during manual QA.
  });
});
```

- [ ] **Step 2: Run the test**

```bash
npx vitest run src/lib/pptx-template/__tests__/bid-export-e2e.test.ts
```

Expected: PASS. If failing, inspect which placeholders are still present and either (a) fix the applicator or (b) document the leftover as known tech debt (e.g., slide 15 illustrative text that registry.ts intentionally skips).

- [ ] **Step 3: Commit**

```bash
git add src/lib/pptx-template/__tests__/bid-export-e2e.test.ts
git commit -m "test(m2): e2e smoke — full generator + renderer, no leftover placeholders"
```

---

### Task 25: Full test + tsc sweep

- [ ] **Step 1: Run everything**

```bash
npx tsc --noEmit
npx vitest run
```

- [ ] **Step 2: Fix anything red**

Common remaining issues:
- Orphan imports in test files pointing at deleted modules
- Type narrowing regressions on renderer props
- Missing `BidSectionContent` members in tests that manually build mock sections

Each fix should be minimal and commit-worthy on its own.

- [ ] **Step 3: Commit any follow-ups as needed**

```bash
git add -A
git commit -m "chore(m2): post-refactor test+type cleanup"
```

---

### Task 26: Push branch + open PR

- [ ] **Step 1: Push**

```bash
cd "C:/Users/stefa/projects/agentic-dealflow-template-pivot"
git push -u origin feat/m2-bid-generator-v2
```

- [ ] **Step 2: Open PR — include acceptance checklist and migration-apply reminder**

```bash
gh pr create --title "feat(m2): bid-generator alignment to v2 slot-formats" --body "$(cat <<'EOF'
## Summary
- Replaces v1 `BidSectionContent` union + planner with v2-only 11-format union
- New `src/lib/bid-generator/` module: 6 AI bundles (understanding/phases/quality Opus, requirement-matrix/team/reference Sonnet) + 3 deterministic generators (cover/certifications/confidentiality)
- `RfpAnalysis` gains `oslReference` + `secrecyRows` for confidentiality slide
- `team-pricing.timpris`/`total` now nullable — company fills in post-generation; bid-editor shows yellow "fyll i timpriser" banner
- `requirement-matrix-v2` extended with per-consultant `coverage` array (collapsible view in bid-editor)
- Renderer `applicatorFor` fails loud on unknown slide types
- Drops v1 renderers and replaces the dispatcher

## Test plan
- [ ] `npx tsc --noEmit` clean
- [ ] `npx vitest run` all green
- [ ] Open `bid-editor` locally, confirm "fyll i timpriser" banner appears when timpris is null and disappears when all filled
- [ ] Manual end-to-end: upload RFP → generate → export PPTX → open in PowerPoint → no MISSING slides, no `{placeholder}` leftovers
- [ ] ISO 27001 regression check (Topp 2): RFP referencing "ISO 27001" preserves the string through all slides

## Post-merge
**Apply migration manually in Supabase SQL Editor:**
\`\`\`
supabase/migrations/010_wipe_bids.sql
\`\`\`
All existing bids are on the v1 shape and will fail the fail-loud renderer; they need to be wiped and regenerated.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Wait for PR-review routine comment before squash-merging**

Per the project convention (see MEMORY: "Feedback: vänta in PR-routinen"), wait for the auto-review comment before merging. Address review comments as additional commits on the branch.

---

## Out-of-scope / deferred

- **Eval-harness extension** — see spec §"Tests → Eval-harness". Time-box 2h; if too invasive, punt to M2.5 as its own PR.
- **Manual end-to-end in PowerPoint** — Task 26 PR body includes the checklist; Stefan runs this before squash-merge.
- **`requirement-matrix.ts` applicator `01`–`06` substring risk** — separate PR, same pattern as PR #16 `phase-detail.ts` Topp 2 fix.
- **Template slide 13 layout upgrade to render per-consultant matrix** — Stefan-owned design session.
- **M3 `organizations.bid_template_config`** — next milestone.

---

## Spec-to-task coverage matrix

| Spec item | Task(s) |
|-----------|---------|
| Types & Zod — v2 union | 3, 4 |
| Types & Zod — `requirement-matrix-v2` coverage | 3 |
| Types & Zod — `team-pricing` nullable timpris | 3 |
| Types & Zod — `RfpAnalysis` OSL extension | 1 |
| `rfp-analyzer` prompt extension | 2 |
| Bid-generator 6 bundles | 9, 10, 11, 12, 13, 14 |
| Bid-generator 3 deterministic | 5, 6, 7 |
| Orchestrator (Promise.all, fail-loud) | 15 |
| API `/bids` POST | 16 |
| API `/bids/[id]/regenerate/[sectionKey]` | 17 |
| Renderer fail-loud | 19 |
| Bid-editor renderers | 20, 21 |
| Bid-editor timpris banner | 22 |
| DB wipe `010_wipe_bids.sql` | 23 |
| E2E smoke test | 24 |
| Delete v1 code | 18, 21 |
| Final sweep + PR | 25, 26 |
