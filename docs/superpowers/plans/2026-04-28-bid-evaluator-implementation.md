# Bid-Generator Evaluator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an offline evaluator for `generateAllSections()` (bid-generator) inside the existing eval-harness. Three dimensions: structure (deterministic), requirement coverage (Sonnet judge), hallucination (Sonnet judge). Pipeline-verifiable with `_stub` fixture; ready for calibration on first real fixture.

**Architecture:** Mirrors `analyzer`/`matcher` pattern exactly. New `BidGeneratorFixtureSchema` in `evals/harness/core/fixtures.ts`. New module `evals/harness/configs/bid-generator.ts` (loader + runner + judger + metrics). Two new judges in `evals/harness/core/judges.ts`. CLI script in `evals/scripts/run-bid-generator.ts`. Bid-context built deterministically from analyzer-fixture + synthetic consultants — `scoredConsultants` and `goNoGoResult` are stubbed (production matcher/go-no-go are out of scope for the evaluator). The evaluator treats `src/lib/bid-generator/` as a black box.

**Tech Stack:** TypeScript strict, Vitest, Zod for schemas, existing `callClaude()` from `src/lib/ai-client.ts`. Reuses `core/runner`, `core/reporter`, `core/thresholds`, `core/fixture-loader`, `core/consultant-pool`. No new core abstractions.

**Spec:** `docs/superpowers/specs/2026-04-23-bid-evaluator-harness-design.md` (commit `a900554`). This plan implements Section A only.

---

## Task Map

| # | Task | Phase |
|---|---|---|
| 1 | Fixture schema + `_stub` YAML | Foundation |
| 2 | Structure judge (deterministic) | Foundation |
| 3 | Bid-context builder helper | Foundation |
| 4 | Bid-generator config skeleton (structure-only) + tests | Vertical |
| 5 | CLI script + package.json + thresholds | Vertical |
| 6 | Coverage judge (Sonnet) | Judges |
| 7 | Hallucination judge (Sonnet) | Judges |
| 8 | End-to-end smoke + README annotation workflow | Wrap-up |

Each task ends in a commit. Tasks 1–5 are independent of LLM calls (fast iteration). Tasks 6–7 introduce paid Sonnet calls. Task 8 verifies the wired-up pipeline.

---

## Task 1: Fixture schema + `_stub` YAML

**Files:**
- Modify: `evals/harness/core/fixtures.ts` (append `BidGeneratorFixtureSchema`)
- Create: `evals/harness/core/__tests__/fixtures-bid-generator.test.ts`
- Create: `evals/fixtures/bid-generator/_stub.yaml`

- [ ] **Step 1: Write failing schema test**

Create `evals/harness/core/__tests__/fixtures-bid-generator.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { BidGeneratorFixtureSchema } from "../fixtures";

describe("BidGeneratorFixtureSchema", () => {
  it("parses minimal valid fixture", () => {
    const raw = {
      id: "stub",
      analyzer_fixture: "_stub",
      consultant_ids: ["c1", "c2"],
      golden: {
        mandatory_sections: ["cover", "team-pricing"],
        requirement_coverage: { must_cover: [], should_cover_threshold: 0.8 },
        hallucination_allowlist: [],
      },
    };
    const parsed = BidGeneratorFixtureSchema.parse(raw);
    expect(parsed.id).toBe("stub");
    expect(parsed.consultant_ids).toEqual(["c1", "c2"]);
    expect(parsed.golden.requirement_coverage.should_cover_threshold).toBe(0.8);
  });

  it("applies default for should_cover_threshold", () => {
    const raw = {
      id: "stub",
      analyzer_fixture: "_stub",
      consultant_ids: ["c1"],
      golden: {
        mandatory_sections: ["cover"],
        requirement_coverage: { must_cover: [] },
        hallucination_allowlist: [],
      },
    };
    const parsed = BidGeneratorFixtureSchema.parse(raw);
    expect(parsed.golden.requirement_coverage.should_cover_threshold).toBe(0.8);
  });

  it("rejects fixture missing consultant_ids", () => {
    const raw = { id: "x", analyzer_fixture: "_stub", golden: {} };
    expect(() => BidGeneratorFixtureSchema.parse(raw)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- evals/harness/core/__tests__/fixtures-bid-generator.test.ts`
Expected: FAIL — `BidGeneratorFixtureSchema` not exported.

- [ ] **Step 3: Add schema to fixtures.ts**

Append to `evals/harness/core/fixtures.ts` (after `MatcherFixtureSchema`):

```typescript
// --- Bid-generator fixture ---

export const BidGeneratorFixtureSchema = z.object({
  id: z.string(),
  analyzer_fixture: z.string(),
  consultant_ids: z.array(z.string()).min(1),
  golden: z.object({
    mandatory_sections: z.array(z.string()),
    requirement_coverage: z.object({
      must_cover: z.array(z.string()),
      should_cover_threshold: z.number().min(0).max(1).default(0.8),
    }),
    hallucination_allowlist: z.array(z.string()).default([]),
  }),
});

export type BidGeneratorFixture = z.infer<typeof BidGeneratorFixtureSchema>;
```

- [ ] **Step 4: Run test to verify pass**

Run: `npm test -- evals/harness/core/__tests__/fixtures-bid-generator.test.ts`
Expected: PASS — all 3 tests green.

- [ ] **Step 5: Create `_stub.yaml`**

Create `evals/fixtures/bid-generator/_stub.yaml`:

```yaml
id: _stub
analyzer_fixture: _stub
consultant_ids:
  - anna_svensson
  - bertil_larsson
golden:
  mandatory_sections:
    - cover
    - understanding-current
    - understanding-assignment
    - understanding-vision
    - phases
    - quality-assurance
    - requirement-matrix-v2
    - team-pricing
    - reference-v2
    - confidentiality
    - certifications
  requirement_coverage:
    must_cover: []        # stub — calibration sets these for real fixtures
    should_cover_threshold: 0.8
  hallucination_allowlist:
    - "ISO 27001"
    - "ISO 9001"
```

Note: `consultant_ids` MUST exist in `evals/fixtures/consultants/synthetic-pool.yaml`. Verify with:

Run: `grep -E "^  - id:" evals/fixtures/consultants/synthetic-pool.yaml`
Expected: shows `anna_svensson` and `bertil_larsson` (verified to exist in the pool as of 2026-04-28).

- [ ] **Step 6: Add stub-loader test**

Append to `evals/harness/core/__tests__/fixtures-bid-generator.test.ts`:

```typescript
import fs from "fs/promises";
import path from "path";
import { loadFixtureFromString } from "../fixture-loader";

describe("BidGenerator _stub fixture", () => {
  it("loads from disk and parses", async () => {
    const filePath = path.resolve("evals/fixtures/bid-generator/_stub.yaml");
    const content = await fs.readFile(filePath, "utf-8");
    const parsed = loadFixtureFromString(content, BidGeneratorFixtureSchema, "_stub.yaml");
    expect(parsed.id).toBe("_stub");
    expect(parsed.consultant_ids.length).toBeGreaterThanOrEqual(2);
    expect(parsed.golden.mandatory_sections).toContain("cover");
  });
});
```

Run: `npm test -- evals/harness/core/__tests__/fixtures-bid-generator.test.ts`
Expected: PASS — all 4 tests green.

- [ ] **Step 7: Commit**

```bash
git add evals/harness/core/fixtures.ts \
        evals/harness/core/__tests__/fixtures-bid-generator.test.ts \
        evals/fixtures/bid-generator/_stub.yaml
git commit -m "feat(eval): add bid-generator fixture schema + stub"
```

---

## Task 2: Structure judge (deterministic)

The structure dimension verifies: all mandatory sections present, every section's content matches one of the v2 slot formats, no empty required text fields. Deterministic — no LLM call.

**Files:**
- Create: `evals/harness/core/bid-structure.ts`
- Create: `evals/harness/core/__tests__/bid-structure.test.ts`

- [ ] **Step 1: Write failing test**

Create `evals/harness/core/__tests__/bid-structure.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { judgeBidStructure } from "../bid-structure";
import type { BidSection } from "@/lib/types";

function mkSection(format: string, key: string, content: object): BidSection {
  return {
    type: "ai",
    key,
    title: key,
    content: { format, ...content } as BidSection["content"],
    generatedAt: "2026-04-28T00:00:00Z",
  };
}

describe("judgeBidStructure", () => {
  it("passes when all mandatory sections present and slot formats valid", () => {
    const sections: BidSection[] = [
      mkSection("cover", "cover", { title: "T", client: "C", date: "D" }),
      mkSection("team-pricing", "team", { members: [{ name: "A", role: "R", omfattningPct: 50, timpris: 1000, timmar: 100, total: 100000 }] }),
    ];
    const judgments = judgeBidStructure(sections, ["cover", "team-pricing"]);
    const all = judgments.find((j) => j.field === "structure.all_sections_present");
    const slots = judgments.find((j) => j.field === "structure.slot_format_valid");
    const empty = judgments.find((j) => j.field === "structure.empty_fields");
    expect(all?.match).toBe(true);
    expect(slots?.match).toBe(true);
    expect(empty?.match).toBe(true);
  });

  it("fails all_sections_present when section missing", () => {
    const sections: BidSection[] = [
      mkSection("cover", "cover", { title: "T", client: "C", date: "D" }),
    ];
    const judgments = judgeBidStructure(sections, ["cover", "team-pricing"]);
    const all = judgments.find((j) => j.field === "structure.all_sections_present");
    expect(all?.match).toBe(false);
    expect(all?.evidence).toContain("team-pricing");
  });

  it("fails slot_format_valid when content has unknown format", () => {
    const sections: BidSection[] = [
      mkSection("legacy-format", "x", { foo: "bar" }),
    ];
    const judgments = judgeBidStructure(sections, ["x"]);
    const slots = judgments.find((j) => j.field === "structure.slot_format_valid");
    expect(slots?.match).toBe(false);
  });

  it("flags empty required text fields", () => {
    const sections: BidSection[] = [
      mkSection("cover", "cover", { title: "", client: "C", date: "D" }),
    ];
    const judgments = judgeBidStructure(sections, ["cover"]);
    const empty = judgments.find((j) => j.field === "structure.empty_fields");
    expect(empty?.match).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- evals/harness/core/__tests__/bid-structure.test.ts`
Expected: FAIL — `judgeBidStructure` not exported.

- [ ] **Step 3: Implement structure judge**

Create `evals/harness/core/bid-structure.ts`:

```typescript
import type { BidSection, BidSectionContent } from "@/lib/types";
import type { FieldJudgment } from "./types";

const KNOWN_FORMATS = new Set<BidSectionContent["format"]>([
  "cover",
  "phases",
  "understanding-current",
  "understanding-assignment",
  "understanding-vision",
  "quality-assurance",
  "team-pricing",
  "requirement-matrix-v2",
  "reference-v2",
  "confidentiality",
  "certifications",
]);

function findEmptyFields(sections: BidSection[]): string[] {
  const empty: string[] = [];
  for (const s of sections) {
    if (!s.content) {
      empty.push(`${s.key}.<missing content>`);
      continue;
    }
    walkForEmpty(s.content, s.key, empty);
  }
  return empty;
}

function walkForEmpty(value: unknown, path: string, out: string[]): void {
  if (typeof value === "string") {
    if (value.trim() === "") out.push(path);
    return;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) walkForEmpty(value[i], `${path}[${i}]`, out);
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      // Skip slots that are nullable by design (e.g. team-pricing.timpris/total).
      if (k === "timpris" || k === "total") continue;
      walkForEmpty(v, `${path}.${k}`, out);
    }
  }
}

export function judgeBidStructure(
  sections: BidSection[],
  mandatorySections: string[],
): FieldJudgment[] {
  const judgments: FieldJudgment[] = [];

  // 1. All mandatory section formats present
  const presentFormats = new Set(
    sections.map((s) => s.content?.format).filter((f): f is string => typeof f === "string"),
  );
  const missing = mandatorySections.filter((m) => !presentFormats.has(m));
  judgments.push({
    field: "structure.all_sections_present",
    judge: "exact",
    match: missing.length === 0,
    evidence: missing.length === 0 ? "all present" : `missing: ${missing.join(", ")}`,
    golden: mandatorySections,
    actual: Array.from(presentFormats).sort(),
  });

  // 2. Every section's format is one of the v2 slot formats
  const unknown = sections
    .map((s) => s.content?.format)
    .filter((f): f is string => typeof f === "string")
    .filter((f) => !KNOWN_FORMATS.has(f as BidSectionContent["format"]));
  judgments.push({
    field: "structure.slot_format_valid",
    judge: "exact",
    match: unknown.length === 0,
    evidence: unknown.length === 0 ? "all formats valid" : `unknown formats: ${unknown.join(", ")}`,
    golden: Array.from(KNOWN_FORMATS).sort(),
    actual: unknown,
  });

  // 3. No empty required text fields
  const empties = findEmptyFields(sections);
  judgments.push({
    field: "structure.empty_fields",
    judge: "exact",
    match: empties.length === 0,
    evidence: empties.length === 0 ? "no empty fields" : `empty: ${empties.slice(0, 5).join(", ")}${empties.length > 5 ? ` (+${empties.length - 5} more)` : ""}`,
    golden: 0,
    actual: empties.length,
  });

  return judgments;
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npm test -- evals/harness/core/__tests__/bid-structure.test.ts`
Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add evals/harness/core/bid-structure.ts \
        evals/harness/core/__tests__/bid-structure.test.ts
git commit -m "feat(eval): add deterministic bid structure judge"
```

---

## Task 3: Bid-context builder helper

Build a `BidContext` from `(analyzerFixture, syntheticConsultants)` so the evaluator can call `generateAllSections(ctx)`. The matcher and go-no-go pipelines are NOT exercised — `scoredConsultants` and `goNoGoResult` are stubbed with rank-by-input-order and a fixed "go" recommendation. This is intentional: the evaluator's job is to grade bid-generator output, not the upstream pipeline.

**Files:**
- Create: `evals/harness/configs/bid-generator-context.ts`
- Create: `evals/harness/configs/__tests__/bid-generator-context.test.ts`

- [ ] **Step 1: Write failing test**

Create `evals/harness/configs/__tests__/bid-generator-context.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildEvalBidContext } from "../bid-generator-context";
import type { AnalyzerFixture, SyntheticConsultant } from "../../core/fixtures";

const ANALYZER_FIXTURE: AnalyzerFixture = {
  id: "_stub",
  rfp_text: "...",
  golden: {
    title: "T",
    client: "C",
    deadline: "2026-06-15",
    summary: "S",
    domain: "IT",
    requirements: [
      { category: "k1", description: "must req", priority: "must" },
      { category: "k2", description: "should req", priority: "should" },
    ],
    evaluationCriteria: [{ name: "Kvalitet", weight: 60, description: "X" }],
    requiredCompetencies: ["x"],
    estimatedScope: "scope",
    redFlags: [],
    oslReference: null,
    secrecyRows: [],
  },
};

const CONSULTANTS: SyntheticConsultant[] = [
  {
    id: "c1",
    match_profile: { intent: "x", cv_format: "x", must_haves_demonstrated: [] },
    cv_text: "cv1",
    parsed_profile: {
      name: "Anna",
      level: "senior",
      yearsExperience: 10,
      summary: "S",
      competencies: ["x"],
      projects: [{ client: "X", role: "R", years: "2020-2022", description: "d" }],
    },
  },
];

describe("buildEvalBidContext", () => {
  it("builds context from analyzer fixture + consultants", () => {
    const ctx = buildEvalBidContext(ANALYZER_FIXTURE, CONSULTANTS);
    expect(ctx.analysis.title).toBe("T");
    expect(ctx.teamConsultants).toHaveLength(1);
    expect(ctx.teamConsultants[0].name).toBe("Anna");
    expect(ctx.scoredConsultants).toHaveLength(1);
    expect(ctx.scoredConsultants[0].consultantId).toBe("c1");
    expect(ctx.goNoGoResult.recommendation).toBe("go");
    expect(ctx.goNoGoResult.mustRequirements).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- evals/harness/configs/__tests__/bid-generator-context.test.ts`
Expected: FAIL — `buildEvalBidContext` not exported.

- [ ] **Step 3: Implement context builder**

Create `evals/harness/configs/bid-generator-context.ts`:

```typescript
import type {
  Consultant,
  GoNoGoResult,
  RfpAnalysis,
  ScoredConsultant,
} from "@/lib/types";
import type { BidContext } from "@/lib/bid-generator";
import type { AnalyzerFixture, SyntheticConsultant } from "../core/fixtures";

const NOW = "2026-04-28T00:00:00.000Z";

function toConsultant(c: SyntheticConsultant): Consultant {
  return {
    id: c.id,
    organizationId: "eval-harness",
    name: c.parsed_profile.name,
    level: c.parsed_profile.level,
    yearsExperience: c.parsed_profile.yearsExperience,
    summary: c.parsed_profile.summary,
    rawCvText: c.cv_text,
    competencies: c.parsed_profile.competencies.map((name) => ({
      competency: name,
      category: "technical" as const,
    })),
    references: c.parsed_profile.projects.map((p) => ({
      title: p.role,
      description: `${p.client}: ${p.description}`,
      year: parseInt(p.years.split("-")[0], 10),
      sector: "public" as const,
    })),
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function stubScores(consultants: Consultant[]): ScoredConsultant[] {
  // Rank by input order — deterministic, avoids matcher LLM calls.
  return consultants.map((c, idx) => ({
    consultantId: c.id,
    consultantName: c.name,
    level: c.level,
    score: 100 - idx * 5,
    reasoning: `Eval-harness stub: ranked at position ${idx + 1}`,
  }));
}

function stubGoNoGo(analysis: RfpAnalysis, scored: ScoredConsultant[]): GoNoGoResult {
  const mustReqs = analysis.requirements.filter((r) => r.priority === "must");
  const firstId = scored[0]?.consultantId ?? null;
  return {
    mustRequirements: mustReqs.map((r) => ({
      requirement: r.description,
      met: true,
      coveredBy: firstId,
    })),
    winProbability: 70,
    winProbabilityReasoning: "Eval-harness stub.",
    strengths: ["Eval-harness stub strength."],
    gaps: [],
    improvements: [],
    recommendation: "go",
    reasoning: "Eval-harness stub: always go for evaluator runs.",
  };
}

export function buildEvalBidContext(
  analyzerFixture: AnalyzerFixture,
  consultants: SyntheticConsultant[],
): BidContext {
  const analysis = analyzerFixture.golden as RfpAnalysis;
  const teamConsultants = consultants.map(toConsultant);
  const scoredConsultants = stubScores(teamConsultants);
  const goNoGoResult = stubGoNoGo(analysis, scoredConsultants);
  return { analysis, teamConsultants, scoredConsultants, goNoGoResult };
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npm test -- evals/harness/configs/__tests__/bid-generator-context.test.ts`
Expected: PASS — single test green.

- [ ] **Step 5: Commit**

```bash
git add evals/harness/configs/bid-generator-context.ts \
        evals/harness/configs/__tests__/bid-generator-context.test.ts
git commit -m "feat(eval): add bid-context builder for evaluator"
```

---

## Task 4: Bid-generator config skeleton (structure-only)

Wire the structure judge into an `EvalConfig`. Coverage and hallucination judges are added in Tasks 6–7. This task gets the runner/loader/reporter integration working end-to-end without paid LLM calls.

**Files:**
- Create: `evals/harness/configs/bid-generator.ts`
- Create: `evals/harness/configs/__tests__/bid-generator.test.ts`

- [ ] **Step 1: Write failing test**

Create `evals/harness/configs/__tests__/bid-generator.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import type { BidSection } from "@/lib/types";
import { computeBidGeneratorMetrics, computeBidGeneratorAggregate } from "../bid-generator";
import type { FieldJudgment } from "../../core/types";

describe("computeBidGeneratorMetrics", () => {
  it("emits structure.pass=1 when all three structure judgments pass", () => {
    const judgments: FieldJudgment[] = [
      { field: "structure.all_sections_present", judge: "exact", match: true, golden: [], actual: [] },
      { field: "structure.slot_format_valid", judge: "exact", match: true, golden: [], actual: [] },
      { field: "structure.empty_fields", judge: "exact", match: true, golden: 0, actual: 0 },
    ];
    const m = computeBidGeneratorMetrics(judgments);
    expect(m["structure.all_sections_present"]).toBe(1);
    expect(m["structure.slot_format_valid"]).toBe(1);
    expect(m["structure.empty_fields"]).toBe(1);
    expect(m["structure.pass"]).toBe(1);
  });

  it("emits structure.pass=0 when any structure judgment fails", () => {
    const judgments: FieldJudgment[] = [
      { field: "structure.all_sections_present", judge: "exact", match: false, golden: [], actual: [] },
      { field: "structure.slot_format_valid", judge: "exact", match: true, golden: [], actual: [] },
      { field: "structure.empty_fields", judge: "exact", match: true, golden: 0, actual: 0 },
    ];
    const m = computeBidGeneratorMetrics(judgments);
    expect(m["structure.pass"]).toBe(0);
  });
});

describe("computeBidGeneratorAggregate", () => {
  it("returns mean per metric across fixtures", () => {
    const agg = computeBidGeneratorAggregate([
      { "structure.pass": 1 },
      { "structure.pass": 0 },
    ]);
    expect(agg["structure.pass.mean"]).toBe(0.5);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- evals/harness/configs/__tests__/bid-generator.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement config (structure-only)**

Create `evals/harness/configs/bid-generator.ts`:

```typescript
import path from "path";
import fs from "fs/promises";
import { generateAllSections } from "@/lib/bid-generator";
import type { BidSection } from "@/lib/types";
import {
  AnalyzerFixtureSchema,
  BidGeneratorFixtureSchema,
  type AnalyzerFixture,
  type BidGeneratorFixture,
  type SyntheticConsultant,
} from "../core/fixtures";
import { loadFixtureFromString } from "../core/fixture-loader";
import { loadConsultantPool, getConsultantsByIds } from "../core/consultant-pool";
import { judgeBidStructure } from "../core/bid-structure";
import { meanMetric } from "../core/metrics";
import type { EvalConfig, FieldJudgment } from "../core/types";
import { buildEvalBidContext } from "./bid-generator-context";

type Output = BidSection[];

interface BidEvalContext {
  fixture: BidGeneratorFixture;
  analyzerFixture: AnalyzerFixture;
  consultants: SyntheticConsultant[];
}

const POOL_PATH = path.resolve(process.cwd(), "evals/fixtures/consultants/synthetic-pool.yaml");
const ANALYZER_FIXTURE_DIR = path.resolve(process.cwd(), "evals/fixtures/analyzer");

async function loadContext(fixture: BidGeneratorFixture): Promise<BidEvalContext> {
  const analyzerPath = path.join(ANALYZER_FIXTURE_DIR, `${fixture.analyzer_fixture}.yaml`);
  const analyzerContent = await fs.readFile(analyzerPath, "utf-8");
  const analyzerFixture = loadFixtureFromString(
    analyzerContent, AnalyzerFixtureSchema, path.basename(analyzerPath),
  );
  const pool = await loadConsultantPool(POOL_PATH);
  const consultants = getConsultantsByIds(pool, fixture.consultant_ids);
  return { fixture, analyzerFixture, consultants };
}

export function computeBidGeneratorMetrics(judgments: FieldJudgment[]): Record<string, number> {
  const metrics: Record<string, number> = {};

  // Structure: 0/1 per judgment + composite pass
  const structureFields = ["structure.all_sections_present", "structure.slot_format_valid", "structure.empty_fields"];
  let structurePass = true;
  for (const f of structureFields) {
    const j = judgments.find((x) => x.field === f);
    if (j) {
      metrics[f] = j.match ? 1 : 0;
      if (!j.match) structurePass = false;
    } else {
      structurePass = false;
    }
  }
  metrics["structure.pass"] = structurePass ? 1 : 0;

  return metrics;
}

export function computeBidGeneratorAggregate(
  fixtureMetrics: Array<Record<string, number>>,
): Record<string, number> {
  if (fixtureMetrics.length === 0) return {};
  const keys = new Set<string>();
  for (const m of fixtureMetrics) for (const k of Object.keys(m)) keys.add(k);
  const agg: Record<string, number> = {};
  for (const k of keys) agg[`${k}.mean`] = meanMetric(fixtureMetrics, k);
  return agg;
}

async function judgeBid(
  fixture: BidGeneratorFixture,
  actual: Output,
  _context: BidEvalContext,
): Promise<FieldJudgment[]> {
  return judgeBidStructure(actual, fixture.golden.mandatory_sections);
  // Coverage + hallucination judges added in Tasks 6–7.
}

export const bidGeneratorConfig: EvalConfig<BidGeneratorFixture, Output, BidEvalContext> = {
  module: "bid-generator",
  fixtureDir: path.resolve(process.cwd(), "evals/fixtures/bid-generator").replace(/\\/g, "/"),
  loadFixture: async (filePath: string) => {
    const content = await fs.readFile(filePath, "utf-8");
    return loadFixtureFromString(content, BidGeneratorFixtureSchema, path.basename(filePath));
  },
  runModule: async (fixture) => {
    const context = await loadContext(fixture);
    const ctx = buildEvalBidContext(context.analyzerFixture, context.consultants);
    const output = await generateAllSections(ctx);
    return { output, context };
  },
  judgeOutput: (fixture, actual, context) => judgeBid(fixture, actual, context),
  computeFixtureMetrics: (judgments) => computeBidGeneratorMetrics(judgments),
  computeAggregate: computeBidGeneratorAggregate,
};
```

- [ ] **Step 4: Run test to verify pass**

Run: `npm test -- evals/harness/configs/__tests__/bid-generator.test.ts`
Expected: PASS — both tests green.

- [ ] **Step 5: Run full unit test suite to check no regressions**

Run: `npm test -- evals/`
Expected: all eval tests pass (existing + new).

- [ ] **Step 6: Commit**

```bash
git add evals/harness/configs/bid-generator.ts \
        evals/harness/configs/__tests__/bid-generator.test.ts
git commit -m "feat(eval): add bid-generator config (structure dimension only)"
```

---

## Task 5: CLI script + package.json + thresholds

**Files:**
- Create: `evals/scripts/run-bid-generator.ts`
- Modify: `package.json`
- Modify: `evals/thresholds.yaml`
- Modify: `evals/harness/core/thresholds.ts` (extend ThresholdsSchema for new module)

- [ ] **Step 1: Add `bid-generator` to thresholds schema**

Edit `evals/harness/core/thresholds.ts` — extend the `ThresholdsSchema`:

```typescript
const ThresholdsSchema = z.object({
  analyzer: z.record(z.string(), ThresholdPairSchema).default({}),
  matcher: z.record(z.string(), ThresholdPairSchema).default({}),
  "bid-generator": z.record(z.string(), ThresholdPairSchema).default({}),
});
```

- [ ] **Step 2: Add bid-generator thresholds**

Append to `evals/thresholds.yaml`:

```yaml
bid-generator:
  structure.pass:
    green: 1.00
    yellow: 1.00
  structure.all_sections_present:
    green: 1.00
    yellow: 1.00
  structure.slot_format_valid:
    green: 1.00
    yellow: 1.00
  structure.empty_fields:
    green: 1.00
    yellow: 1.00
```

(Coverage + hallucination thresholds will be added in Tasks 6–7.)

- [ ] **Step 3: Run thresholds test to verify schema still loads**

Run: `npm test -- evals/harness/core/__tests__/thresholds.test.ts`
Expected: PASS — schema accepts the new key.

- [ ] **Step 4: Create CLI script**

Create `evals/scripts/run-bid-generator.ts`:

```typescript
import path from "path";
import fs from "fs/promises";
import { bidGeneratorConfig } from "../harness/configs/bid-generator";
import { runEval } from "../harness/core/runner";
import { formatConsoleReport, writeJsonReport } from "../harness/core/reporter";
import { loadThresholds } from "../harness/core/thresholds";
import { BidGeneratorFixtureSchema } from "../harness/core/fixtures";
import { loadFixtureFromString } from "../harness/core/fixture-loader";
import type { BidGeneratorFixture } from "../harness/core/fixtures";

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY not set. Put it in .env.local and source it.");
    process.exit(1);
  }

  const fixtureArgIdx = process.argv.indexOf("--fixture");
  const fixtureFilter = fixtureArgIdx >= 0 ? process.argv[fixtureArgIdx + 1] : null;

  const dir = bidGeneratorConfig.fixtureDir;
  const entries = await fs.readdir(dir);
  const yamlFiles = entries.filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  const fixtures: BidGeneratorFixture[] = [];
  for (const file of yamlFiles.sort()) {
    const content = await fs.readFile(path.join(dir, file), "utf-8");
    const fx = loadFixtureFromString(content, BidGeneratorFixtureSchema, file);
    if (fixtureFilter && fx.id !== fixtureFilter) continue;
    fixtures.push(fx);
  }

  if (fixtures.length === 0) {
    console.error(`No fixtures found in ${dir}${fixtureFilter ? ` matching id=${fixtureFilter}` : ""}.`);
    process.exit(1);
  }

  console.log(`Running ${fixtures.length} bid-generator fixture(s)...`);

  const run = await runEval(bidGeneratorConfig, fixtures);

  const thresholds = await loadThresholds(path.resolve("evals/thresholds.yaml"));
  console.log(formatConsoleReport(run, thresholds));

  const runsDir = path.resolve("evals/runs");
  const outPath = await writeJsonReport(run, runsDir);
  console.log(`Result: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 5: Add npm script**

Edit `package.json` — add `eval:bid-generator` after `eval:matcher`:

```json
{
  "scripts": {
    "eval:analyzer": "tsx evals/scripts/run-analyzer.ts",
    "eval:matcher": "tsx evals/scripts/run-matcher.ts",
    "eval:bid-generator": "tsx evals/scripts/run-bid-generator.ts"
  }
}
```

(Keep existing scripts unchanged. Add only the new line.)

- [ ] **Step 6: Sanity-check the reporter still loads thresholds**

Run: `npm test -- evals/harness/core/__tests__/reporter.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add evals/scripts/run-bid-generator.ts \
        package.json \
        evals/thresholds.yaml \
        evals/harness/core/thresholds.ts
git commit -m "feat(eval): add bid-generator CLI script + thresholds"
```

---

## Task 6: Coverage judge (Sonnet)

Per-requirement judge: given a requirement and the bid text, decide whether the bid demonstrates coverage of that requirement. Reuses the MHC judge pattern but replaces "consultant CV" with "bid sections".

**Files:**
- Modify: `evals/harness/core/types.ts` (add `bid-coverage` to `JudgeName`)
- Modify: `evals/harness/core/judges.ts` (add `bidCoverageJudge`)
- Create: `evals/harness/core/__tests__/judges-bid-coverage.test.ts`
- Modify: `evals/harness/configs/bid-generator.ts` (wire coverage in)
- Modify: `evals/thresholds.yaml`

- [ ] **Step 1: Extend `JudgeName`**

Edit `evals/harness/core/types.ts`:

```typescript
export type JudgeName = "exact" | "haiku-equiv" | "haiku-rubric" | "sonnet-mhc" | "bid-coverage" | "bid-hallucination";
```

(`bid-hallucination` added now too — used in Task 7.)

- [ ] **Step 2: Write failing test for bidCoverageJudge**

Create `evals/harness/core/__tests__/judges-bid-coverage.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { bidCoverageJudge } from "../judges";
import * as aiClient from "@/lib/ai-client";

vi.mock("@/lib/ai-client");

describe("bidCoverageJudge", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns match=true when judge says demonstrated", async () => {
    vi.mocked(aiClient.callClaude).mockResolvedValueOnce({
      demonstrated: true,
      evidence: "section 'team' lists Anna with 10 years digital transformation",
      confidence: "high",
    });
    const result = await bidCoverageJudge({
      requirement: { id: "req_1", category: "experience", description: "5+ years digital transformation", priority: "must" },
      bidText: "Team: Anna (Senior, 10 years). Erfarenhet: digital transformation hos Region X.",
    });
    expect(result.match).toBe(true);
    expect(result.judge).toBe("bid-coverage");
    expect(result.field).toBe("coverage.req_1");
    expect(result.evidence).toContain("Anna");
  });

  it("returns match=false when judge says not demonstrated", async () => {
    vi.mocked(aiClient.callClaude).mockResolvedValueOnce({
      demonstrated: false,
      evidence: "no mention of Swedish proficiency",
      confidence: "high",
    });
    const result = await bidCoverageJudge({
      requirement: { id: "req_2", category: "language", description: "Flytande svenska", priority: "must" },
      bidText: "Team is fluent in English and German.",
    });
    expect(result.match).toBe(false);
  });

  it("returns match=false with error when callClaude throws", async () => {
    vi.mocked(aiClient.callClaude).mockRejectedValueOnce(new Error("API down"));
    const result = await bidCoverageJudge({
      requirement: { id: "req_3", category: "x", description: "x", priority: "must" },
      bidText: "x",
    });
    expect(result.match).toBe(false);
    expect(result.error).toContain("API down");
  });
});
```

- [ ] **Step 3: Run test to verify failure**

Run: `npm test -- evals/harness/core/__tests__/judges-bid-coverage.test.ts`
Expected: FAIL — `bidCoverageJudge` not exported.

- [ ] **Step 4: Implement bidCoverageJudge**

Append to `evals/harness/core/judges.ts`:

```typescript
const BidCoverageResponseSchema = z.object({
  demonstrated: z.boolean(),
  evidence: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
});

export interface BidCoverageJudgeInput {
  requirement: { id: string; category: string; description: string; priority: string };
  bidText: string;
}

export async function bidCoverageJudge(input: BidCoverageJudgeInput): Promise<FieldJudgment> {
  const { requirement, bidText } = input;
  const field = `coverage.${requirement.id}`;

  const system = `Du bedömer om ett anbudsutkast demonstrerar att en RFP-krav uppfylls.
Svara med JSON { "demonstrated": boolean, "evidence": string, "confidence": "high"|"medium"|"low" }.

demonstrated = true endast om anbudet innehåller konkret skrivning som adresserar kravet (kompetens, metod, leverans, referens, certifiering, person).
evidence = citat eller paraphrase från anbudet som stödjer bedömningen (eller "inte adresserat" om demonstrated=false).
confidence = "high" om explicit, "medium" om rimlig inferens, "low" om svag inferens.

Var strikt: krav på "5 års erfarenhet" kräver konkret namn + år/projekt. Allmänna fraser ("vi har bred erfarenhet") räcker inte.`;

  const userContent = `Krav (kategori: ${requirement.category}, prioritet: ${requirement.priority}):
${requirement.description}

Anbudstext:
${bidText}`;

  try {
    const judgment = await callClaude({
      model: SONNET_MODEL,
      maxTokens: 500,
      system,
      userContent,
      schema: BidCoverageResponseSchema,
      label: `bid-coverage-judge(${field})`,
    });
    return {
      field,
      judge: "bid-coverage",
      match: judgment.demonstrated,
      evidence: judgment.evidence,
      confidence: judgment.confidence,
      golden: requirement,
      actual: "(bid text)",
    };
  } catch (err) {
    return {
      field,
      judge: "bid-coverage",
      match: false,
      error: err instanceof Error ? err.message : String(err),
      golden: requirement,
      actual: "(bid text)",
    };
  }
}
```

- [ ] **Step 5: Run judge test to verify pass**

Run: `npm test -- evals/harness/core/__tests__/judges-bid-coverage.test.ts`
Expected: PASS — all 3 tests green.

- [ ] **Step 6: Wire coverage judge into bid-generator config**

The fixture's `must_cover` and `should_cover_threshold` reference requirement IDs — but `RfpRequirement` has no `id` field. We assign synthetic IDs based on array index in the analyzer fixture: `req_0`, `req_1`, …

Edit `evals/harness/configs/bid-generator.ts`:

Add helper at top of file (after imports):

```typescript
function flattenBidText(sections: BidSection[]): string {
  return sections
    .map((s) => `## ${s.title}\n${JSON.stringify(s.content, null, 2)}`)
    .join("\n\n");
}

function requirementId(idx: number): string {
  return `req_${idx}`;
}
```

Add coverage import:

```typescript
import { bidCoverageJudge } from "../core/judges";
```

Replace `judgeBid` body:

```typescript
async function judgeBid(
  fixture: BidGeneratorFixture,
  actual: Output,
  context: BidEvalContext,
): Promise<FieldJudgment[]> {
  const judgments: FieldJudgment[] = [];

  // Structure
  judgments.push(...judgeBidStructure(actual, fixture.golden.mandatory_sections));

  // Coverage — per requirement
  const bidText = flattenBidText(actual);
  const reqs = context.analyzerFixture.golden.requirements;
  for (let i = 0; i < reqs.length; i++) {
    judgments.push(await bidCoverageJudge({
      requirement: { id: requirementId(i), ...reqs[i] },
      bidText,
    }));
  }

  return judgments;
}
```

Extend `computeBidGeneratorMetrics` to compute coverage metrics. Append after the structure block (before `return metrics;`):

```typescript
  // Coverage
  const coverageJudgments = judgments.filter((j) => j.field.startsWith("coverage."));
  if (coverageJudgments.length > 0) {
    metrics["coverage.recall"] = coverageJudgments.filter((j) => j.match).length / coverageJudgments.length;
  }
```

Note: `must_cover_recall` (gating on `must_cover` IDs) and the `should_cover_threshold` warn-band are computed by the reporter via `thresholds.yaml`. We deliberately keep `computeBidGeneratorMetrics` simple — the fixture's `must_cover` field is for *future* gating and is not enforced as a hard metric until calibration shows it's needed. (Avoids dead-letter logic when fixtures don't yet annotate `must_cover`.)

- [ ] **Step 7: Update bid-generator config tests**

Append to `evals/harness/configs/__tests__/bid-generator.test.ts`:

```typescript
describe("computeBidGeneratorMetrics — coverage", () => {
  it("emits coverage.recall as fraction of demonstrated requirements", () => {
    const judgments: FieldJudgment[] = [
      { field: "structure.all_sections_present", judge: "exact", match: true, golden: [], actual: [] },
      { field: "structure.slot_format_valid", judge: "exact", match: true, golden: [], actual: [] },
      { field: "structure.empty_fields", judge: "exact", match: true, golden: 0, actual: 0 },
      { field: "coverage.req_0", judge: "bid-coverage", match: true, golden: {}, actual: "" },
      { field: "coverage.req_1", judge: "bid-coverage", match: false, golden: {}, actual: "" },
      { field: "coverage.req_2", judge: "bid-coverage", match: true, golden: {}, actual: "" },
    ];
    const m = computeBidGeneratorMetrics(judgments);
    expect(m["coverage.recall"]).toBeCloseTo(2 / 3, 5);
  });
});
```

Run: `npm test -- evals/harness/configs/__tests__/bid-generator.test.ts`
Expected: PASS.

- [ ] **Step 8: Add coverage thresholds**

Append to `bid-generator:` block in `evals/thresholds.yaml`:

```yaml
  coverage.recall:
    green: 0.90
    yellow: 0.75
```

(Calibration may revise these later — these are starting values per the spec's "naively kind out-of-the-box" assumption.)

- [ ] **Step 9: Commit**

```bash
git add evals/harness/core/types.ts \
        evals/harness/core/judges.ts \
        evals/harness/core/__tests__/judges-bid-coverage.test.ts \
        evals/harness/configs/bid-generator.ts \
        evals/harness/configs/__tests__/bid-generator.test.ts \
        evals/thresholds.yaml
git commit -m "feat(eval): add Sonnet coverage judge for bid-generator"
```

---

## Task 7: Hallucination judge (Sonnet)

Single Sonnet call per bid: extract specific factual claims from the bid (consultant names + years, project clients, numeric metrics, certifications) and verify each against the source material (RFP text + consultant CVs). Combined extract+verify in one prompt — cheaper than two-pass and good enough for v1 per the spec's cost budget.

**Files:**
- Modify: `evals/harness/core/judges.ts` (add `bidHallucinationJudge`)
- Create: `evals/harness/core/__tests__/judges-bid-hallucination.test.ts`
- Modify: `evals/harness/configs/bid-generator.ts` (wire hallucination in)
- Modify: `evals/thresholds.yaml`

- [ ] **Step 1: Write failing test**

Create `evals/harness/core/__tests__/judges-bid-hallucination.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { bidHallucinationJudge } from "../judges";
import * as aiClient from "@/lib/ai-client";

vi.mock("@/lib/ai-client");

describe("bidHallucinationJudge", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns match=true when no unsupported claims", async () => {
    vi.mocked(aiClient.callClaude).mockResolvedValueOnce({
      claims: [
        { claim: "Anna has 10 years experience", supported: true, evidence: "CV: 2014-2024" },
      ],
    });
    const result = await bidHallucinationJudge({
      bidText: "Anna has 10 years experience.",
      sourceMaterial: "Anna CV: 2014-2024 ...",
      allowlist: [],
    });
    expect(result.match).toBe(true);
    expect(result.field).toBe("hallucination");
  });

  it("returns match=false when an unsupported claim found", async () => {
    vi.mocked(aiClient.callClaude).mockResolvedValueOnce({
      claims: [
        { claim: "Anna has 10 years experience", supported: true, evidence: "CV" },
        { claim: "Anna has worked for NASA", supported: false, evidence: "not in CV" },
      ],
    });
    const result = await bidHallucinationJudge({
      bidText: "...",
      sourceMaterial: "...",
      allowlist: [],
    });
    expect(result.match).toBe(false);
    expect(result.evidence).toContain("Anna has worked for NASA");
  });

  it("treats allowlist substring as supported", async () => {
    vi.mocked(aiClient.callClaude).mockResolvedValueOnce({
      claims: [
        { claim: "Företaget har ISO 27001-certifiering", supported: false, evidence: "not in source" },
      ],
    });
    const result = await bidHallucinationJudge({
      bidText: "...",
      sourceMaterial: "...",
      allowlist: ["ISO 27001"],
    });
    expect(result.match).toBe(true);
  });

  it("returns match=false with error on callClaude failure", async () => {
    vi.mocked(aiClient.callClaude).mockRejectedValueOnce(new Error("rate limit"));
    const result = await bidHallucinationJudge({
      bidText: "...",
      sourceMaterial: "...",
      allowlist: [],
    });
    expect(result.match).toBe(false);
    expect(result.error).toContain("rate limit");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- evals/harness/core/__tests__/judges-bid-hallucination.test.ts`
Expected: FAIL — `bidHallucinationJudge` not exported.

- [ ] **Step 3: Implement bidHallucinationJudge**

Append to `evals/harness/core/judges.ts`:

```typescript
const HallucinationResponseSchema = z.object({
  claims: z.array(z.object({
    claim: z.string(),
    supported: z.boolean(),
    evidence: z.string(),
  })),
});

export interface BidHallucinationJudgeInput {
  bidText: string;
  sourceMaterial: string;
  allowlist: string[];
}

export async function bidHallucinationJudge(input: BidHallucinationJudgeInput): Promise<FieldJudgment> {
  const { bidText, sourceMaterial, allowlist } = input;
  const field = "hallucination";

  const system = `Du extraherar och verifierar faktapåståenden i ett anbudsutkast mot källmaterialet.
Svara med JSON { "claims": [{ "claim": string, "supported": boolean, "evidence": string }] }.

Steg:
1. Extrahera 5-15 specifika faktapåståenden från anbudet — namn, år, projekt-klienter, numeriska värden, certifieringar, roller. Hoppa över allmänna formuleringar.
2. För varje påstående, kontrollera om det stöds av källmaterialet (RFP + CV:n).
3. supported = true om källmaterialet bekräftar påståendet (exakt eller via stark inferens). supported = false om källan inte nämner det eller motsäger det.
4. evidence = citat från källan om supported=true, eller "inte i källa" om supported=false.

Var strikt: en siffra eller ett klientnamn som inte finns i källan = supported=false.`;

  const userContent = `Anbudstext:
${bidText}

Källmaterial (RFP + CV:n):
${sourceMaterial}`;

  try {
    const judgment = await callClaude({
      model: SONNET_MODEL,
      maxTokens: 2000,
      system,
      userContent,
      schema: HallucinationResponseSchema,
      label: `bid-hallucination-judge`,
    });

    const allowlistMatches = (claim: string) =>
      allowlist.some((term) => claim.toLowerCase().includes(term.toLowerCase()));

    const unsupported = judgment.claims.filter((c) => !c.supported && !allowlistMatches(c.claim));

    return {
      field,
      judge: "bid-hallucination",
      match: unsupported.length === 0,
      evidence: unsupported.length === 0
        ? `${judgment.claims.length} claims, all supported (or allowlisted)`
        : `unsupported: ${unsupported.map((c) => c.claim).join("; ")}`,
      golden: { allowlist },
      actual: judgment.claims,
    };
  } catch (err) {
    return {
      field,
      judge: "bid-hallucination",
      match: false,
      error: err instanceof Error ? err.message : String(err),
      golden: { allowlist },
      actual: null,
    };
  }
}
```

- [ ] **Step 4: Run judge tests to verify pass**

Run: `npm test -- evals/harness/core/__tests__/judges-bid-hallucination.test.ts`
Expected: PASS — all 4 tests green.

- [ ] **Step 5: Wire hallucination judge into bid-generator config**

Edit `evals/harness/configs/bid-generator.ts`:

Add import:

```typescript
import { bidCoverageJudge, bidHallucinationJudge } from "../core/judges";
```

Add helper before `judgeBid`:

```typescript
function buildSourceMaterial(context: BidEvalContext): string {
  const rfp = `## RFP\n${context.analyzerFixture.rfp_text}`;
  const cvs = context.consultants
    .map((c) => `## CV: ${c.parsed_profile.name} (${c.id})\n${c.cv_text}`)
    .join("\n\n");
  return `${rfp}\n\n${cvs}`;
}
```

Append to `judgeBid` (after the coverage loop, before `return judgments;`):

```typescript
  // Hallucination
  const sourceMaterial = buildSourceMaterial(context);
  judgments.push(await bidHallucinationJudge({
    bidText,
    sourceMaterial,
    allowlist: fixture.golden.hallucination_allowlist,
  }));
```

Extend `computeBidGeneratorMetrics` — append before `return metrics;`:

```typescript
  // Hallucination
  const hallucination = judgments.find((j) => j.field === "hallucination");
  if (hallucination) {
    metrics["hallucination.pass"] = hallucination.match ? 1 : 0;
    const claims = Array.isArray(hallucination.actual) ? hallucination.actual : [];
    metrics["hallucination.count"] = claims.filter((c: { supported: boolean }) => !c.supported).length;
  }
```

- [ ] **Step 6: Update config tests**

Append to `evals/harness/configs/__tests__/bid-generator.test.ts`:

```typescript
describe("computeBidGeneratorMetrics — hallucination", () => {
  it("emits hallucination.pass=1 and count=0 when judge passes", () => {
    const judgments: FieldJudgment[] = [
      { field: "hallucination", judge: "bid-hallucination", match: true, golden: {}, actual: [
        { claim: "x", supported: true, evidence: "y" },
      ] },
    ];
    const m = computeBidGeneratorMetrics(judgments);
    expect(m["hallucination.pass"]).toBe(1);
    expect(m["hallucination.count"]).toBe(0);
  });

  it("emits hallucination.count > 0 when unsupported claims present", () => {
    const judgments: FieldJudgment[] = [
      { field: "hallucination", judge: "bid-hallucination", match: false, golden: {}, actual: [
        { claim: "x", supported: false, evidence: "y" },
        { claim: "z", supported: true, evidence: "w" },
      ] },
    ];
    const m = computeBidGeneratorMetrics(judgments);
    expect(m["hallucination.pass"]).toBe(0);
    expect(m["hallucination.count"]).toBe(1);
  });
});
```

Run: `npm test -- evals/harness/configs/__tests__/bid-generator.test.ts`
Expected: PASS.

- [ ] **Step 7: Add hallucination thresholds**

Append to `bid-generator:` block in `evals/thresholds.yaml`:

```yaml
  hallucination.pass:
    green: 1.00
    yellow: 1.00
```

- [ ] **Step 8: Commit**

```bash
git add evals/harness/core/judges.ts \
        evals/harness/core/__tests__/judges-bid-hallucination.test.ts \
        evals/harness/configs/bid-generator.ts \
        evals/harness/configs/__tests__/bid-generator.test.ts \
        evals/thresholds.yaml
git commit -m "feat(eval): add Sonnet hallucination judge for bid-generator"
```

---

## Task 8: End-to-end smoke + README annotation workflow

**Files:**
- Modify: `evals/README.md` (add bid-generator section)

- [ ] **Step 1: Verify full eval test suite passes**

Run: `npm test -- evals/`
Expected: PASS — all eval tests (existing + new ones from this plan) green.

- [ ] **Step 2: Run live smoke against `_stub` fixture**

Make sure `.env.local` has `ANTHROPIC_API_KEY` set, then:

Run: `set -a && source .env.local && set +a && npm run eval:bid-generator -- --fixture _stub`

Expected:
- Console output starts with `Running 1 bid-generator fixture(s)...`
- Eval runs `generateAllSections` (real Opus call — expect ~30-60s wall-clock and ~$0.20-0.40 in API spend)
- Coverage judge runs (~2 requirements × Sonnet ≈ ~$0.005)
- Hallucination judge runs (1 Sonnet call ≈ ~$0.01)
- Console report shows three sections: structure (PASS for stub), coverage.recall, hallucination.pass
- JSON report written to `evals/runs/<timestamp>-bid-generator.json`

If structure fails: investigate which mandatory section was missing or what slot-format-error happened. Don't tweak the structure judge to pass — investigate the actual generator output.

If coverage.recall is low on stub: expected — stub fixture has minimal RFP and the bid generator may not address all of it. This is calibration-stage, not a test failure.

- [ ] **Step 3: Update `evals/README.md` with bid-generator section**

Append to `evals/README.md` (or create one if missing — check existing structure first):

```markdown
## bid-generator evaluator

Offline evaluator for `generateAllSections()` — three dimensions:
1. **Structure** (deterministic): all mandatory sections present, valid v2 slot formats, no empty required fields
2. **Coverage** (Sonnet): per-requirement check that the bid demonstrates how the requirement is met
3. **Hallucination** (Sonnet): claim extraction + source verification against RFP + CVs

### Run

```bash
npm run eval:bid-generator                    # all fixtures
npm run eval:bid-generator -- --fixture <id>  # single fixture
```

Each run writes `evals/runs/<timestamp>-bid-generator.json` and prints a thresholded console report.

### Cost

Approx **$0.25-0.45 per fixture** (Opus generation + Sonnet judges). Acceptable for manual runs; revisit before CI integration.

### Calibration workflow (first real fixture)

The judges are intentionally naive out-of-the-box — they need to be calibrated against a real RFP before the metrics are trustworthy.

1. Pick an analyzer fixture you've already annotated (e.g. a TED RFP).
2. Create `evals/fixtures/bid-generator/<rfp-id>.yaml` referencing it. Set `must_cover` = requirement IDs that absolutely must be addressed (e.g. `["req_0", "req_3"]`). Set `hallucination_allowlist` to the certifications/standards your company always claims (e.g. `["ISO 27001", "ISO 9001"]`).
3. Run the eval: `npm run eval:bid-generator -- --fixture <rfp-id>`
4. Open the JSON report. For each judge field with `match: false`, read the `evidence` and decide: was the judge correct?
5. If the judge made a mistake, edit the prompt in `evals/harness/core/judges.ts` and re-run.
6. Stop when ≥90% of judgments match your manual reading. (Spec's "weak QA → iterate" loop.)

Plan to spend ~45-60 minutes on the first calibration pass per fixture.

### Architecture notes

- `scoredConsultants` and `goNoGoResult` in the bid-context are *stubbed* (rank by input order, fixed "go" recommendation). The evaluator grades bid-generator output, not the upstream matcher/go-no-go pipeline.
- `must_cover` IDs use synthetic identifiers `req_<index>` based on the order of requirements in the analyzer fixture.
- The hallucination judge uses an `allowlist` for known truthful claims (e.g. ISO certifications) that wouldn't appear in the RFP/CV source material.

### Out of scope (see spec for backlog)

- Tone/style dimension
- Runtime evaluator integration (planned as point C)
- CI integration
- Sprint-contract / pre-generation testable criteria (planned as point B)
```

If `evals/README.md` doesn't exist, create it with just the section above plus a top-level title. Cross-check the analyzer/matcher sections if they exist and keep the format consistent.

- [ ] **Step 4: Commit**

```bash
git add evals/README.md
git commit -m "docs(eval): document bid-generator evaluator + calibration workflow"
```

- [ ] **Step 5: Final verification — re-run full suite**

Run: `npm test -- evals/ && npm run lint`
Expected: all tests pass, no lint errors.

---

## Definition of Done

- [ ] All 8 tasks committed
- [ ] `npm test -- evals/` passes (existing + new tests)
- [ ] `npm run eval:bid-generator -- --fixture _stub` runs end-to-end and emits a JSON report
- [ ] `evals/README.md` documents the calibration workflow
- [ ] No changes to `src/lib/bid-generator/` (evaluator treats it as black box)
- [ ] PR ready against master with all 8 commits

## Out of scope (deferred)

- Calibration on a real RFP fixture — requires Stefan to annotate `must_cover` + read judge output. Tracked as next session.
- Tone/style dimension — added after coverage + hallucination are calibrated.
- Runtime integration into `src/lib/bid-generator/` — point C in the spec, designed after A is calibrated on ≥3 fixtures.
- Sprint-contract pre-generation criteria — point B in the spec.
- CI integration — manual runs only for now.
