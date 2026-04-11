# Bid Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move structural decisions (section order, titles, formats, dividers) from hardcoded code in `bid-generator.ts` into an AI-driven planner, validated by a repair-based validator, while preserving the PPTX renderer contract.

**Architecture:** Three new components (`BidPlanner` → `Validator` → `Generator dispatcher`) sit between `BidContext` and the existing PPTX renderer. Planner is a single Sonnet call returning a `BidPlan` (Zod discriminated union). Validator is pure code that silently injects missing required sections, enforces position constraints, and repairs sanity issues. Generator becomes a dispatcher over `plan.sections` with a per-kind `buildSection` switch (exhaustiveness-checked). `BidSection[]` output contract is unchanged.

**Tech Stack:** TypeScript (strict), Zod for schema validation, Anthropic SDK (claude-sonnet-4-6 for planning, claude-opus-4-6 for content), Vitest, existing `callClaude` wrapper in `src/lib/ai-client.ts`.

**Spec:** `docs/superpowers/specs/2026-04-11-bid-planner-design.md` — read this if any task is ambiguous.

---

## File structure

**New files:**
- `src/lib/bid-planner.ts` — `planBid`, `planBidOrFallback`, `DEFAULT_BID_PLAN`, type aliases
- `src/lib/bid-plan-validator.ts` — `validateAndRepair`, `REQUIRED_SECTIONS`
- `src/lib/__tests__/bid-planner.test.ts`
- `src/lib/__tests__/bid-plan-validator.test.ts`
- `notes/2026-04-11-bid-planner-eval.md` — manual prompt eval journal

**Modified files:**
- `src/lib/ai-schemas.ts` — add `BidPlanSchema`, `PlannedSectionSchema`, `ThreeColumnResponseSchema`, `FORMAT_SCHEMAS` map; keep existing schemas
- `src/lib/bid-section-prompts.ts` — add `FORMAT_PROMPTS` + `semanticGuidance` (Task 9); remove legacy `SECTION_PROMPTS`/`AI_SECTION_KEYS`/`getSectionPrompt` (Task 12)
- `src/lib/bid-generator.ts` — add `buildSection` dispatcher (Task 10), refactor `generateAllSections` to use planner + validator + dispatcher (Task 11), remove legacy code (Task 11)
- `src/lib/__tests__/bid-orchestrator.test.ts` — replace mocks that matched by Swedish system-prompt strings; mock `planBid` and content calls by `kind` (Task 13)

**Unchanged:**
- Everything under `src/lib/pptx/**`
- `src/lib/types.ts` `BidSection` / `BidSectionContent`
- `src/lib/ai-client.ts`
- `src/app/api/bids/route.ts` destructures `{ sections }` from `generateAllSections` — still works after refactor

---

## Branch setup

This plan assumes a fresh branch. Before starting Task 1:

```bash
# From feat/pptx-v2-polish branch — merge to main first if not already done,
# then create a new feature branch:
git checkout -b feat/bid-planner
```

If the pptx-v2 branch hasn't been merged yet, coordinate with Stefan before starting. The bid-planner work builds on top of pptx-v2 and should not start a parallel fork.

---

## Task 1: BidPlanSchema + types + initial scaffold

**Goal:** Define the `BidPlan` Zod schema as a discriminated union keyed on `kind`, export inferred TS types, and stand up the `bid-planner.ts` file with the type re-exports so subsequent tasks have a place to add logic.

**Files:**
- Modify: `src/lib/ai-schemas.ts` (add new schemas at bottom, keep existing)
- Create: `src/lib/bid-planner.ts`
- Create: `src/lib/__tests__/bid-planner.test.ts`

- [ ] **Step 1: Write the failing test for `BidPlanSchema` parse**

Create `src/lib/__tests__/bid-planner.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { BidPlanSchema } from "../ai-schemas";
import type { BidPlan } from "../bid-planner";

describe("BidPlanSchema", () => {
  it("parses a minimal valid plan", () => {
    const raw = {
      language: "sv",
      sections: [
        { kind: "cover", semanticKey: "cover" },
        { kind: "placeholder", title: "Kontakt", instruction: "Fyll i", semanticKey: "contact" },
        { kind: "placeholder", title: "Sekretess", instruction: "Boilerplate", semanticKey: "confidentiality" },
      ],
    };
    const result = BidPlanSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      const plan: BidPlan = result.data;
      expect(plan.sections[0].kind).toBe("cover");
    }
  });

  it("rejects unknown kind", () => {
    const raw = {
      language: "sv",
      sections: [{ kind: "unknown-kind", title: "X" }],
    };
    expect(BidPlanSchema.safeParse(raw).success).toBe(false);
  });

  it("rejects missing language", () => {
    const raw = { sections: [{ kind: "cover" }] };
    expect(BidPlanSchema.safeParse(raw).success).toBe(false);
  });

  it("accepts three-column with exactly three column hints", () => {
    const raw = {
      language: "sv",
      sections: [
        {
          kind: "three-column",
          title: "Perspektiv",
          columnHints: ["Nuläge", "Vad vi ser", "Vårt uppdrag"],
        },
      ],
    };
    expect(BidPlanSchema.safeParse(raw).success).toBe(true);
  });

  it("rejects three-column with wrong column count", () => {
    const raw = {
      language: "sv",
      sections: [
        { kind: "three-column", title: "Perspektiv", columnHints: ["A", "B"] },
      ],
    };
    expect(BidPlanSchema.safeParse(raw).success).toBe(false);
  });

  it("accepts optional top-level fields", () => {
    const raw = {
      language: "en",
      sections: [{ kind: "cover" }],
      unmappedRequirements: ["sustainability annex"],
      rationale: "simple structure",
    };
    expect(BidPlanSchema.safeParse(raw).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/bid-planner.test.ts`
Expected: FAIL — `BidPlanSchema` is not exported from `ai-schemas`, `BidPlan` is not exported from `bid-planner`.

- [ ] **Step 3: Add `PlannedSectionSchema` + `BidPlanSchema` to `ai-schemas.ts`**

Append to the bottom of `src/lib/ai-schemas.ts`:

```typescript
// --- Bid Planner ---

export const PlannedSectionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("cover"),
    semanticKey: z.string().optional(),
  }),
  z.object({
    kind: z.literal("toc"),
    title: z.string(),
    semanticKey: z.string().optional(),
  }),
  z.object({
    kind: z.literal("divider"),
    number: z.number(),
    title: z.string(),
    subtitle: z.string(),
    semanticKey: z.string().optional(),
  }),
  z.object({
    kind: z.literal("prose"),
    title: z.string(),
    promptHint: z.string(),
    semanticKey: z.string().optional(),
  }),
  z.object({
    kind: z.literal("bullets"),
    title: z.string(),
    promptHint: z.string(),
    minItems: z.number().optional(),
    semanticKey: z.string().optional(),
  }),
  z.object({
    kind: z.literal("three-column"),
    title: z.string(),
    columnHints: z.tuple([z.string(), z.string(), z.string()]),
    semanticKey: z.string().optional(),
  }),
  z.object({
    kind: z.literal("phases"),
    title: z.string(),
    promptHint: z.string(),
    semanticKey: z.string().optional(),
  }),
  z.object({
    kind: z.literal("gantt"),
    title: z.string(),
    semanticKey: z.string().optional(),
  }),
  z.object({
    kind: z.literal("team"),
    title: z.string(),
    preferredSize: z.number().optional(),
    semanticKey: z.string().optional(),
  }),
  z.object({
    kind: z.literal("requirement-matrix"),
    title: z.string(),
    semanticKey: z.string().optional(),
  }),
  z.object({
    kind: z.literal("references"),
    title: z.string(),
    minCount: z.number().optional(),
    semanticKey: z.string().optional(),
  }),
  z.object({
    kind: z.literal("placeholder"),
    title: z.string(),
    instruction: z.string(),
    reason: z.enum(["manual-fill", "unmapped-requirement"]).optional(),
    semanticKey: z.string().optional(),
  }),
]);

export const BidPlanSchema = z.object({
  language: z.enum(["sv", "en"]),
  sections: z.array(PlannedSectionSchema),
  unmappedRequirements: z.array(z.string()).optional(),
  rationale: z.string().optional(),
});
```

- [ ] **Step 4: Create `bid-planner.ts` with inferred types**

Create `src/lib/bid-planner.ts`:

```typescript
import { z } from "zod";
import { BidPlanSchema, PlannedSectionSchema } from "./ai-schemas";

// Type aliases inferred from Zod schemas
export type BidPlan = z.infer<typeof BidPlanSchema>;
export type PlannedSection = z.infer<typeof PlannedSectionSchema>;
export type SectionKind = PlannedSection["kind"];

// Subsequent tasks add DEFAULT_BID_PLAN, planBid, planBidOrFallback
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/bid-planner.test.ts`
Expected: PASS — all 6 cases.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors in the new files. Pre-existing errors elsewhere are acceptable; confirm the *new* files compile.

- [ ] **Step 7: Commit**

```bash
git add src/lib/ai-schemas.ts src/lib/bid-planner.ts src/lib/__tests__/bid-planner.test.ts
git commit -m "feat(bid-planner): add BidPlanSchema and type aliases"
```

---

## Task 2: DEFAULT_BID_PLAN constant

**Goal:** Define the hardcoded fallback plan that matches today's `SECTION_ORDER` functionally. It is the ultimate safety net when the planner call or validator cannot produce a usable plan. Must pass `BidPlanSchema.safeParse` as a standalone valid plan.

**Files:**
- Modify: `src/lib/bid-planner.ts`
- Modify: `src/lib/__tests__/bid-planner.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/__tests__/bid-planner.test.ts`:

```typescript
import { DEFAULT_BID_PLAN } from "../bid-planner";

describe("DEFAULT_BID_PLAN", () => {
  it("is a valid BidPlan", () => {
    expect(BidPlanSchema.safeParse(DEFAULT_BID_PLAN).success).toBe(true);
  });

  it("contains all required semanticKeys", () => {
    const keys = DEFAULT_BID_PLAN.sections
      .map((s) => s.semanticKey)
      .filter((k): k is string => !!k);
    expect(keys).toContain("cover");
    expect(keys).toContain("quality");
    expect(keys).toContain("team");
    expect(keys).toContain("requirement-matrix");
    expect(keys).toContain("references");
    expect(keys).toContain("contact");
    expect(keys).toContain("confidentiality");
  });

  it("puts cover first, confidentiality last", () => {
    const first = DEFAULT_BID_PLAN.sections[0];
    const last = DEFAULT_BID_PLAN.sections[DEFAULT_BID_PLAN.sections.length - 1];
    expect(first.kind).toBe("cover");
    expect(last.semanticKey).toBe("confidentiality");
  });

  it("puts contact second-to-last", () => {
    const secondToLast =
      DEFAULT_BID_PLAN.sections[DEFAULT_BID_PLAN.sections.length - 2];
    expect(secondToLast.semanticKey).toBe("contact");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/bid-planner.test.ts`
Expected: FAIL — `DEFAULT_BID_PLAN` not exported.

- [ ] **Step 3: Implement DEFAULT_BID_PLAN in `bid-planner.ts`**

Append to `src/lib/bid-planner.ts`:

```typescript
export const DEFAULT_BID_PLAN: BidPlan = {
  language: "sv",
  sections: [
    { kind: "cover", semanticKey: "cover" },
    { kind: "toc", title: "Innehåll" },
    {
      kind: "divider",
      number: 1,
      title: "Uppdragsförståelse",
      subtitle: "Vår förståelse och approach",
    },
    {
      kind: "prose",
      title: "Uppdragsförståelse",
      promptHint: "Visa förståelse för uppdragets kärna — inte bara repetera RFP:n",
      semanticKey: "understanding",
    },
    {
      kind: "bullets",
      title: "Identifierat värde",
      promptHint: "4-6 värdepunkter kopplade till RFP:ens kravområden",
      semanticKey: "value-proposition",
    },
    {
      kind: "divider",
      number: 2,
      title: "Genomförande",
      subtitle: "Metod, faser och tidplan",
    },
    {
      kind: "phases",
      title: "Genomförandeplan",
      promptHint: "3-5 faser med aktiviteter, leverabler och risker",
      semanticKey: "execution-plan",
    },
    { kind: "gantt", title: "Tidplan" },
    {
      kind: "prose",
      title: "Kvalitetssäkring och samverkan",
      promptHint: "Avstämningar, rapportering, eskalering, kunskapsöverföring",
      semanticKey: "quality",
    },
    {
      kind: "bullets",
      title: "Risker och hantering",
      promptHint: "4-6 risker med mitigering — parade ihop",
      semanticKey: "risks",
    },
    {
      kind: "divider",
      number: 3,
      title: "Team & Referenser",
      subtitle: "Vårt team och relevanta uppdrag",
    },
    { kind: "team", title: "Team", semanticKey: "team" },
    {
      kind: "requirement-matrix",
      title: "Kravuppfyllnad",
      semanticKey: "requirement-matrix",
    },
    { kind: "references", title: "Referenser", minCount: 3, semanticKey: "references" },
    {
      kind: "placeholder",
      title: "Pris & omfattning",
      instruction: "Fyll i prisbild, timmar och eventuella förbehåll",
      semanticKey: "pricing",
    },
    {
      kind: "placeholder",
      title: "Kontakt",
      instruction: "Fyll i kontaktuppgifter för ansvarig säljare och uppdragsledare",
      semanticKey: "contact",
    },
    {
      kind: "placeholder",
      title: "Anbudssekretess",
      instruction: "Lägg in sekretess-boilerplate och ISO-certifieringar",
      semanticKey: "confidentiality",
    },
  ],
};
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/__tests__/bid-planner.test.ts`
Expected: PASS — all DEFAULT_BID_PLAN tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bid-planner.ts src/lib/__tests__/bid-planner.test.ts
git commit -m "feat(bid-planner): add DEFAULT_BID_PLAN safety-net constant"
```

---

## Task 3: planBid function + fallback wrapper

**Goal:** Implement the single Claude call that produces a `BidPlan` from a `BidContext`, with one retry on parse failure (sharpened prompt) and a `planBidOrFallback` wrapper that catches any error and returns `DEFAULT_BID_PLAN`. `callClaude` already retries on transient network failures; the retry here is only for "Claude returned broken JSON."

**Files:**
- Modify: `src/lib/bid-planner.ts`
- Modify: `src/lib/__tests__/bid-planner.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/__tests__/bid-planner.test.ts`:

```typescript
import { vi, beforeEach } from "vitest";
import type { BidContext } from "../bid-section-prompts";

const mockCreate = vi.hoisted(() => vi.fn());
vi.mock("@anthropic-ai/sdk", () => ({
  default: function () {
    return { messages: { create: mockCreate } };
  },
}));

const minimalCtx: BidContext = {
  analysis: {
    title: "Test RFP",
    client: "Test Kund",
    deadline: null,
    summary: "Digital transformation",
    requirements: [
      { category: "Kompetens", description: "Projektledning", priority: "must" },
    ],
    evaluationCriteria: [],
    requiredCompetencies: [],
    estimatedScope: "3 months",
    redFlags: [],
    domain: "IT",
  },
  teamConsultants: [
    {
      id: "c1",
      organizationId: "org1",
      name: "Anna",
      level: "senior",
      yearsExperience: 10,
      summary: "Lead",
      rawCvText: null,
      competencies: [{ competency: "PM", category: "methodology" }],
      references: [],
      createdAt: "",
      updatedAt: "",
    },
  ],
  scoredConsultants: [
    { consultantId: "c1", consultantName: "Anna", level: "senior", score: 90, reasoning: "Fit" },
  ],
  goNoGoResult: {
    mustRequirements: [],
    winProbability: 70,
    winProbabilityReasoning: "",
    strengths: [],
    gaps: [],
    improvements: [],
    recommendation: "go",
    reasoning: "",
  },
};

const validPlanJson = JSON.stringify({
  language: "sv",
  sections: [
    { kind: "cover", semanticKey: "cover" },
    { kind: "prose", title: "Förståelse", promptHint: "x", semanticKey: "understanding" },
    { kind: "team", title: "Team", semanticKey: "team" },
    { kind: "placeholder", title: "Kontakt", instruction: "x", semanticKey: "contact" },
    { kind: "placeholder", title: "Sekretess", instruction: "x", semanticKey: "confidentiality" },
  ],
});

describe("planBid", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("returns a parsed BidPlan on happy path", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: validPlanJson }],
    });
    const { planBid } = await import("../bid-planner");
    const plan = await planBid(minimalCtx);
    expect(plan.language).toBe("sv");
    expect(plan.sections[0].kind).toBe("cover");
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("retries once with sharpened prompt on invalid JSON", async () => {
    mockCreate
      .mockResolvedValueOnce({
        content: [{ type: "text", text: "not json at all" }],
      })
      .mockResolvedValueOnce({
        content: [{ type: "text", text: validPlanJson }],
      });
    const { planBid } = await import("../bid-planner");
    const plan = await planBid(minimalCtx);
    expect(plan.sections.length).toBeGreaterThan(0);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    // Sharpened retry: second call's system prompt mentions "invalid"
    const secondCall = mockCreate.mock.calls[1][0];
    expect(String(secondCall.system).toLowerCase()).toContain("invalid");
  });

  it("throws after retry also fails", async () => {
    mockCreate
      .mockResolvedValueOnce({ content: [{ type: "text", text: "nope" }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "still nope" }] });
    const { planBid } = await import("../bid-planner");
    await expect(planBid(minimalCtx)).rejects.toThrow();
  });
});

describe("planBidOrFallback", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("returns planner output on success", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: validPlanJson }],
    });
    const { planBidOrFallback } = await import("../bid-planner");
    const plan = await planBidOrFallback(minimalCtx);
    expect(plan.sections[0].kind).toBe("cover");
  });

  it("falls back to DEFAULT_BID_PLAN on persistent failure", async () => {
    mockCreate
      .mockResolvedValueOnce({ content: [{ type: "text", text: "bad" }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "bad" }] });
    const { planBidOrFallback, DEFAULT_BID_PLAN } = await import("../bid-planner");
    const plan = await planBidOrFallback(minimalCtx);
    expect(plan).toEqual(DEFAULT_BID_PLAN);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/bid-planner.test.ts`
Expected: FAIL — `planBid` and `planBidOrFallback` not exported.

- [ ] **Step 3: Implement `planBid` + `planBidOrFallback`**

Append to `src/lib/bid-planner.ts`:

```typescript
import { callClaude } from "./ai-client";
import { BidContext } from "./bid-section-prompts";

const PLANNER_SYSTEM = `Du är en bid planner för konsultanbud. Din uppgift är att PLANERA struktur och format, INTE skriva innehåll.

## Tillgängliga sektionstyper (closed palette)
- cover: framsida med titel/kund/datum
- toc: innehållsförteckning
- divider: sektionsavdelare med nummer + titel + subtitle
- prose: löpande text (150-400 ord)
- bullets: punktlista (3-7 punkter)
- three-column: tre parallella kolumner med titel + ikon + brödtext
- phases: faslista med aktiviteter, leverabler, risker
- gantt: tidplan (genereras automatiskt från phases)
- team: teampresentation baserad på tillgängliga konsulter
- requirement-matrix: kravmatris mot konsulter
- references: referensuppdrag
- placeholder: sektion som fylls i manuellt

## Obligatoriska semanticKeys
Anbudet MÅSTE innehålla följande semanticKey-värden (sätt semanticKey-fältet till exakt dessa strängar):
- "cover" (kind: cover, måste vara första sektionen)
- "quality" (kind: prose, fri position)
- "team" (kind: team, fri position)
- "requirement-matrix" (kind: requirement-matrix, fri position)
- "references" (kind: references, fri position)
- "contact" (kind: placeholder, näst sista sektionen)
- "confidentiality" (kind: placeholder, sista sektionen)

Övriga användbara semanticKeys (valfria): "understanding", "value-proposition", "execution-plan", "risks", "pricing".

## Format-variation (viktigt)
Fall INTE tillbaka på prose som standard. Använd three-column för jämförelser eller perspektiv, bullets för listor av värden/risker, phases för genomförande. Variation är centralt — anbudet får inte se ut som alla andra anbud.

## Omappade krav
Om ett RFP-krav inte passar någon av ovanstående format, skapa en placeholder med reason: "unmapped-requirement" och lista kravet på toppnivåns unmappedRequirements-array.

## Rationale
Skriv en mening per betydande strukturellt val i rationale-fältet.

## Language
Infera language från RFP:ns språk ("sv" eller "en").

Svara ENDAST med giltig JSON som matchar BidPlan-schemat. Inget annat.`;

function formatPlannerContext(ctx: BidContext): string {
  const topRequirements = ctx.analysis.requirements
    .slice(0, 10)
    .map((r, i) => `${i + 1}. [${r.priority}] ${r.description}`)
    .join("\n");

  const teamRoles = ctx.teamConsultants
    .map((c) => `- ${c.name} (${c.level})`)
    .join("\n");

  return `## RFP
Titel: ${ctx.analysis.title}
Kund: ${ctx.analysis.client}
Domän: ${ctx.analysis.domain}
Omfattning: ${ctx.analysis.estimatedScope}
Sammanfattning: ${ctx.analysis.summary}

## Top-10 krav
${topRequirements || "(inga)"}

## Team (${ctx.teamConsultants.length} personer)
${teamRoles || "(inget)"}

Planera en effektiv, RFP-anpassad struktur. Variera format. Returnera giltig JSON enligt BidPlan-schemat.`;
}

export async function planBid(ctx: BidContext): Promise<BidPlan> {
  const user = formatPlannerContext(ctx);

  try {
    return await callClaude({
      model: "claude-sonnet-4-6",
      maxTokens: 3000,
      system: PLANNER_SYSTEM,
      userContent: user,
      schema: BidPlanSchema,
      label: "bid planner",
    });
  } catch (firstError) {
    console.warn("[bid-planner] first attempt failed, retrying with sharpened prompt:", firstError);
    const sharpened =
      PLANNER_SYSTEM +
      "\n\n## VIKTIGT\nFöregående försök returnerade INVALID JSON eller matchade inte BidPlan-schemat. Returnera ENDAST giltig JSON som exakt matchar schemat. Inga kommentarer, inga förklaringar utanför JSON.";
    return await callClaude({
      model: "claude-sonnet-4-6",
      maxTokens: 3000,
      system: sharpened,
      userContent: user,
      schema: BidPlanSchema,
      label: "bid planner (retry)",
    });
  }
}

export async function planBidOrFallback(ctx: BidContext): Promise<BidPlan> {
  try {
    return await planBid(ctx);
  } catch (err) {
    console.error("[bid-planner] planner failed, using DEFAULT_BID_PLAN:", err);
    return DEFAULT_BID_PLAN;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/bid-planner.test.ts`
Expected: PASS — all planBid / planBidOrFallback tests green. `callClaude`'s built-in retries (MAX_RETRIES=3) may surface on the first test if the mocked response is considered retryable — if tests flake, verify the mock returns a resolved promise and not a thrown error.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bid-planner.ts src/lib/__tests__/bid-planner.test.ts
git commit -m "feat(bid-planner): add planBid with sharpened retry and fallback wrapper"
```

---

## Task 4: Validator skeleton + REQUIRED_SECTIONS + passthrough test

**Goal:** Stand up `bid-plan-validator.ts` with the `REQUIRED_SECTIONS` rule table and a no-op `validateAndRepair` that returns the plan unchanged. Verifies that a correctly-structured plan passes through without modification. Subsequent tasks add the three repair passes.

**Files:**
- Create: `src/lib/bid-plan-validator.ts`
- Create: `src/lib/__tests__/bid-plan-validator.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/bid-plan-validator.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { validateAndRepair, REQUIRED_SECTIONS } from "../bid-plan-validator";
import { DEFAULT_BID_PLAN } from "../bid-planner";
import type { BidPlan } from "../bid-planner";
import type { BidContext } from "../bid-section-prompts";

const mockCtx: BidContext = {
  analysis: {
    title: "Test RFP",
    client: "Test Kund",
    deadline: null,
    summary: "Test",
    requirements: [
      { category: "Kompetens", description: "Projektledning", priority: "must" },
    ],
    evaluationCriteria: [],
    requiredCompetencies: [],
    estimatedScope: "3 months",
    redFlags: [],
    domain: "IT",
  },
  teamConsultants: [
    {
      id: "c1",
      organizationId: "org1",
      name: "Anna",
      level: "senior",
      yearsExperience: 10,
      summary: "Lead",
      rawCvText: null,
      competencies: [{ competency: "PM", category: "methodology" }],
      references: [],
      createdAt: "",
      updatedAt: "",
    },
  ],
  scoredConsultants: [
    { consultantId: "c1", consultantName: "Anna", level: "senior", score: 90, reasoning: "Fit" },
  ],
  goNoGoResult: {
    mustRequirements: [],
    winProbability: 70,
    winProbabilityReasoning: "",
    strengths: [],
    gaps: [],
    improvements: [],
    recommendation: "go",
    reasoning: "",
  },
};

describe("REQUIRED_SECTIONS", () => {
  it("lists all 7 required semantic keys", () => {
    const keys = REQUIRED_SECTIONS.map((r) => r.semanticKey);
    expect(keys).toEqual([
      "cover",
      "quality",
      "team",
      "requirement-matrix",
      "references",
      "contact",
      "confidentiality",
    ]);
  });
});

describe("validateAndRepair — passthrough", () => {
  it("returns DEFAULT_BID_PLAN unchanged (already valid)", () => {
    const result = validateAndRepair(DEFAULT_BID_PLAN, mockCtx);
    expect(result.sections.length).toBe(DEFAULT_BID_PLAN.sections.length);
    expect(result.sections[0].kind).toBe("cover");
  });

  it("does not mutate input plan", () => {
    const plan: BidPlan = JSON.parse(JSON.stringify(DEFAULT_BID_PLAN));
    const snapshot = JSON.stringify(plan);
    validateAndRepair(plan, mockCtx);
    expect(JSON.stringify(plan)).toBe(snapshot);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/bid-plan-validator.test.ts`
Expected: FAIL — `bid-plan-validator` module does not exist.

- [ ] **Step 3: Create `bid-plan-validator.ts` skeleton**

Create `src/lib/bid-plan-validator.ts`:

```typescript
import type { BidPlan, PlannedSection } from "./bid-planner";
import type { BidContext } from "./bid-section-prompts";

export type RequiredSectionRule = {
  semanticKey: string;
  kind: PlannedSection["kind"];
  position: "first" | "second-to-last" | "last" | "free";
  buildDefault: (ctx: BidContext, language: "sv" | "en") => PlannedSection;
};

export const REQUIRED_SECTIONS: RequiredSectionRule[] = [
  {
    semanticKey: "cover",
    kind: "cover",
    position: "first",
    buildDefault: () => ({ kind: "cover", semanticKey: "cover" }),
  },
  {
    semanticKey: "quality",
    kind: "prose",
    position: "free",
    buildDefault: (_ctx, language) => ({
      kind: "prose",
      title: language === "sv" ? "Kvalitetssäkring och samverkan" : "Quality and collaboration",
      promptHint:
        language === "sv"
          ? "Hur kvalitet säkerställs, samverkan, rapportering, eskalering"
          : "How quality is assured, collaboration, reporting, escalation",
      semanticKey: "quality",
    }),
  },
  {
    semanticKey: "team",
    kind: "team",
    position: "free",
    buildDefault: (_ctx, language) => ({
      kind: "team",
      title: language === "sv" ? "Team" : "Team",
      semanticKey: "team",
    }),
  },
  {
    semanticKey: "requirement-matrix",
    kind: "requirement-matrix",
    position: "free",
    buildDefault: (_ctx, language) => ({
      kind: "requirement-matrix",
      title: language === "sv" ? "Kravuppfyllnad" : "Requirement coverage",
      semanticKey: "requirement-matrix",
    }),
  },
  {
    semanticKey: "references",
    kind: "references",
    position: "free",
    buildDefault: (_ctx, language) => ({
      kind: "references",
      title: language === "sv" ? "Referenser" : "References",
      minCount: 3,
      semanticKey: "references",
    }),
  },
  {
    semanticKey: "contact",
    kind: "placeholder",
    position: "second-to-last",
    buildDefault: (_ctx, language) => ({
      kind: "placeholder",
      title: language === "sv" ? "Kontakt" : "Contact",
      instruction:
        language === "sv"
          ? "Fyll i kontaktuppgifter för ansvarig säljare och uppdragsledare"
          : "Fill in contact details for responsible sales lead and engagement manager",
      semanticKey: "contact",
    }),
  },
  {
    semanticKey: "confidentiality",
    kind: "placeholder",
    position: "last",
    buildDefault: (_ctx, language) => ({
      kind: "placeholder",
      title: language === "sv" ? "Anbudssekretess" : "Confidentiality",
      instruction:
        language === "sv"
          ? "Lägg in sekretess-boilerplate och ISO-certifieringar"
          : "Add confidentiality boilerplate and ISO certifications",
      semanticKey: "confidentiality",
    }),
  },
];

export function validateAndRepair(plan: BidPlan, _ctx: BidContext): BidPlan {
  // Deep-clone so we never mutate the input
  const cloned: BidPlan = JSON.parse(JSON.stringify(plan));
  // Pass A — injection (Task 5)
  // Pass B — position enforcement (Task 6)
  // Pass C — sanity checks (Task 7)
  return cloned;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/bid-plan-validator.test.ts`
Expected: PASS — passthrough works, REQUIRED_SECTIONS has 7 entries.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bid-plan-validator.ts src/lib/__tests__/bid-plan-validator.test.ts
git commit -m "feat(bid-planner): add validator skeleton with REQUIRED_SECTIONS table"
```

---

## Task 5: Validator Pass A — inject missing required sections

**Goal:** For each rule in `REQUIRED_SECTIONS`, if the plan has no section with that `semanticKey`, append the rule's default section. This is the first repair pass. Position enforcement happens in Pass B; here we only care that the required sections exist somewhere.

**Files:**
- Modify: `src/lib/bid-plan-validator.ts`
- Modify: `src/lib/__tests__/bid-plan-validator.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/__tests__/bid-plan-validator.test.ts`:

```typescript
describe("Pass A — inject missing required sections", () => {
  it("injects missing cover section", () => {
    const plan: BidPlan = {
      language: "sv",
      sections: [
        { kind: "prose", title: "X", promptHint: "y", semanticKey: "quality" },
        { kind: "team", title: "Team", semanticKey: "team" },
        { kind: "requirement-matrix", title: "Krav", semanticKey: "requirement-matrix" },
        { kind: "references", title: "Ref", semanticKey: "references" },
        { kind: "placeholder", title: "K", instruction: "i", semanticKey: "contact" },
        { kind: "placeholder", title: "S", instruction: "i", semanticKey: "confidentiality" },
      ],
    };
    const result = validateAndRepair(plan, mockCtx);
    const keys = result.sections.map((s) => s.semanticKey);
    expect(keys).toContain("cover");
  });

  it("injects missing quality prose", () => {
    const plan: BidPlan = {
      language: "sv",
      sections: [
        { kind: "cover", semanticKey: "cover" },
        { kind: "team", title: "Team", semanticKey: "team" },
        { kind: "requirement-matrix", title: "Krav", semanticKey: "requirement-matrix" },
        { kind: "references", title: "Ref", semanticKey: "references" },
        { kind: "placeholder", title: "K", instruction: "i", semanticKey: "contact" },
        { kind: "placeholder", title: "S", instruction: "i", semanticKey: "confidentiality" },
      ],
    };
    const result = validateAndRepair(plan, mockCtx);
    const quality = result.sections.find((s) => s.semanticKey === "quality");
    expect(quality).toBeDefined();
    expect(quality?.kind).toBe("prose");
  });

  it("injects missing contact and confidentiality placeholders", () => {
    const plan: BidPlan = {
      language: "sv",
      sections: [
        { kind: "cover", semanticKey: "cover" },
        { kind: "prose", title: "Kvalitet", promptHint: "x", semanticKey: "quality" },
        { kind: "team", title: "Team", semanticKey: "team" },
        { kind: "requirement-matrix", title: "Krav", semanticKey: "requirement-matrix" },
        { kind: "references", title: "Ref", semanticKey: "references" },
      ],
    };
    const result = validateAndRepair(plan, mockCtx);
    expect(result.sections.find((s) => s.semanticKey === "contact")).toBeDefined();
    expect(result.sections.find((s) => s.semanticKey === "confidentiality")).toBeDefined();
  });

  it("injects all seven required sections when starting from empty", () => {
    const plan: BidPlan = { language: "sv", sections: [] };
    const result = validateAndRepair(plan, mockCtx);
    const keys = result.sections.map((s) => s.semanticKey);
    for (const rule of REQUIRED_SECTIONS) {
      expect(keys).toContain(rule.semanticKey);
    }
  });

  it("respects language 'en' when injecting defaults", () => {
    const plan: BidPlan = { language: "en", sections: [] };
    const result = validateAndRepair(plan, mockCtx);
    const quality = result.sections.find((s) => s.semanticKey === "quality");
    expect(quality?.kind).toBe("prose");
    // English title check — exact wording from buildDefault
    if (quality && quality.kind === "prose") {
      expect(quality.title).toBe("Quality and collaboration");
    }
  });

  it("does not duplicate sections that are already present", () => {
    const result = validateAndRepair(DEFAULT_BID_PLAN, mockCtx);
    const keys = result.sections.map((s) => s.semanticKey);
    const coverCount = keys.filter((k) => k === "cover").length;
    expect(coverCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/bid-plan-validator.test.ts`
Expected: FAIL — missing sections are not injected yet.

- [ ] **Step 3: Implement Pass A**

Replace the `validateAndRepair` body in `src/lib/bid-plan-validator.ts`:

```typescript
export function validateAndRepair(plan: BidPlan, ctx: BidContext): BidPlan {
  const cloned: BidPlan = JSON.parse(JSON.stringify(plan));

  // Pass A — inject missing required sections
  const presentKeys = new Set(
    cloned.sections.map((s) => s.semanticKey).filter((k): k is string => !!k)
  );
  for (const rule of REQUIRED_SECTIONS) {
    if (!presentKeys.has(rule.semanticKey)) {
      const injected = rule.buildDefault(ctx, cloned.language);
      cloned.sections.push(injected);
      console.log(
        `[bid-plan-validator] injected missing required section: ${rule.semanticKey}`
      );
    }
  }

  // Pass B — position enforcement (Task 6)
  // Pass C — sanity checks (Task 7)
  return cloned;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/bid-plan-validator.test.ts`
Expected: PASS — Pass A tests green, passthrough still works.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bid-plan-validator.ts src/lib/__tests__/bid-plan-validator.test.ts
git commit -m "feat(bid-planner): validator Pass A injects missing required sections"
```

---

## Task 6: Validator Pass B — position enforcement

**Goal:** After Pass A, enforce the three position constraints: `cover` → index 0, `contact` → second-to-last, `confidentiality` → last. Move existing sections to the correct position if needed. Uses `semanticKey` (not `kind`) for identification so a plain-kind `cover` without a semanticKey still gets treated correctly.

**Files:**
- Modify: `src/lib/bid-plan-validator.ts`
- Modify: `src/lib/__tests__/bid-plan-validator.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/__tests__/bid-plan-validator.test.ts`:

```typescript
describe("Pass B — position enforcement", () => {
  it("moves cover to index 0 when planner put it elsewhere", () => {
    const plan: BidPlan = {
      language: "sv",
      sections: [
        { kind: "prose", title: "X", promptHint: "y", semanticKey: "quality" },
        { kind: "cover", semanticKey: "cover" },
        { kind: "team", title: "Team", semanticKey: "team" },
        { kind: "requirement-matrix", title: "Krav", semanticKey: "requirement-matrix" },
        { kind: "references", title: "Ref", semanticKey: "references" },
        { kind: "placeholder", title: "K", instruction: "i", semanticKey: "contact" },
        { kind: "placeholder", title: "S", instruction: "i", semanticKey: "confidentiality" },
      ],
    };
    const result = validateAndRepair(plan, mockCtx);
    expect(result.sections[0].semanticKey).toBe("cover");
  });

  it("moves confidentiality to the last position", () => {
    const plan: BidPlan = {
      language: "sv",
      sections: [
        { kind: "cover", semanticKey: "cover" },
        { kind: "placeholder", title: "S", instruction: "i", semanticKey: "confidentiality" },
        { kind: "prose", title: "Kvalitet", promptHint: "x", semanticKey: "quality" },
        { kind: "team", title: "Team", semanticKey: "team" },
        { kind: "requirement-matrix", title: "Krav", semanticKey: "requirement-matrix" },
        { kind: "references", title: "Ref", semanticKey: "references" },
        { kind: "placeholder", title: "K", instruction: "i", semanticKey: "contact" },
      ],
    };
    const result = validateAndRepair(plan, mockCtx);
    const last = result.sections[result.sections.length - 1];
    expect(last.semanticKey).toBe("confidentiality");
  });

  it("moves contact to second-to-last", () => {
    const plan: BidPlan = {
      language: "sv",
      sections: [
        { kind: "cover", semanticKey: "cover" },
        { kind: "placeholder", title: "K", instruction: "i", semanticKey: "contact" },
        { kind: "prose", title: "Kvalitet", promptHint: "x", semanticKey: "quality" },
        { kind: "team", title: "Team", semanticKey: "team" },
        { kind: "requirement-matrix", title: "Krav", semanticKey: "requirement-matrix" },
        { kind: "references", title: "Ref", semanticKey: "references" },
        { kind: "placeholder", title: "S", instruction: "i", semanticKey: "confidentiality" },
      ],
    };
    const result = validateAndRepair(plan, mockCtx);
    const secondToLast = result.sections[result.sections.length - 2];
    const last = result.sections[result.sections.length - 1];
    expect(secondToLast.semanticKey).toBe("contact");
    expect(last.semanticKey).toBe("confidentiality");
  });

  it("correctly orders all three position constraints simultaneously", () => {
    const plan: BidPlan = {
      language: "sv",
      sections: [
        { kind: "placeholder", title: "S", instruction: "i", semanticKey: "confidentiality" },
        { kind: "prose", title: "Kvalitet", promptHint: "x", semanticKey: "quality" },
        { kind: "placeholder", title: "K", instruction: "i", semanticKey: "contact" },
        { kind: "team", title: "Team", semanticKey: "team" },
        { kind: "requirement-matrix", title: "Krav", semanticKey: "requirement-matrix" },
        { kind: "references", title: "Ref", semanticKey: "references" },
        { kind: "cover", semanticKey: "cover" },
      ],
    };
    const result = validateAndRepair(plan, mockCtx);
    expect(result.sections[0].semanticKey).toBe("cover");
    expect(result.sections[result.sections.length - 2].semanticKey).toBe("contact");
    expect(result.sections[result.sections.length - 1].semanticKey).toBe("confidentiality");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/bid-plan-validator.test.ts`
Expected: FAIL — Pass B tests fail; positions are not being enforced.

- [ ] **Step 3: Implement Pass B**

Replace the `validateAndRepair` body in `src/lib/bid-plan-validator.ts` (keep REQUIRED_SECTIONS and imports above):

```typescript
export function validateAndRepair(plan: BidPlan, ctx: BidContext): BidPlan {
  const cloned: BidPlan = JSON.parse(JSON.stringify(plan));

  // Pass A — inject missing required sections
  const presentKeys = new Set(
    cloned.sections.map((s) => s.semanticKey).filter((k): k is string => !!k)
  );
  for (const rule of REQUIRED_SECTIONS) {
    if (!presentKeys.has(rule.semanticKey)) {
      const injected = rule.buildDefault(ctx, cloned.language);
      cloned.sections.push(injected);
      console.log(
        `[bid-plan-validator] injected missing required section: ${rule.semanticKey}`
      );
    }
  }

  // Pass B — enforce position constraints
  cloned.sections = enforcePositions(cloned.sections);

  // Pass C — sanity checks (Task 7)
  return cloned;
}

function extractBySemanticKey(
  sections: PlannedSection[],
  key: string
): { section: PlannedSection | undefined; rest: PlannedSection[] } {
  const idx = sections.findIndex((s) => s.semanticKey === key);
  if (idx === -1) return { section: undefined, rest: sections };
  const section = sections[idx];
  const rest = [...sections.slice(0, idx), ...sections.slice(idx + 1)];
  return { section, rest };
}

function enforcePositions(sections: PlannedSection[]): PlannedSection[] {
  let working = [...sections];

  // Extract cover, contact, confidentiality in any order
  const cover = extractBySemanticKey(working, "cover");
  working = cover.rest;
  const contact = extractBySemanticKey(working, "contact");
  working = contact.rest;
  const confidentiality = extractBySemanticKey(working, "confidentiality");
  working = confidentiality.rest;

  // Re-assemble: cover first, then middle, then contact, then confidentiality
  const out: PlannedSection[] = [];
  if (cover.section) {
    out.push(cover.section);
  } else {
    console.warn("[bid-plan-validator] no cover section after Pass A — this should not happen");
  }
  out.push(...working);
  if (contact.section) out.push(contact.section);
  if (confidentiality.section) out.push(confidentiality.section);

  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/bid-plan-validator.test.ts`
Expected: PASS — Pass B tests green, previous passes still working.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bid-plan-validator.ts src/lib/__tests__/bid-plan-validator.test.ts
git commit -m "feat(bid-planner): validator Pass B enforces cover/contact/confidentiality positions"
```

---

## Task 7: Validator Pass C — sanity checks (dedupe + gantt/phases)

**Goal:** Remove duplicate `cover`/`toc`/`gantt` occurrences (keep first), auto-inject `gantt` immediately after `phases` if missing, remove orphan `gantt` with no `phases`, log a warning (don't inject) if there are no dividers for a long plan.

**Files:**
- Modify: `src/lib/bid-plan-validator.ts`
- Modify: `src/lib/__tests__/bid-plan-validator.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/__tests__/bid-plan-validator.test.ts`:

```typescript
describe("Pass C — sanity checks", () => {
  it("removes duplicate cover, keeping first", () => {
    const plan: BidPlan = {
      language: "sv",
      sections: [
        { kind: "cover", semanticKey: "cover" },
        { kind: "cover", semanticKey: "cover" },
        { kind: "prose", title: "Kvalitet", promptHint: "x", semanticKey: "quality" },
        { kind: "team", title: "Team", semanticKey: "team" },
        { kind: "requirement-matrix", title: "Krav", semanticKey: "requirement-matrix" },
        { kind: "references", title: "Ref", semanticKey: "references" },
        { kind: "placeholder", title: "K", instruction: "i", semanticKey: "contact" },
        { kind: "placeholder", title: "S", instruction: "i", semanticKey: "confidentiality" },
      ],
    };
    const result = validateAndRepair(plan, mockCtx);
    const coverCount = result.sections.filter((s) => s.kind === "cover").length;
    expect(coverCount).toBe(1);
  });

  it("removes duplicate toc and gantt, keeping first", () => {
    const plan: BidPlan = {
      language: "sv",
      sections: [
        { kind: "cover", semanticKey: "cover" },
        { kind: "toc", title: "Innehåll" },
        { kind: "toc", title: "TOC 2" },
        { kind: "phases", title: "Plan", promptHint: "x" },
        { kind: "gantt", title: "T1" },
        { kind: "gantt", title: "T2" },
        { kind: "prose", title: "Kvalitet", promptHint: "x", semanticKey: "quality" },
        { kind: "team", title: "Team", semanticKey: "team" },
        { kind: "requirement-matrix", title: "Krav", semanticKey: "requirement-matrix" },
        { kind: "references", title: "Ref", semanticKey: "references" },
        { kind: "placeholder", title: "K", instruction: "i", semanticKey: "contact" },
        { kind: "placeholder", title: "S", instruction: "i", semanticKey: "confidentiality" },
      ],
    };
    const result = validateAndRepair(plan, mockCtx);
    expect(result.sections.filter((s) => s.kind === "toc").length).toBe(1);
    expect(result.sections.filter((s) => s.kind === "gantt").length).toBe(1);
  });

  it("auto-injects gantt immediately after phases when missing", () => {
    const plan: BidPlan = {
      language: "sv",
      sections: [
        { kind: "cover", semanticKey: "cover" },
        { kind: "phases", title: "Genomförande", promptHint: "x" },
        { kind: "prose", title: "Kvalitet", promptHint: "x", semanticKey: "quality" },
        { kind: "team", title: "Team", semanticKey: "team" },
        { kind: "requirement-matrix", title: "Krav", semanticKey: "requirement-matrix" },
        { kind: "references", title: "Ref", semanticKey: "references" },
        { kind: "placeholder", title: "K", instruction: "i", semanticKey: "contact" },
        { kind: "placeholder", title: "S", instruction: "i", semanticKey: "confidentiality" },
      ],
    };
    const result = validateAndRepair(plan, mockCtx);
    const phasesIdx = result.sections.findIndex((s) => s.kind === "phases");
    const ganttIdx = result.sections.findIndex((s) => s.kind === "gantt");
    expect(ganttIdx).toBe(phasesIdx + 1);
  });

  it("removes orphan gantt with no phases", () => {
    const plan: BidPlan = {
      language: "sv",
      sections: [
        { kind: "cover", semanticKey: "cover" },
        { kind: "gantt", title: "Tidplan" },
        { kind: "prose", title: "Kvalitet", promptHint: "x", semanticKey: "quality" },
        { kind: "team", title: "Team", semanticKey: "team" },
        { kind: "requirement-matrix", title: "Krav", semanticKey: "requirement-matrix" },
        { kind: "references", title: "Ref", semanticKey: "references" },
        { kind: "placeholder", title: "K", instruction: "i", semanticKey: "contact" },
        { kind: "placeholder", title: "S", instruction: "i", semanticKey: "confidentiality" },
      ],
    };
    const result = validateAndRepair(plan, mockCtx);
    expect(result.sections.filter((s) => s.kind === "gantt").length).toBe(0);
  });

  it("leaves valid DEFAULT_BID_PLAN untouched through all passes", () => {
    const result = validateAndRepair(DEFAULT_BID_PLAN, mockCtx);
    expect(result.sections.length).toBe(DEFAULT_BID_PLAN.sections.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/bid-plan-validator.test.ts`
Expected: FAIL — Pass C tests fail; dedupe and gantt logic not implemented.

- [ ] **Step 3: Implement Pass C**

Update `validateAndRepair` in `src/lib/bid-plan-validator.ts` to call a new `sanityCheck` helper before position enforcement, and add the helper below:

```typescript
export function validateAndRepair(plan: BidPlan, ctx: BidContext): BidPlan {
  const cloned: BidPlan = JSON.parse(JSON.stringify(plan));

  // Pass A — inject missing required sections
  const presentKeys = new Set(
    cloned.sections.map((s) => s.semanticKey).filter((k): k is string => !!k)
  );
  for (const rule of REQUIRED_SECTIONS) {
    if (!presentKeys.has(rule.semanticKey)) {
      const injected = rule.buildDefault(ctx, cloned.language);
      cloned.sections.push(injected);
      console.log(
        `[bid-plan-validator] injected missing required section: ${rule.semanticKey}`
      );
    }
  }

  // Pass C — sanity checks (dedupe, gantt/phases coupling)
  cloned.sections = sanityCheck(cloned.sections);

  // Pass B — position enforcement (runs after sanity to keep constraints stable)
  cloned.sections = enforcePositions(cloned.sections);

  return cloned;
}

function sanityCheck(sections: PlannedSection[]): PlannedSection[] {
  let working = [...sections];

  // Remove duplicates of cover/toc/gantt, keep first occurrence of each
  for (const dupKind of ["cover", "toc", "gantt"] as const) {
    let seen = false;
    working = working.filter((s) => {
      if (s.kind !== dupKind) return true;
      if (seen) {
        console.log(`[bid-plan-validator] removed duplicate ${dupKind}`);
        return false;
      }
      seen = true;
      return true;
    });
  }

  // If phases exists but no gantt, auto-inject gantt right after phases
  const phasesIdx = working.findIndex((s) => s.kind === "phases");
  const ganttIdx = working.findIndex((s) => s.kind === "gantt");
  if (phasesIdx !== -1 && ganttIdx === -1) {
    const injected: PlannedSection = { kind: "gantt", title: "Tidplan" };
    working.splice(phasesIdx + 1, 0, injected);
    console.log("[bid-plan-validator] auto-injected gantt after phases");
  }

  // If gantt exists but no phases, remove orphan gantt
  if (ganttIdx !== -1 && phasesIdx === -1) {
    working = working.filter((s) => s.kind !== "gantt");
    console.warn("[bid-plan-validator] removed orphan gantt (no phases section)");
  }

  // Warn on long plan without dividers (do not inject)
  if (working.length > 6) {
    const hasDividers = working.some((s) => s.kind === "divider");
    if (!hasDividers) {
      console.warn(
        `[bid-plan-validator] plan has ${working.length} sections but no dividers — consider adding structure`
      );
    }
  }

  return working;
}
```

Note: We now run Pass C (sanity) BEFORE Pass B (positions) so the position enforcement can operate on a deduped array. Update the existing test for position enforcement still passes.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/bid-plan-validator.test.ts`
Expected: PASS — all validator tests (passthrough + A + B + C) green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bid-plan-validator.ts src/lib/__tests__/bid-plan-validator.test.ts
git commit -m "feat(bid-planner): validator Pass C dedupes cover/toc/gantt and couples gantt to phases"
```

---

## Task 8: ThreeColumnResponseSchema + FORMAT_SCHEMAS map

**Goal:** Add a Zod schema for `three-column` AI responses (new — previously three-column was data-only in the PPTX layer) and a `FORMAT_SCHEMAS` map keyed on AI-generating `kind` values. This will be consumed by the generator dispatcher in Task 10.

**Files:**
- Modify: `src/lib/ai-schemas.ts`
- Create: (test appended to existing) `src/lib/__tests__/bid-planner.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/__tests__/bid-planner.test.ts`:

```typescript
import {
  ThreeColumnResponseSchema,
  FORMAT_SCHEMAS,
} from "../ai-schemas";

describe("ThreeColumnResponseSchema", () => {
  it("parses a valid three-column response", () => {
    const raw = {
      columns: [
        { title: "Nuläge", icon: "N", body: "Text A" },
        { title: "Vad vi ser", icon: "V", body: "Text B" },
        { title: "Vårt uppdrag", icon: "U", body: "Text C" },
      ],
    };
    expect(ThreeColumnResponseSchema.safeParse(raw).success).toBe(true);
  });

  it("rejects fewer than 3 columns", () => {
    const raw = { columns: [{ title: "A", icon: "A", body: "x" }] };
    expect(ThreeColumnResponseSchema.safeParse(raw).success).toBe(false);
  });

  it("rejects more than 3 columns", () => {
    const raw = {
      columns: [
        { title: "A", icon: "A", body: "x" },
        { title: "B", icon: "B", body: "y" },
        { title: "C", icon: "C", body: "z" },
        { title: "D", icon: "D", body: "w" },
      ],
    };
    expect(ThreeColumnResponseSchema.safeParse(raw).success).toBe(false);
  });
});

describe("FORMAT_SCHEMAS", () => {
  it("maps every AI-generating kind to a schema", () => {
    expect(FORMAT_SCHEMAS.prose).toBeDefined();
    expect(FORMAT_SCHEMAS.bullets).toBeDefined();
    expect(FORMAT_SCHEMAS["three-column"]).toBeDefined();
    expect(FORMAT_SCHEMAS.phases).toBeDefined();
    expect(FORMAT_SCHEMAS.team).toBeDefined();
    expect(FORMAT_SCHEMAS.references).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/bid-planner.test.ts`
Expected: FAIL — `ThreeColumnResponseSchema` and `FORMAT_SCHEMAS` are not exported.

- [ ] **Step 3: Add ThreeColumnResponseSchema + FORMAT_SCHEMAS to `ai-schemas.ts`**

Append to `src/lib/ai-schemas.ts` (after the existing response schemas, before `AI_SECTION_SCHEMAS`):

```typescript
export const ThreeColumnResponseSchema = z.object({
  columns: z.tuple([
    z.object({ title: z.string(), icon: z.string(), body: z.string() }),
    z.object({ title: z.string(), icon: z.string(), body: z.string() }),
    z.object({ title: z.string(), icon: z.string(), body: z.string() }),
  ]),
});

// Map from AI-generating section kind to its response schema.
// Non-AI kinds (cover, toc, divider, gantt, requirement-matrix, placeholder)
// are deterministic and do not appear here.
export const FORMAT_SCHEMAS = {
  prose: ProseResponseSchema,
  bullets: BulletsResponseSchema,
  "three-column": ThreeColumnResponseSchema,
  phases: PhasesResponseSchema,
  team: TeamResponseSchema,
  references: ReferencesResponseSchema,
} as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/bid-planner.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai-schemas.ts src/lib/__tests__/bid-planner.test.ts
git commit -m "feat(bid-planner): add ThreeColumnResponseSchema and FORMAT_SCHEMAS map"
```

---

## Task 9: FORMAT_PROMPTS + semanticGuidance in bid-section-prompts.ts

**Goal:** Add format-level prompts keyed on `kind` (`prose`, `bullets`, `three-column`, `phases`, `team`, `references`) alongside the existing legacy `SECTION_PROMPTS`. Compose with a `semanticGuidance()` helper that adds theme-specific instructions for known semantic keys. Legacy exports stay in place for this task; they get removed in Task 12 after the generator migration.

**Files:**
- Modify: `src/lib/bid-section-prompts.ts`
- Create: `src/lib/__tests__/bid-section-prompts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/bid-section-prompts.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  FORMAT_PROMPTS,
  semanticGuidance,
  BidContext,
} from "../bid-section-prompts";

const mockCtx: BidContext = {
  analysis: {
    title: "Test RFP",
    client: "Test Kund",
    deadline: null,
    summary: "Test",
    requirements: [],
    evaluationCriteria: [],
    requiredCompetencies: [],
    estimatedScope: "3m",
    redFlags: [],
    domain: "IT",
  },
  teamConsultants: [],
  scoredConsultants: [],
  goNoGoResult: {
    mustRequirements: [],
    winProbability: 0,
    winProbabilityReasoning: "",
    strengths: [],
    gaps: [],
    improvements: [],
    recommendation: "go",
    reasoning: "",
  },
};

describe("semanticGuidance", () => {
  it("returns empty string for undefined key", () => {
    expect(semanticGuidance(undefined, "sv")).toBe("");
  });

  it("returns Swedish guidance for known key", () => {
    const text = semanticGuidance("quality", "sv");
    expect(text.length).toBeGreaterThan(0);
    expect(text.toLowerCase()).toContain("kvalitet");
  });

  it("returns English guidance for known key", () => {
    const text = semanticGuidance("quality", "en");
    expect(text.length).toBeGreaterThan(0);
    expect(text.toLowerCase()).toContain("quality");
  });

  it("returns empty string for unknown key", () => {
    expect(semanticGuidance("unknown-key", "sv")).toBe("");
  });
});

describe("FORMAT_PROMPTS", () => {
  it("has entries for all AI-generating formats", () => {
    expect(FORMAT_PROMPTS.prose).toBeDefined();
    expect(FORMAT_PROMPTS.bullets).toBeDefined();
    expect(FORMAT_PROMPTS["three-column"]).toBeDefined();
    expect(FORMAT_PROMPTS.phases).toBeDefined();
    expect(FORMAT_PROMPTS.team).toBeDefined();
    expect(FORMAT_PROMPTS.references).toBeDefined();
  });

  it("prose.system incorporates promptHint and language", () => {
    const system = FORMAT_PROMPTS.prose.system({
      language: "sv",
      promptHint: "Fokusera på digital mognad",
      semanticKey: "understanding",
    });
    expect(system).toContain("Fokusera på digital mognad");
    expect(system.toLowerCase()).toContain("sv");
  });

  it("three-column.system includes columnHints", () => {
    const system = FORMAT_PROMPTS["three-column"].system({
      language: "sv",
      columnHints: ["Nuläge", "Vad vi ser", "Vårt uppdrag"],
      semanticKey: undefined,
    });
    expect(system).toContain("Nuläge");
    expect(system).toContain("Vad vi ser");
    expect(system).toContain("Vårt uppdrag");
  });

  it("userContent formats BidContext", () => {
    const user = FORMAT_PROMPTS.prose.userContent(mockCtx);
    expect(user).toContain("Test RFP");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/bid-section-prompts.test.ts`
Expected: FAIL — `FORMAT_PROMPTS` and `semanticGuidance` not exported.

- [ ] **Step 3: Implement FORMAT_PROMPTS + semanticGuidance**

Append to `src/lib/bid-section-prompts.ts` (after existing code, before `export const AI_SECTION_KEYS`):

```typescript
// --- Format-level prompts (new architecture) ---

export type AiFormat = "prose" | "bullets" | "three-column" | "phases" | "team" | "references";

type Language = "sv" | "en";

interface ProseArgs {
  language: Language;
  promptHint: string;
  semanticKey: string | undefined;
}
interface BulletsArgs {
  language: Language;
  promptHint: string;
  semanticKey: string | undefined;
  minItems?: number;
}
interface ThreeColumnArgs {
  language: Language;
  columnHints: [string, string, string];
  semanticKey: string | undefined;
}
interface PhasesArgs {
  language: Language;
  promptHint: string;
  semanticKey: string | undefined;
}
interface TeamArgs {
  language: Language;
  preferredSize: number | undefined;
  semanticKey: string | undefined;
}
interface ReferencesArgs {
  language: Language;
  minCount: number | undefined;
  semanticKey: string | undefined;
}

interface FormatPromptSet {
  prose: {
    system: (args: ProseArgs) => string;
    userContent: (ctx: BidContext) => string;
  };
  bullets: {
    system: (args: BulletsArgs) => string;
    userContent: (ctx: BidContext) => string;
  };
  "three-column": {
    system: (args: ThreeColumnArgs) => string;
    userContent: (ctx: BidContext) => string;
  };
  phases: {
    system: (args: PhasesArgs) => string;
    userContent: (ctx: BidContext) => string;
  };
  team: {
    system: (args: TeamArgs) => string;
    userContent: (ctx: BidContext) => string;
  };
  references: {
    system: (args: ReferencesArgs) => string;
    userContent: (ctx: BidContext) => string;
  };
}

const SEMANTIC_GUIDANCE_SV: Record<string, string> = {
  understanding:
    "Sektionen ska visa att ni förstått uppdragets kärna — inte bara repetera RFP:n.",
  "value-proposition":
    "Sektionen ska koppla varje värdepunkt till ett specifikt område i RFP:en.",
  "execution-plan":
    "Sektionen ska bryta ner genomförandet i faser med konkreta, mätbara leverabler.",
  quality:
    "Sektionen ska täcka avstämningar, rapportering, eskalering, kunskapsöverföring.",
  risks:
    "Sektionen ska lista risker med mitigering — parade ihop, specifika för detta uppdrag.",
  team: "Sektionen ska presentera konsulterna med fokus på relevans för just detta uppdrag.",
  references:
    "Sektionen ska välja referenser som kopplar till RFP:ens krav och domän.",
};

const SEMANTIC_GUIDANCE_EN: Record<string, string> = {
  understanding:
    "This section should show you understood the core of the engagement — not just repeat the RFP.",
  "value-proposition":
    "This section should tie each value point to a specific area of the RFP.",
  "execution-plan":
    "This section should break execution into phases with concrete, measurable deliverables.",
  quality:
    "This section should cover check-ins, reporting, escalation, knowledge transfer.",
  risks:
    "This section should list risks paired with mitigations, specific to this engagement.",
  team: "This section should present consultants focused on relevance to this specific engagement.",
  references:
    "This section should pick references that tie back to the RFP's requirements and domain.",
};

export function semanticGuidance(
  key: string | undefined,
  language: Language
): string {
  if (!key) return "";
  const map = language === "sv" ? SEMANTIC_GUIDANCE_SV : SEMANTIC_GUIDANCE_EN;
  return map[key] ?? "";
}

export const FORMAT_PROMPTS: FormatPromptSet = {
  prose: {
    system: ({ language, promptHint, semanticKey }) =>
      `Du skriver en prose-sektion i ett konsultanbud på språk "${language}".
${semanticGuidance(semanticKey, language)}
Fokus enligt plannern: ${promptHint}
Svara med giltig JSON: { "text": "..." }
150–300 ord. Inga rubriker inuti texten.`,
    userContent: formatContext,
  },

  bullets: {
    system: ({ language, promptHint, semanticKey, minItems }) =>
      `Du skriver en bullets-sektion i ett konsultanbud på språk "${language}".
${semanticGuidance(semanticKey, language)}
Fokus enligt plannern: ${promptHint}
Svara med giltig JSON: { "items": ["Punkt 1", "Punkt 2", ...] }
${minItems ? `Minst ${minItems} punkter.` : "4-6 punkter."} Varje punkt: 1-2 meningar.`,
    userContent: formatContext,
  },

  "three-column": {
    system: ({ language, columnHints, semanticKey }) =>
      `Du skriver en three-column-sektion i ett konsultanbud på språk "${language}".
${semanticGuidance(semanticKey, language)}
Kolumnerna ska motsvara dessa tre teman:
1. ${columnHints[0]}
2. ${columnHints[1]}
3. ${columnHints[2]}
Svara med giltig JSON:
{
  "columns": [
    { "title": "...", "icon": "N", "body": "..." },
    { "title": "...", "icon": "V", "body": "..." },
    { "title": "...", "icon": "U", "body": "..." }
  ]
}
Varje kolumns body: 30-60 ord. icon är en enskild bokstav som representerar temat.`,
    userContent: formatContext,
  },

  phases: {
    system: ({ language, promptHint, semanticKey }) =>
      `Du skriver en phases-sektion i ett konsultanbud på språk "${language}".
${semanticGuidance(semanticKey, language)}
Fokus enligt plannern: ${promptHint}
Bryt ner genomförandet i 3-5 faser med tydliga mål, aktiviteter och leverabler.
Svara med giltig JSON:
{
  "phases": [
    {
      "name": "Fas 1: ...",
      "objective": "...",
      "activities": ["..."],
      "deliverables": ["..."],
      "duration": "2 veckor",
      "risks": ["..."],
      "hoursEstimate": 80,
      "period": "Mars 2026"
    }
  ]
}
Inkludera alltid risks (1-2 per fas), hoursEstimate och period.`,
    userContent: formatContext,
  },

  team: {
    system: ({ language, preferredSize, semanticKey }) =>
      `Du skriver en team-sektion i ett konsultanbud på språk "${language}".
${semanticGuidance(semanticKey, language)}
Presentera varje konsult med fokus på erfarenhet relevant för DETTA uppdrag.
${preferredSize ? `Fokusera på ${preferredSize} nyckelpersoner.` : ""}
Svara med giltig JSON:
{
  "members": [
    {
      "consultantId": "uuid",
      "name": "Anna Svensson",
      "role": "Projektledare",
      "relevantExperience": "10 års erfarenhet av...",
      "keyCompetencies": ["Kompetens 1", "Kompetens 2"]
    }
  ]
}
Använd EXAKT namn och ID från teamlistan.`,
    userContent: formatContext,
  },

  references: {
    system: ({ language, minCount, semanticKey }) =>
      `Du skriver en references-sektion i ett konsultanbud på språk "${language}".
${semanticGuidance(semanticKey, language)}
Välj ${minCount ?? 3}-5 relevanta referensuppdrag från teamets historik. Prioritera nyliga och domänrelevanta.
Svara med giltig JSON:
{
  "references": [
    {
      "title": "Uppdragstitel",
      "client": "Kund",
      "year": 2024,
      "description": "Kort beskrivning",
      "relevance": "Relevant eftersom..."
    }
  ]
}`,
    userContent: formatContext,
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/bid-section-prompts.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify nothing else regressed**

Run: `npx vitest run src/lib/__tests__/`
Expected: The bid-orchestrator test still passes (legacy SECTION_PROMPTS untouched). Planner + validator tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/bid-section-prompts.ts src/lib/__tests__/bid-section-prompts.test.ts
git commit -m "feat(bid-planner): add FORMAT_PROMPTS and semanticGuidance helpers"
```

---

## Task 10: buildSection dispatcher in bid-generator.ts

**Goal:** Add a new `buildSection(planned, ctx)` function that maps each `PlannedSection.kind` to a concrete `BidSection` — using deterministic builders for data-driven kinds and `callClaude` with the appropriate `FORMAT_PROMPTS` + `FORMAT_SCHEMAS` for AI-driven kinds. TOC and gantt are handled in pass B of `generateAllSections` (Task 11), not here. This task adds the dispatcher alongside the existing code; the old `generateAiSection` and orchestration stay in place until Task 11.

**Files:**
- Modify: `src/lib/bid-generator.ts`
- Modify: `src/lib/__tests__/bid-planner.test.ts` (append dispatcher test)

- [ ] **Step 1: Write the failing test**

Append to `src/lib/__tests__/bid-planner.test.ts`:

```typescript
import type { PlannedSection } from "../bid-planner";

describe("buildSection dispatcher", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("builds a cover BidSection deterministically (no AI call)", async () => {
    const { buildSection } = await import("../bid-generator");
    const planned: PlannedSection = { kind: "cover", semanticKey: "cover" };
    const section = await buildSection(planned, minimalCtx);
    expect(section.type).toBe("data");
    expect(section.content.format).toBe("cover");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("builds a divider BidSection from planned fields", async () => {
    const { buildSection } = await import("../bid-generator");
    const planned: PlannedSection = {
      kind: "divider",
      number: 2,
      title: "Genomförande",
      subtitle: "Metod och tidplan",
    };
    const section = await buildSection(planned, minimalCtx);
    expect(section.type).toBe("data");
    expect(section.content.format).toBe("section-divider");
    if (section.content.format === "section-divider") {
      expect(section.content.sectionNumber).toBe(2);
      expect(section.content.subtitle).toBe("Metod och tidplan");
    }
    expect(section.title).toBe("Genomförande");
  });

  it("builds a placeholder BidSection from planned fields", async () => {
    const { buildSection } = await import("../bid-generator");
    const planned: PlannedSection = {
      kind: "placeholder",
      title: "Pris",
      instruction: "Fyll i",
      semanticKey: "pricing",
    };
    const section = await buildSection(planned, minimalCtx);
    expect(section.type).toBe("placeholder");
    expect(section.content.format).toBe("placeholder");
  });

  it("builds a requirement-matrix deterministically", async () => {
    const { buildSection } = await import("../bid-generator");
    const planned: PlannedSection = {
      kind: "requirement-matrix",
      title: "Krav",
      semanticKey: "requirement-matrix",
    };
    const section = await buildSection(planned, minimalCtx);
    expect(section.content.format).toBe("requirement-matrix");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("builds a prose section via AI call", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: '{ "text": "Prose content" }' }],
    });
    const { buildSection } = await import("../bid-generator");
    const planned: PlannedSection = {
      kind: "prose",
      title: "Förståelse",
      promptHint: "Visa förståelse",
      semanticKey: "understanding",
    };
    const section = await buildSection(planned, minimalCtx);
    expect(section.type).toBe("ai");
    expect(section.content.format).toBe("prose");
    if (section.content.format === "prose") {
      expect(section.content.text).toBe("Prose content");
    }
  });

  it("builds a three-column section via AI call", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            columns: [
              { title: "A", icon: "A", body: "text a" },
              { title: "B", icon: "B", body: "text b" },
              { title: "C", icon: "C", body: "text c" },
            ],
          }),
        },
      ],
    });
    const { buildSection } = await import("../bid-generator");
    const planned: PlannedSection = {
      kind: "three-column",
      title: "Perspektiv",
      columnHints: ["Nuläge", "Vad vi ser", "Vårt uppdrag"],
    };
    const section = await buildSection(planned, minimalCtx);
    expect(section.content.format).toBe("three-column");
    if (section.content.format === "three-column") {
      expect(section.content.columns).toHaveLength(3);
    }
  });

  it("throws on unknown kind (exhaustiveness check)", async () => {
    const { buildSection } = await import("../bid-generator");
    const planned = { kind: "bogus", title: "X" } as unknown as PlannedSection;
    await expect(buildSection(planned, minimalCtx)).rejects.toThrow(/Unhandled kind/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/bid-planner.test.ts`
Expected: FAIL — `buildSection` not exported from bid-generator.

- [ ] **Step 3: Implement `buildSection` in `bid-generator.ts`**

Add the following to `src/lib/bid-generator.ts` (place after the existing `buildGanttSection` function). Do NOT delete existing code yet — we remove it in Task 11.

```typescript
import type { BidPlan, PlannedSection } from "./bid-planner";
import { FORMAT_PROMPTS, FormatPromptSet, semanticGuidance as _sg } from "./bid-section-prompts"; // eslint-disable-line @typescript-eslint/no-unused-vars -- types used by FORMAT_PROMPTS
import { FORMAT_SCHEMAS } from "./ai-schemas";

// Note: existing imports from bid-section-prompts (BidContext, getSectionPrompt, AI_SECTION_KEYS)
// remain valid until Task 12. FORMAT_PROMPTS is the new path.

export async function buildSection(
  planned: PlannedSection,
  ctx: BidContext
): Promise<BidSection> {
  switch (planned.kind) {
    case "cover":
      return buildCoverSection(ctx.analysis);

    case "divider":
      return buildDividerFromPlan(planned);

    case "placeholder":
      return buildPlaceholderFromPlan(planned);

    case "requirement-matrix":
      return buildRequirementMatrixFromPlan(planned, ctx);

    case "prose":
      return buildProseViaAi(planned, ctx);

    case "bullets":
      return buildBulletsViaAi(planned, ctx);

    case "three-column":
      return buildThreeColumnViaAi(planned, ctx);

    case "phases":
      return buildPhasesViaAi(planned, ctx);

    case "team":
      return buildTeamViaAi(planned, ctx);

    case "references":
      return buildReferencesViaAi(planned, ctx);

    case "toc":
    case "gantt": {
      // Handled in pass B of generateAllSections — not here.
      throw new Error(
        `buildSection: ${planned.kind} must be handled in pass B, not direct dispatch`
      );
    }

    default: {
      const _exhaustive: never = planned;
      throw new Error(`Unhandled kind: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

// --- Deterministic builders from planned fields ---

function buildDividerFromPlan(
  planned: Extract<PlannedSection, { kind: "divider" }>
): BidSection {
  return {
    type: "data",
    key: `divider-${planned.number}`,
    title: planned.title,
    content: {
      format: "section-divider",
      sectionNumber: planned.number,
      subtitle: planned.subtitle,
    },
    generatedAt: new Date().toISOString(),
  };
}

function buildPlaceholderFromPlan(
  planned: Extract<PlannedSection, { kind: "placeholder" }>
): BidSection {
  return {
    type: "placeholder",
    key: planned.semanticKey ?? `placeholder-${planned.title.toLowerCase().replace(/\s+/g, "-")}`,
    title: planned.title,
    content: { format: "placeholder", instruction: planned.instruction },
    generatedAt: new Date().toISOString(),
  };
}

function buildRequirementMatrixFromPlan(
  planned: Extract<PlannedSection, { kind: "requirement-matrix" }>,
  ctx: BidContext
): BidSection {
  const base = buildRequirementMatrix(ctx.analysis, ctx.teamConsultants);
  return { ...base, title: planned.title };
}

// --- AI-backed builders ---

async function buildProseViaAi(
  planned: Extract<PlannedSection, { kind: "prose" }>,
  ctx: BidContext
): Promise<BidSection> {
  const prompt = FORMAT_PROMPTS.prose;
  const parsed = await callClaude({
    model: "claude-opus-4-6",
    maxTokens: 4000,
    system: prompt.system({
      language: "sv", // Language is plumbed from plan in Task 11
      promptHint: planned.promptHint,
      semanticKey: planned.semanticKey,
    }),
    userContent: prompt.userContent(ctx),
    schema: FORMAT_SCHEMAS.prose,
    label: `prose "${planned.title}"`,
  });
  return {
    type: "ai",
    key: planned.semanticKey ?? slugifyTitle(planned.title),
    title: planned.title,
    content: { format: "prose", text: parsed.text },
    generatedAt: new Date().toISOString(),
  };
}

async function buildBulletsViaAi(
  planned: Extract<PlannedSection, { kind: "bullets" }>,
  ctx: BidContext
): Promise<BidSection> {
  const prompt = FORMAT_PROMPTS.bullets;
  const parsed = await callClaude({
    model: "claude-opus-4-6",
    maxTokens: 4000,
    system: prompt.system({
      language: "sv",
      promptHint: planned.promptHint,
      semanticKey: planned.semanticKey,
      minItems: planned.minItems,
    }),
    userContent: prompt.userContent(ctx),
    schema: FORMAT_SCHEMAS.bullets,
    label: `bullets "${planned.title}"`,
  });
  return {
    type: "ai",
    key: planned.semanticKey ?? slugifyTitle(planned.title),
    title: planned.title,
    content: { format: "bullets", items: parsed.items },
    generatedAt: new Date().toISOString(),
  };
}

async function buildThreeColumnViaAi(
  planned: Extract<PlannedSection, { kind: "three-column" }>,
  ctx: BidContext
): Promise<BidSection> {
  const prompt = FORMAT_PROMPTS["three-column"];
  const parsed = await callClaude({
    model: "claude-opus-4-6",
    maxTokens: 4000,
    system: prompt.system({
      language: "sv",
      columnHints: planned.columnHints,
      semanticKey: planned.semanticKey,
    }),
    userContent: prompt.userContent(ctx),
    schema: FORMAT_SCHEMAS["three-column"],
    label: `three-column "${planned.title}"`,
  });
  return {
    type: "ai",
    key: planned.semanticKey ?? slugifyTitle(planned.title),
    title: planned.title,
    content: { format: "three-column", columns: [...parsed.columns] },
    generatedAt: new Date().toISOString(),
  };
}

async function buildPhasesViaAi(
  planned: Extract<PlannedSection, { kind: "phases" }>,
  ctx: BidContext
): Promise<BidSection> {
  const prompt = FORMAT_PROMPTS.phases;
  const parsed = await callClaude({
    model: "claude-opus-4-6",
    maxTokens: 4000,
    system: prompt.system({
      language: "sv",
      promptHint: planned.promptHint,
      semanticKey: planned.semanticKey,
    }),
    userContent: prompt.userContent(ctx),
    schema: FORMAT_SCHEMAS.phases,
    label: `phases "${planned.title}"`,
  });
  return {
    type: "ai",
    key: planned.semanticKey ?? slugifyTitle(planned.title),
    title: planned.title,
    content: { format: "phases", phases: parsed.phases },
    generatedAt: new Date().toISOString(),
  };
}

async function buildTeamViaAi(
  planned: Extract<PlannedSection, { kind: "team" }>,
  ctx: BidContext
): Promise<BidSection> {
  const prompt = FORMAT_PROMPTS.team;
  const parsed = await callClaude({
    model: "claude-opus-4-6",
    maxTokens: 4000,
    system: prompt.system({
      language: "sv",
      preferredSize: planned.preferredSize,
      semanticKey: planned.semanticKey,
    }),
    userContent: prompt.userContent(ctx),
    schema: FORMAT_SCHEMAS.team,
    label: `team "${planned.title}"`,
  });
  return {
    type: "ai",
    key: planned.semanticKey ?? "team",
    title: planned.title,
    content: { format: "team", members: parsed.members },
    generatedAt: new Date().toISOString(),
  };
}

async function buildReferencesViaAi(
  planned: Extract<PlannedSection, { kind: "references" }>,
  ctx: BidContext
): Promise<BidSection> {
  const prompt = FORMAT_PROMPTS.references;
  const parsed = await callClaude({
    model: "claude-opus-4-6",
    maxTokens: 4000,
    system: prompt.system({
      language: "sv",
      minCount: planned.minCount,
      semanticKey: planned.semanticKey,
    }),
    userContent: prompt.userContent(ctx),
    schema: FORMAT_SCHEMAS.references,
    label: `references "${planned.title}"`,
  });
  return {
    type: "ai",
    key: planned.semanticKey ?? "references",
    title: planned.title,
    content: { format: "references", references: parsed.references },
    generatedAt: new Date().toISOString(),
  };
}

function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/bid-planner.test.ts`
Expected: PASS — all dispatcher tests green. Note: the unused `FormatPromptSet` import will trigger a lint warning; that's intentional for this checkpoint and gets cleaned up naturally by later edits. Do not suppress beyond the single eslint-disable-line already in place.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: No new errors introduced by the dispatcher. Pre-existing errors elsewhere are acceptable.

- [ ] **Step 6: Commit**

```bash
git add src/lib/bid-generator.ts src/lib/__tests__/bid-planner.test.ts
git commit -m "feat(bid-planner): add buildSection dispatcher with exhaustiveness guard"
```

---

## Task 11: Refactor generateAllSections to use planner + validator + dispatcher

**Goal:** Replace the hardcoded orchestration in `generateAllSections` with a planner-driven flow: `planBidOrFallback` → `validateAndRepair` → parallel `buildSection` for non-deferred kinds → sequential post-pass for `toc` and `gantt` → return `{ sections, plan }`. Preserve the `onSectionComplete` callback for DB progress streaming. Remove now-dead constants (`SECTION_ORDER`, `SECTION_TITLES`, `SECTION_FORMAT`, `PLACEHOLDER_SECTIONS`) and the legacy `generateAiSection` helper. Implement per-section failure fallback: if a single `buildSection` call fails, replace that section with a placeholder instead of crashing.

**Files:**
- Modify: `src/lib/bid-generator.ts`
- Modify: `src/lib/__tests__/bid-planner.test.ts` (append integration test)

- [ ] **Step 1: Write the failing test**

Append to `src/lib/__tests__/bid-planner.test.ts`:

```typescript
describe("generateAllSections (planner-driven)", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("returns sections in plan order and includes plan in result", async () => {
    // First call = planner. Return a minimal plan.
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            language: "sv",
            sections: [
              { kind: "cover", semanticKey: "cover" },
              { kind: "prose", title: "Förståelse", promptHint: "x", semanticKey: "understanding" },
              { kind: "prose", title: "Kvalitet", promptHint: "x", semanticKey: "quality" },
              { kind: "team", title: "Team", semanticKey: "team" },
              { kind: "requirement-matrix", title: "Krav", semanticKey: "requirement-matrix" },
              { kind: "references", title: "Ref", semanticKey: "references" },
              { kind: "placeholder", title: "Kontakt", instruction: "i", semanticKey: "contact" },
              { kind: "placeholder", title: "Sekretess", instruction: "i", semanticKey: "confidentiality" },
            ],
          }),
        },
      ],
    });
    // Subsequent calls = content generation (order not guaranteed due to Promise.all).
    // Return generic valid responses for each schema.
    mockCreate.mockImplementation(({ system }: { system: string }) => {
      if (system.includes("prose-sektion")) {
        return Promise.resolve({
          content: [{ type: "text", text: '{ "text": "Prose text" }' }],
        });
      }
      if (system.includes("team-sektion")) {
        return Promise.resolve({
          content: [
            {
              type: "text",
              text: '{ "members": [{ "consultantId": "c1", "name": "Anna", "role": "Lead", "relevantExperience": "10y", "keyCompetencies": ["PM"] }] }',
            },
          ],
        });
      }
      if (system.includes("references-sektion")) {
        return Promise.resolve({
          content: [
            {
              type: "text",
              text: '{ "references": [{ "title": "R1", "client": "C", "year": 2024, "description": "d", "relevance": "r" }] }',
            },
          ],
        });
      }
      return Promise.resolve({
        content: [{ type: "text", text: '{ "text": "fallback" }' }],
      });
    });

    const { generateAllSections } = await import("../bid-generator");
    const { sections, plan } = await generateAllSections(minimalCtx);

    expect(plan).toBeDefined();
    expect(plan.sections[0].kind).toBe("cover");

    expect(sections[0].content.format).toBe("cover");
    const last = sections[sections.length - 1];
    expect(last.content.format).toBe("placeholder");
    // Confidentiality is the last section
    expect(last.title.toLowerCase()).toMatch(/sekretess|confidentiality/i);
  });

  it("streams progress via onSectionComplete", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            language: "sv",
            sections: [
              { kind: "cover", semanticKey: "cover" },
              { kind: "placeholder", title: "Kontakt", instruction: "i", semanticKey: "contact" },
              { kind: "placeholder", title: "S", instruction: "i", semanticKey: "confidentiality" },
            ],
          }),
        },
      ],
    });

    const { generateAllSections } = await import("../bid-generator");
    const progress: string[] = [];
    await generateAllSections(minimalCtx, (s) => {
      progress.push(s.title);
    });
    expect(progress.length).toBeGreaterThan(0);
  });

  it("replaces failed section with placeholder (graceful degradation)", async () => {
    // Planner returns valid plan with one prose section
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            language: "sv",
            sections: [
              { kind: "cover", semanticKey: "cover" },
              { kind: "prose", title: "Förståelse", promptHint: "x", semanticKey: "understanding" },
              { kind: "placeholder", title: "Kontakt", instruction: "i", semanticKey: "contact" },
              { kind: "placeholder", title: "S", instruction: "i", semanticKey: "confidentiality" },
            ],
          }),
        },
      ],
    });
    // Prose content call ALWAYS returns invalid JSON (fails all retries)
    mockCreate.mockImplementation(() =>
      Promise.resolve({ content: [{ type: "text", text: "not json" }] })
    );

    const { generateAllSections } = await import("../bid-generator");
    const { sections } = await generateAllSections(minimalCtx);
    // The prose section should be replaced with a placeholder
    const understanding = sections.find((s) => s.title === "Förståelse");
    expect(understanding).toBeDefined();
    expect(understanding?.content.format).toBe("placeholder");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/bid-planner.test.ts`
Expected: FAIL — current `generateAllSections` signature returns `{ sections }`, not `{ sections, plan }`, and uses hardcoded orchestration.

- [ ] **Step 3: Replace the orchestration in `bid-generator.ts`**

Open `src/lib/bid-generator.ts`. Delete the following (all inside the existing file):
- The `SECTION_TITLES` constant
- The `SECTION_FORMAT` constant
- The `generateAiSection` function (lines roughly 164–218)
- The `PLACEHOLDER_SECTIONS` constant
- The `SECTION_ORDER` constant
- The existing `generateAllSections` function body (we rewrite below)
- The unused `STOP_WORDS` + `buildGanttSection` + `buildTocSection` functions (the new flow derives TOC and gantt in place; the helpers are no longer called)

Keep:
- `buildCoverSection` (used by dispatcher)
- `buildRequirementMatrix` + `STOP_WORDS` if still used — actually the new `buildRequirementMatrixFromPlan` calls it, so keep `buildRequirementMatrix` and `STOP_WORDS`. Confirm by grep before deleting.
- `buildPlaceholderSection` and `buildSectionDivider` if unused — delete if nothing calls them.
- `buildSection` dispatcher from Task 10

Then add the new orchestration at the bottom of the file:

```typescript
import { planBidOrFallback, BidPlan, PlannedSection } from "./bid-planner";
import { validateAndRepair } from "./bid-plan-validator";

export async function generateAllSections(
  ctx: BidContext,
  onSectionComplete?: (section: BidSection) => void | Promise<void>
): Promise<{ sections: BidSection[]; plan: BidPlan }> {
  // 1. Plan
  const rawPlan = await planBidOrFallback(ctx);
  console.log("[bid-generator] raw plan:", JSON.stringify(rawPlan, null, 2));

  // 2. Validate + repair
  const plan = validateAndRepair(rawPlan, ctx);
  console.log("[bid-generator] validated plan:", JSON.stringify(plan, null, 2));
  if (plan.unmappedRequirements && plan.unmappedRequirements.length > 0) {
    console.warn("[bid-generator] unmapped requirements:", plan.unmappedRequirements);
  }

  // 3. Pass A — build independent sections in parallel (everything except toc and gantt)
  const deferredKinds = new Set<PlannedSection["kind"]>(["toc", "gantt"]);
  const passAIndexes: number[] = [];
  const passAPromises: Promise<BidSection>[] = [];

  plan.sections.forEach((planned, idx) => {
    if (deferredKinds.has(planned.kind)) return;
    passAIndexes.push(idx);
    passAPromises.push(buildSectionSafe(planned, ctx));
  });

  const passAResults = await Promise.all(passAPromises);

  // Assemble initial result array with holes where toc/gantt will go
  const out: (BidSection | undefined)[] = new Array(plan.sections.length).fill(undefined);
  passAIndexes.forEach((origIdx, i) => {
    out[origIdx] = passAResults[i];
  });

  // Fire progress callbacks for Pass A sections in plan order
  for (const idx of passAIndexes) {
    const section = out[idx];
    if (section && onSectionComplete) {
      await onSectionComplete(section);
    }
  }

  // 4. Pass B — toc and gantt (depend on other sections)
  for (let idx = 0; idx < plan.sections.length; idx++) {
    const planned = plan.sections[idx];
    if (planned.kind === "toc") {
      const otherTitles = out
        .filter((s): s is BidSection => !!s)
        .filter((s) => s.content.format !== "cover" && s.content.format !== "section-divider")
        .map((s) => s.title);
      out[idx] = {
        type: "data",
        key: "toc",
        title: planned.title,
        content: { format: "bullets", items: otherTitles },
        generatedAt: new Date().toISOString(),
      };
      if (onSectionComplete) await onSectionComplete(out[idx]!);
    } else if (planned.kind === "gantt") {
      // Find the phases section that produced concrete phase data
      const phasesSection = out.find(
        (s): s is BidSection => !!s && s.content.format === "phases"
      );
      if (phasesSection && phasesSection.content.format === "phases") {
        out[idx] = {
          type: "data",
          key: "gantt",
          title: planned.title,
          content: {
            format: "gantt",
            phases: phasesSection.content.phases,
            milestones: [],
          },
          generatedAt: new Date().toISOString(),
        };
      } else {
        // Fallback: gantt without phases — replace with placeholder
        out[idx] = {
          type: "placeholder",
          key: "gantt",
          title: planned.title,
          content: { format: "placeholder", instruction: "Ingen fasdata tillgänglig för tidplan" },
          generatedAt: new Date().toISOString(),
        };
      }
      if (onSectionComplete) await onSectionComplete(out[idx]!);
    }
  }

  const sections = out.filter((s): s is BidSection => !!s);
  return { sections, plan };
}

async function buildSectionSafe(
  planned: PlannedSection,
  ctx: BidContext
): Promise<BidSection> {
  try {
    return await buildSection(planned, ctx);
  } catch (err) {
    console.error(
      `[bid-generator] section "${"title" in planned ? planned.title : planned.kind}" failed, using placeholder fallback:`,
      err
    );
    const title = "title" in planned ? planned.title : planned.kind;
    return {
      type: "placeholder",
      key: planned.semanticKey ?? `${planned.kind}-failed`,
      title,
      content: {
        format: "placeholder",
        instruction: "Kunde inte auto-generera sektionen — fyll i manuellt.",
      },
      generatedAt: new Date().toISOString(),
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/bid-planner.test.ts`
Expected: PASS — generateAllSections tests green.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: `bid-generator.ts` compiles clean. If `buildSectionDivider`, `buildPlaceholderSection`, or `buildTocSection` / `buildGanttSection` are now unused, delete them. If `AI_SECTION_KEYS` or `getSectionPrompt` imports are unused, remove them from the import statement.

- [ ] **Step 6: Commit**

```bash
git add src/lib/bid-generator.ts src/lib/__tests__/bid-planner.test.ts
git commit -m "feat(bid-planner): refactor generateAllSections to planner-driven flow"
```

---

## Task 12: Remove legacy SECTION_PROMPTS from bid-section-prompts.ts

**Goal:** Delete the now-dead `SECTION_PROMPTS`, `getSectionPrompt`, `AI_SECTION_KEYS`, and `SectionPrompt` interface from `bid-section-prompts.ts`. Also remove the matching `AI_SECTION_SCHEMAS` map from `ai-schemas.ts` (replaced by `FORMAT_SCHEMAS`). Verifies that nothing still depends on the legacy identity-keyed exports.

**Files:**
- Modify: `src/lib/bid-section-prompts.ts`
- Modify: `src/lib/ai-schemas.ts`

- [ ] **Step 1: Grep for remaining legacy imports**

Run: `rg -n "SECTION_PROMPTS|AI_SECTION_KEYS|AI_SECTION_SCHEMAS|getSectionPrompt" src/`
Expected: Only `bid-section-prompts.ts` and `ai-schemas.ts` definitions, plus tests. If `bid-generator.ts` or `bid-orchestrator.test.ts` still imports any of them, fix in Task 13.

- [ ] **Step 2: Delete legacy exports from `bid-section-prompts.ts`**

In `src/lib/bid-section-prompts.ts`, remove:
- The `SectionPrompt` interface
- The `SECTION_PROMPTS` constant
- The `getSectionPrompt` function
- The `AI_SECTION_KEYS` exported constant at the bottom

Keep:
- `BidContext` interface
- `formatContext` helper function
- `AiFormat` type
- `semanticGuidance` function
- `SEMANTIC_GUIDANCE_SV` / `SEMANTIC_GUIDANCE_EN` maps
- `FORMAT_PROMPTS` and its supporting interfaces

- [ ] **Step 3: Delete legacy map from `ai-schemas.ts`**

In `src/lib/ai-schemas.ts`, remove the `AI_SECTION_SCHEMAS` constant (replaced by `FORMAT_SCHEMAS`).

- [ ] **Step 4: Run all tests**

Run: `npx vitest run src/lib/__tests__/`
Expected: Some tests will fail — specifically `bid-orchestrator.test.ts` because it still mocks the old Swedish-prompt matching. That's Task 13's job. All other tests (bid-planner, bid-plan-validator, bid-section-prompts, pptx-renderer) should pass.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: `bid-generator.ts`, `bid-section-prompts.ts`, `bid-planner.ts`, `bid-plan-validator.ts` all compile clean. If the bid-orchestrator test file has unresolved imports, that's OK — Task 13 fixes it.

- [ ] **Step 6: Commit**

```bash
git add src/lib/bid-section-prompts.ts src/lib/ai-schemas.ts
git commit -m "refactor(bid-planner): remove legacy SECTION_PROMPTS and AI_SECTION_SCHEMAS"
```

---

## Task 13: Update bid-orchestrator.test.ts for planner-driven flow

**Goal:** Rewrite the integration test to mock the planner call (first `mockCreate`) and the content calls (subsequent `mockCreate` invocations), matching by format-level system prompts instead of the old section-identity Swedish strings.

**Files:**
- Modify: `src/lib/__tests__/bid-orchestrator.test.ts`

- [ ] **Step 1: Read the existing file**

Read `src/lib/__tests__/bid-orchestrator.test.ts`. The old structure mocked by matching `system.includes("Uppdragsförståelse")` etc. That no longer matches — the new system prompts talk about formats (`prose-sektion`, `team-sektion`, etc.).

- [ ] **Step 2: Rewrite the mock implementation**

Replace the entire contents of `src/lib/__tests__/bid-orchestrator.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BidContext } from "../bid-section-prompts";

const mockCreate = vi.hoisted(() => vi.fn());

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: function () {
      return { messages: { create: mockCreate } };
    },
  };
});

const mockContext: BidContext = {
  analysis: {
    title: "Test RFP",
    client: "Test Client",
    deadline: null,
    summary: "Test",
    requirements: [
      { category: "Kompetens", description: "Projektledning", priority: "must" },
    ],
    evaluationCriteria: [],
    requiredCompetencies: [],
    estimatedScope: "3 months",
    redFlags: [],
    domain: "IT",
  },
  teamConsultants: [
    {
      id: "c1",
      organizationId: "org1",
      name: "Anna",
      level: "senior",
      yearsExperience: 10,
      summary: "Lead",
      rawCvText: null,
      competencies: [{ competency: "projektledning", category: "methodology" }],
      references: [],
      createdAt: "",
      updatedAt: "",
    },
  ],
  scoredConsultants: [
    { consultantId: "c1", consultantName: "Anna", level: "senior", score: 90, reasoning: "Great" },
  ],
  goNoGoResult: {
    mustRequirements: [{ requirement: "Projektledning", met: true, coveredBy: "Anna" }],
    winProbability: 80,
    winProbabilityReasoning: "Strong",
    strengths: ["Experienced team"],
    gaps: [],
    improvements: [],
    recommendation: "go",
    reasoning: "Go ahead",
  },
};

const PLANNER_RESPONSE = JSON.stringify({
  language: "sv",
  sections: [
    { kind: "cover", semanticKey: "cover" },
    { kind: "toc", title: "Innehåll" },
    { kind: "prose", title: "Uppdragsförståelse", promptHint: "Visa förståelse", semanticKey: "understanding" },
    { kind: "bullets", title: "Identifierat värde", promptHint: "4-6 värdepunkter", semanticKey: "value-proposition" },
    { kind: "phases", title: "Genomförandeplan", promptHint: "3-5 faser", semanticKey: "execution-plan" },
    { kind: "gantt", title: "Tidplan" },
    { kind: "prose", title: "Kvalitet", promptHint: "Kvalitet", semanticKey: "quality" },
    { kind: "team", title: "Team", semanticKey: "team" },
    { kind: "requirement-matrix", title: "Krav", semanticKey: "requirement-matrix" },
    { kind: "references", title: "Referenser", semanticKey: "references" },
    { kind: "placeholder", title: "Pris", instruction: "Fyll i", semanticKey: "pricing" },
    { kind: "placeholder", title: "Kontakt", instruction: "Fyll i", semanticKey: "contact" },
    { kind: "placeholder", title: "Sekretess", instruction: "Fyll i", semanticKey: "confidentiality" },
  ],
});

describe("generateAllSections (integration, planner-driven)", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    let callCount = 0;
    mockCreate.mockImplementation(({ system }: { system: string }) => {
      callCount++;
      // First call is the planner
      if (callCount === 1) {
        return Promise.resolve({
          content: [{ type: "text", text: PLANNER_RESPONSE }],
        });
      }
      // Subsequent calls are content — match by format keyword in system prompt
      if (system.includes("prose-sektion")) {
        return Promise.resolve({
          content: [{ type: "text", text: '{ "text": "Prose content" }' }],
        });
      }
      if (system.includes("bullets-sektion")) {
        return Promise.resolve({
          content: [{ type: "text", text: '{ "items": ["Point 1", "Point 2"] }' }],
        });
      }
      if (system.includes("phases-sektion")) {
        return Promise.resolve({
          content: [
            {
              type: "text",
              text: '{ "phases": [{ "name": "Fas 1", "objective": "Goal", "activities": ["A"], "deliverables": ["D"], "duration": "2w" }] }',
            },
          ],
        });
      }
      if (system.includes("team-sektion")) {
        return Promise.resolve({
          content: [
            {
              type: "text",
              text: '{ "members": [{ "consultantId": "c1", "name": "Anna", "role": "Lead", "relevantExperience": "10y", "keyCompetencies": ["PM"] }] }',
            },
          ],
        });
      }
      if (system.includes("references-sektion")) {
        return Promise.resolve({
          content: [
            {
              type: "text",
              text: '{ "references": [{ "title": "R1", "client": "C", "year": 2024, "description": "d", "relevance": "r" }] }',
            },
          ],
        });
      }
      if (system.includes("three-column-sektion")) {
        return Promise.resolve({
          content: [
            {
              type: "text",
              text: '{ "columns": [{"title":"A","icon":"A","body":"x"},{"title":"B","icon":"B","body":"y"},{"title":"C","icon":"C","body":"z"}] }',
            },
          ],
        });
      }
      return Promise.resolve({
        content: [{ type: "text", text: '{ "text": "fallback" }' }],
      });
    });
  });

  it("returns all sections in plan order with required ones present", async () => {
    const { generateAllSections } = await import("../bid-generator");
    const { sections, plan } = await generateAllSections(mockContext);

    expect(plan).toBeDefined();
    const formats = sections.map((s) => s.content.format);
    expect(formats[0]).toBe("cover");
    expect(sections.find((s) => s.title === "Uppdragsförståelse")).toBeDefined();
    expect(sections.find((s) => s.title === "Team")).toBeDefined();
    expect(sections.find((s) => s.title === "Krav")).toBeDefined();
    expect(sections.find((s) => s.title === "Referenser")).toBeDefined();
    expect(sections.find((s) => s.title === "Kontakt")).toBeDefined();
    expect(sections.find((s) => s.title === "Sekretess")).toBeDefined();

    // Confidentiality is last
    expect(sections[sections.length - 1].title).toBe("Sekretess");
  });

  it("calls onSectionComplete callback for each generated section", async () => {
    const { generateAllSections } = await import("../bid-generator");
    const completed: string[] = [];
    await generateAllSections(mockContext, (section) => {
      completed.push(section.title);
    });

    expect(completed.length).toBeGreaterThan(0);
    // Every reported section should appear in final output
    expect(completed).toContain("Team");
    expect(completed).toContain("Krav");
  });
});
```

- [ ] **Step 3: Run test**

Run: `npx vitest run src/lib/__tests__/bid-orchestrator.test.ts`
Expected: PASS — two integration tests green.

- [ ] **Step 4: Run the full vitest suite for the lib directory**

Run: `npx vitest run src/lib/__tests__/`
Expected: All bid-planner, bid-plan-validator, bid-section-prompts, bid-orchestrator, and pptx-renderer tests pass. Pre-existing failures in unrelated files (e.g. AI-auth failures noted in the pptx-v2 session) are acceptable.

- [ ] **Step 5: Commit**

```bash
git add src/lib/__tests__/bid-orchestrator.test.ts
git commit -m "test(bid-planner): update integration test for planner-driven flow"
```

---

## Task 14: End-to-end smoke via generate-sample-pptx + manual eval notes

**Goal:** Run the sample PPTX generator to confirm the full pipeline (planner → validator → generator → renderer) produces a valid PPTX file for a realistic input. Set up a manual eval notes file for tracking prompt iterations against real RFPs.

**Files:**
- Create: `notes/2026-04-11-bid-planner-eval.md`
- Possibly modify: `scripts/generate-sample-pptx.ts` (if it needs to be adapted to call `generateAllSections` instead of constructing sections manually — verify first)

- [ ] **Step 1: Inspect the sample script**

Read `scripts/generate-sample-pptx.ts`. It currently builds `BidSection[]` manually and calls `renderBidToPptx`. That's still valid after the refactor because the renderer contract is unchanged. We do NOT need the script to run the planner — it's a renderer smoke test.

- [ ] **Step 2: Run the sample script**

Run: `npx tsx scripts/generate-sample-pptx.ts`
Expected: Writes `tmp/sample-bid.pptx` (>300KB). No type errors, no runtime crashes. This confirms our type-level changes (new `three-column` PPTX content shape etc.) haven't broken the renderer path.

- [ ] **Step 3: Create the manual eval notes file**

Create `notes/2026-04-11-bid-planner-eval.md`:

```markdown
# Bid Planner — Manual Prompt Eval Journal

Purpose: track planner output quality against real RFPs as prompts evolve.

## How to run

```
# From repo root, with a real RfpAnalysis + team loaded in the DB:
npm run dev
# Trigger bid generation via the app UI, inspect console logs for:
# - [bid-planner] raw plan
# - [bid-plan-validator] repair actions
# - [bid-generator] unmapped requirements
```

Or unit-style:

```
# In a scratch script that constructs a BidContext and calls planBid directly
```

## Eval criteria

For each real RFP tested, score the planner's output on:

1. **Structural fit** — does the section list match what a good consultant would propose for this RFP? (1-5)
2. **Format variation** — does the plan use three-column/bullets/phases where appropriate, or does it fall back to prose? (1-5)
3. **Required sections** — are all 7 required `semanticKey` values present? (pass/fail — validator should always repair, but the raw plan should ideally already have them)
4. **Unmapped requirements** — were there real RFP requirements that didn't fit any format? How many? Is the `unmappedRequirements` list accurate?
5. **Rationale quality** — is the `rationale` field meaningful or generic?

## RFP eval log

### RFP #1 — [TBD during manual eval]

- **File:** tmp/rfp-1.pdf
- **Domain:** 
- **Date tested:** 
- **Scores:** structural _, variation _, required _/7, unmapped _, rationale _
- **Notes:** 
- **Prompt changes suggested:** 

### RFP #2 — [TBD]

...

## Prompt change log

| Date | File | Change | Reason |
|---|---|---|---|
| 2026-04-11 | bid-planner.ts | Initial system prompt | MVP baseline |
```

- [ ] **Step 4: Verify renderer smoke + file size**

Run: `ls -la tmp/sample-bid.pptx` (via Bash) or `Get-Item tmp/sample-bid.pptx | Select-Object Length` on PowerShell.
Expected: File exists and is reasonably sized (>100KB).

- [ ] **Step 5: Run full test suite one more time**

Run: `npx vitest run src/lib/__tests__/`
Expected: All bid-planner-related tests green. Note any unrelated pre-existing failures and mention them in the commit message (don't fix them here).

- [ ] **Step 6: Commit**

```bash
git add notes/2026-04-11-bid-planner-eval.md
git commit -m "docs(bid-planner): add manual prompt eval journal"
```

- [ ] **Step 7: Final verification**

Run: `git log --oneline feat/pptx-v2-polish..HEAD` (adjust base branch as needed)
Expected: 14 commits corresponding to the 14 tasks, each with a conventional-commit subject and no "WIP" or "checkpoint" messages.

---

## After implementation — manual gates before release

These are not plan tasks, but must happen before merging to main:

1. **Run `planBid` against 3–5 real RFPs** (from the local test corpus or scrubbed real-client RFPs). For each one, log the raw plan and the validated plan. Verify:
   - Each run produces a usable plan (non-crash)
   - Format variation happens (not all prose)
   - Unmapped requirements are accurate
2. **Render a full bid end-to-end** using the real app flow (load RFP, select team, trigger bid generation). Open the resulting PPTX in PowerPoint and visually inspect each slide.
3. **Update `notes/2026-04-11-bid-planner-eval.md`** with findings from steps 1 and 2.
4. **Iterate on the planner system prompt** if format variation is weak or required sections are missing from raw plans.
5. **Merge to main** after Stefan's visual sign-off.

---

## Notes on what we're deliberately NOT doing

- No `BrandProfile` — deferred to v2, documented in spec.
- No open format palette — planner constrained to 11 existing kinds.
- No advisor-tool pattern — evaluated in spec, rejected for this single-turn pipeline.
- No automated eval harness — manual eval on real RFPs is the MVP gate.
- No structured logging to Supabase — `console.log` is good enough for MVP observability.
- No `rationale` rendering in the PPTX — it's debug-only per spec.
- No retry on individual content-generation failures beyond `callClaude`'s built-in retries — we replace failed sections with a placeholder and keep moving, per spec "error handling" table.
