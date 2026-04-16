# AI Eval Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bygg en fristående eval-harness som verifierar `rfp-analyzer` och `consultant-matcher` mot ett golden set av YAML-fixtures, med Must-Have Coverage (MHC) som primär matcher-metric.

**Architecture:** Generisk `core/` (runner, judges, metrics, fixture-loader, reporter) + modul-specifika `configs/` (analyzer, matcher) + YAML-fixtures. CLI-wrappers per modul. Allt kopplat mot befintlig `callClaude()`.

**Tech Stack:** TypeScript strict, Vitest (jsdom), Zod för schemas, `yaml`-paketet för fixture-parsing, existerande `@anthropic-ai/sdk` för LLM-judging. Återanvänder `callClaude()` från `src/lib/ai-client.ts` — inga nya retry/error-policies.

---

## Task Map

| # | Task | Phase |
|---|---|---|
| 1 | Setup: deps, directories, npm scripts, gitignore | Foundation |
| 2 | Core types (`evals/harness/core/types.ts`) | Foundation |
| 3 | Fixture schemas + loader | Foundation |
| 4 | Exact judge | Foundation |
| 5 | Haiku-equiv judge | Foundation |
| 6 | Sonnet MHC judge | Foundation |
| 7 | Metrics primitives (recall/precision/F1/hitAtK/MHC) | Foundation |
| 8 | Thresholds YAML + loader | Foundation |
| 9 | Generic runner | Foundation |
| 10 | Console + JSON reporter | Foundation |
| 11 | Analyzer config | Analyzer vertical |
| 12 | Analyzer script + stub fixture + smoke test | Analyzer vertical |
| 13 | Consultant pool stub + schema | Matcher vertical |
| 14 | Matcher config | Matcher vertical |
| 15 | Matcher script + stub fixture + smoke test | Matcher vertical |
| 16 | `evals/README.md` med annotation-workflow | Docs |

---

## Task 1: Setup — dependencies, directories, npm scripts, gitignore

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`
- Create: `evals/fixtures/analyzer/.gitkeep`
- Create: `evals/fixtures/matcher/.gitkeep`
- Create: `evals/fixtures/consultants/.gitkeep`
- Create: `evals/harness/core/__tests__/.gitkeep`
- Create: `evals/harness/configs/.gitkeep`
- Create: `evals/scripts/.gitkeep`

- [ ] **Step 1: Install `yaml` dependency**

Run: `npm install yaml@^2.6.0`
Expected: `yaml` added to `dependencies` in package.json.

- [ ] **Step 2: Add eval scripts to package.json**

Edit `package.json` scripts-block to include:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run",
    "test:watch": "vitest",
    "eval:analyzer": "tsx evals/scripts/run-analyzer.ts",
    "eval:matcher": "tsx evals/scripts/run-matcher.ts"
  }
}
```

- [ ] **Step 3: Install `tsx` as devDependency**

Run: `npm install --save-dev tsx@^4.19.0`
Expected: `tsx` added to `devDependencies`.

Motivation: behöver `tsx` för att köra TypeScript-filer direkt utan bygg-steg (snabbare iteration än `ts-node` + Next's build pipeline).

- [ ] **Step 4: Update .gitignore**

Append to `.gitignore`:

```
# eval runs (local outputs, not shared)
/evals/runs
```

- [ ] **Step 5: Create directory structure with placeholder .gitkeep files**

Run (bash):
```bash
mkdir -p evals/fixtures/analyzer evals/fixtures/matcher evals/fixtures/consultants \
         evals/harness/core/__tests__ evals/harness/configs evals/scripts evals/runs
touch evals/fixtures/analyzer/.gitkeep evals/fixtures/matcher/.gitkeep \
      evals/fixtures/consultants/.gitkeep evals/harness/core/__tests__/.gitkeep \
      evals/harness/configs/.gitkeep evals/scripts/.gitkeep
```

Expected: directories exist, `.gitkeep`-filer committas (`evals/runs` är gitignored och committas inte).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .gitignore evals/
git commit -m "chore(evals): scaffold eval-harness dirs + yaml/tsx deps"
```

---

## Task 2: Core types

**Files:**
- Create: `evals/harness/core/types.ts`
- Test: (inga — rena type-definitioner)

- [ ] **Step 1: Write types file**

Create `evals/harness/core/types.ts`:

```typescript
// Shared types for the eval harness. Domain-agnostic.

export type JudgeName = "exact" | "haiku-equiv" | "sonnet-mhc";

export interface FieldJudgment {
  field: string;              // "title" | "requirements[0]" | "mhc.anna_svensson.krav_2"
  judge: JudgeName;
  match: boolean;
  evidence?: string;
  confidence?: "high" | "medium" | "low";
  golden: unknown;
  actual: unknown;
  error?: string;             // set if judge itself failed (unparseable response etc.)
}

export interface FixtureRunResult {
  fixtureId: string;
  actual?: unknown;                   // module output; undefined if module errored
  judgments: FieldJudgment[];
  metrics: Record<string, number>;    // flat metric map, e.g. { "requirements.f1": 0.87 }
  error?: string;                     // set if module call failed
}

export interface EvalRun {
  module: string;                     // "analyzer" | "matcher"
  mode?: string;                      // e.g. matcher "isolated" | "end_to_end"
  timestamp: string;                  // ISO-8601
  fixtures: FixtureRunResult[];
  aggregate: Record<string, number>;
}

export interface EvalConfig<Fixture, Output> {
  module: string;
  mode?: string;
  fixtureDir: string;                                         // "evals/fixtures/analyzer"
  loadFixture: (path: string) => Promise<Fixture>;
  runModule: (fixture: Fixture) => Promise<Output>;
  judgeOutput: (fixture: Fixture, actual: Output) => Promise<FieldJudgment[]>;
  computeFixtureMetrics: (judgments: FieldJudgment[]) => Record<string, number>;
  computeAggregate: (fixtureMetrics: Array<Record<string, number>>) => Record<string, number>;
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add evals/harness/core/types.ts
git commit -m "feat(evals): core types — FieldJudgment, FixtureRunResult, EvalRun, EvalConfig"
```

---

## Task 3: Fixture schemas + loader

**Files:**
- Create: `evals/harness/core/fixtures.ts`
- Create: `evals/harness/core/fixture-loader.ts`
- Test: `evals/harness/core/__tests__/fixture-loader.test.ts`

- [ ] **Step 1: Write fixture schemas**

Create `evals/harness/core/fixtures.ts`:

```typescript
import { z } from "zod";

// --- Analyzer fixture ---

export const AnalyzerGoldenSchema = z.object({
  title: z.string(),
  client: z.string(),
  deadline: z.string().nullable(),
  summary: z.string(),
  domain: z.string(),
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
});

export const AnalyzerFixtureSchema = z.object({
  id: z.string(),
  source_url: z.string().optional(),
  notes: z.string().optional(),
  rfp_text: z.string(),
  golden: AnalyzerGoldenSchema,
});

export type AnalyzerFixture = z.infer<typeof AnalyzerFixtureSchema>;

// --- Synthetic consultant pool ---

export const ParsedProfileSchema = z.object({
  name: z.string(),
  level: z.enum(["junior", "intermediate", "senior", "expert"]),
  yearsExperience: z.number(),
  summary: z.string(),
  competencies: z.array(z.string()),
  projects: z.array(
    z.object({
      client: z.string(),
      role: z.string(),
      years: z.string(),
      description: z.string(),
    })
  ),
});

export const SyntheticConsultantSchema = z.object({
  id: z.string(),
  match_profile: z.object({
    intent: z.string(),
    cv_format: z.string(),
    must_haves_demonstrated: z.array(z.string()),
  }),
  cv_text: z.string(),
  parsed_profile: ParsedProfileSchema,
});

export const ConsultantPoolSchema = z.object({
  consultants: z.array(SyntheticConsultantSchema),
});

export type SyntheticConsultant = z.infer<typeof SyntheticConsultantSchema>;

// --- Matcher fixture ---

export const MatcherFixtureSchema = z.object({
  id: z.string(),
  analyzer_fixture: z.string(),
  consultant_ids: z.array(z.string()),
  mode: z.enum(["isolated", "end_to_end"]).default("isolated"),
  golden: z.object({
    evaluation_method: z.enum(["top_k", "full_rank"]),
    expected_top_k: z.object({
      k: z.number(),
      must_contain: z.array(z.string()),
    }),
    must_have_coverage: z.object({
      enabled: z.boolean(),
      judge_model: z.string().default("claude-sonnet-4-6"),
      required_threshold: z.number().min(0).max(1).default(0.8),
    }),
    reasoning_rubric: z.string().optional(),
  }),
});

export type MatcherFixture = z.infer<typeof MatcherFixtureSchema>;
```

- [ ] **Step 2: Write failing loader tests**

Create `evals/harness/core/__tests__/fixture-loader.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { loadFixtureFromString, loadFixturesFromDir } from "../fixture-loader";
import { AnalyzerFixtureSchema } from "../fixtures";
import path from "path";
import fs from "fs/promises";
import os from "os";

describe("loadFixtureFromString", () => {
  it("parses valid YAML and validates against schema", () => {
    const yaml = `
id: test-1
rfp_text: "En RFP"
golden:
  title: "T"
  client: "C"
  deadline: null
  summary: "S"
  domain: "IT"
  requirements: []
  evaluationCriteria: []
  requiredCompetencies: []
  estimatedScope: "E"
  redFlags: []
`;
    const fixture = loadFixtureFromString(yaml, AnalyzerFixtureSchema, "test-1.yaml");
    expect(fixture.id).toBe("test-1");
    expect(fixture.golden.title).toBe("T");
  });

  it("throws with filename + message on invalid schema", () => {
    const yaml = `id: test\nrfp_text: "R"\ngolden: {}`;
    expect(() => loadFixtureFromString(yaml, AnalyzerFixtureSchema, "bad.yaml")).toThrow(/bad.yaml/);
  });

  it("throws with filename on malformed YAML", () => {
    const yaml = `id: : test\n`;
    expect(() => loadFixtureFromString(yaml, AnalyzerFixtureSchema, "broken.yaml")).toThrow(/broken.yaml/);
  });
});

describe("loadFixturesFromDir", () => {
  it("loads all *.yaml files in dir, skipping .gitkeep", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "eval-"));
    const good = `
id: tmp-1
rfp_text: "R"
golden:
  title: "T"
  client: "C"
  deadline: null
  summary: "S"
  domain: "IT"
  requirements: []
  evaluationCriteria: []
  requiredCompetencies: []
  estimatedScope: "E"
  redFlags: []
`;
    await fs.writeFile(path.join(tmp, "a.yaml"), good);
    await fs.writeFile(path.join(tmp, "b.yaml"), good.replace("tmp-1", "tmp-2"));
    await fs.writeFile(path.join(tmp, ".gitkeep"), "");

    const fixtures = await loadFixturesFromDir(tmp, AnalyzerFixtureSchema);
    expect(fixtures.map(f => f.id).sort()).toEqual(["tmp-1", "tmp-2"]);

    await fs.rm(tmp, { recursive: true });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- evals/harness/core/__tests__/fixture-loader.test.ts`
Expected: FAIL — "Cannot find module".

- [ ] **Step 4: Implement loader**

Create `evals/harness/core/fixture-loader.ts`:

```typescript
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";

export function loadFixtureFromString<T>(
  yamlContent: string,
  schema: z.ZodType<T>,
  filename: string
): T {
  let raw: unknown;
  try {
    raw = parseYaml(yamlContent);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[${filename}] malformed YAML: ${msg}`);
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new Error(`[${filename}] schema validation failed: ${result.error.message}`);
  }
  return result.data;
}

export async function loadFixturesFromDir<T>(
  dir: string,
  schema: z.ZodType<T>
): Promise<T[]> {
  const entries = await fs.readdir(dir);
  const yamlFiles = entries.filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  const fixtures: T[] = [];
  for (const file of yamlFiles.sort()) {
    const fullPath = path.join(dir, file);
    const content = await fs.readFile(fullPath, "utf-8");
    fixtures.push(loadFixtureFromString(content, schema, file));
  }
  return fixtures;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- evals/harness/core/__tests__/fixture-loader.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add evals/harness/core/fixtures.ts evals/harness/core/fixture-loader.ts \
        evals/harness/core/__tests__/fixture-loader.test.ts
git commit -m "feat(evals): YAML fixture schemas + loader with validation errors"
```

---

## Task 4: Exact judge

**Files:**
- Create: `evals/harness/core/judges.ts`
- Test: `evals/harness/core/__tests__/judges-exact.test.ts`

- [ ] **Step 1: Write failing tests for exact judge**

Create `evals/harness/core/__tests__/judges-exact.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { exactJudge } from "../judges";

describe("exactJudge", () => {
  it("matches equal strings", async () => {
    const r = await exactJudge({ golden: "Stockholm", actual: "Stockholm", field: "client" });
    expect(r.match).toBe(true);
    expect(r.judge).toBe("exact");
  });

  it("does not match different strings", async () => {
    const r = await exactJudge({ golden: "Stockholm", actual: "Göteborg", field: "client" });
    expect(r.match).toBe(false);
  });

  it("trims whitespace before comparing", async () => {
    const r = await exactJudge({ golden: "IT", actual: " IT ", field: "domain" });
    expect(r.match).toBe(true);
  });

  it("compares null and null as match", async () => {
    const r = await exactJudge({ golden: null, actual: null, field: "deadline" });
    expect(r.match).toBe(true);
  });

  it("compares null and value as no-match", async () => {
    const r = await exactJudge({ golden: null, actual: "2026-06-15", field: "deadline" });
    expect(r.match).toBe(false);
  });

  it("compares equal numbers as match", async () => {
    const r = await exactJudge({ golden: 60, actual: 60, field: "weight" });
    expect(r.match).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- evals/harness/core/__tests__/judges-exact.test.ts`
Expected: FAIL — "Cannot find module".

- [ ] **Step 3: Implement exact judge**

Create `evals/harness/core/judges.ts`:

```typescript
import type { FieldJudgment } from "./types";

export interface JudgeInput {
  golden: unknown;
  actual: unknown;
  field: string;
}

export async function exactJudge(input: JudgeInput): Promise<FieldJudgment> {
  const { golden, actual, field } = input;
  const norm = (v: unknown) => (typeof v === "string" ? v.trim() : v);
  const match = Object.is(norm(golden), norm(actual));
  return {
    field,
    judge: "exact",
    match,
    golden,
    actual,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- evals/harness/core/__tests__/judges-exact.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add evals/harness/core/judges.ts evals/harness/core/__tests__/judges-exact.test.ts
git commit -m "feat(evals): exact judge with whitespace/null normalization"
```

---

## Task 5: Haiku-equiv judge

**Files:**
- Modify: `evals/harness/core/judges.ts`
- Test: `evals/harness/core/__tests__/judges-haiku.test.ts`

- [ ] **Step 1: Write failing tests for haiku-equiv judge**

Create `evals/harness/core/__tests__/judges-haiku.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreate = vi.hoisted(() => vi.fn());
vi.mock("@anthropic-ai/sdk", () => ({
  default: function () { return { messages: { create: mockCreate } }; },
}));

import { haikuEquivJudge } from "../judges";

describe("haikuEquivJudge", () => {
  beforeEach(() => mockCreate.mockReset());

  it("returns match=true when judge says equivalent", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: '{"match": true, "reason": "same meaning"}' }],
    });
    const r = await haikuEquivJudge({
      golden: "IT-konsult med 5 års erfarenhet",
      actual: "Konsult inom IT med fem års erfarenhet",
      field: "requirements[0].description",
    });
    expect(r.match).toBe(true);
    expect(r.judge).toBe("haiku-equiv");
    expect(r.evidence).toBe("same meaning");
  });

  it("returns match=false when judge says different", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: '{"match": false, "reason": "different scope"}' }],
    });
    const r = await haikuEquivJudge({
      golden: "Svenska",
      actual: "Engelska",
      field: "requirements[0].description",
    });
    expect(r.match).toBe(false);
  });

  it("calls Haiku model specifically", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: '{"match": true, "reason": "ok"}' }],
    });
    await haikuEquivJudge({ golden: "A", actual: "B", field: "x" });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: expect.stringMatching(/haiku/i) })
    );
  });

  it("records error field when judge call fails", async () => {
    mockCreate.mockRejectedValue(new Error("network boom"));
    const r = await haikuEquivJudge({ golden: "A", actual: "B", field: "x" });
    expect(r.match).toBe(false);
    expect(r.error).toMatch(/network boom/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- evals/harness/core/__tests__/judges-haiku.test.ts`
Expected: FAIL — "haikuEquivJudge is not a function" or similar.

- [ ] **Step 3: Add Haiku judge to `judges.ts`**

Append to `evals/harness/core/judges.ts`:

```typescript
import { z } from "zod";
import { callClaude } from "@/lib/ai-client";

const JudgeResponseSchema = z.object({
  match: z.boolean(),
  reason: z.string(),
});

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

function renderValue(v: unknown): string {
  if (v === null || v === undefined) return "(inget värde)";
  if (typeof v === "string") return v;
  return JSON.stringify(v, null, 2);
}

export async function haikuEquivJudge(input: JudgeInput): Promise<FieldJudgment> {
  const { golden, actual, field } = input;
  const system = `Du bedömer semantisk ekvivalens mellan två värden. Svara med JSON { "match": boolean, "reason": string }.
Match = true om värdena uttrycker samma sak (synonymer, omformulering, ordordning). 
Match = false om de har olika betydelse eller scope.`;

  const userContent = `Fält: ${field}

Golden (förväntat):
${renderValue(golden)}

Faktiskt (modell-output):
${renderValue(actual)}`;

  try {
    const judgment = await callClaude({
      model: HAIKU_MODEL,
      maxTokens: 300,
      system,
      userContent,
      schema: JudgeResponseSchema,
      label: `haiku-equiv-judge(${field})`,
    });
    return {
      field,
      judge: "haiku-equiv",
      match: judgment.match,
      evidence: judgment.reason,
      golden,
      actual,
    };
  } catch (err) {
    return {
      field,
      judge: "haiku-equiv",
      match: false,
      error: err instanceof Error ? err.message : String(err),
      golden,
      actual,
    };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- evals/harness/core/__tests__/judges-haiku.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add evals/harness/core/judges.ts evals/harness/core/__tests__/judges-haiku.test.ts
git commit -m "feat(evals): haiku-equiv judge for semantic field equivalence"
```

---

## Task 6: Sonnet MHC judge

**Files:**
- Modify: `evals/harness/core/judges.ts`
- Test: `evals/harness/core/__tests__/judges-sonnet-mhc.test.ts`

- [ ] **Step 1: Write failing tests**

Create `evals/harness/core/__tests__/judges-sonnet-mhc.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreate = vi.hoisted(() => vi.fn());
vi.mock("@anthropic-ai/sdk", () => ({
  default: function () { return { messages: { create: mockCreate } }; },
}));

import { sonnetMhcJudge } from "../judges";

const sampleRequirement = {
  category: "Kompetens",
  description: "Minst 5 års erfarenhet av digital transformation i offentlig sektor",
  priority: "must" as const,
};

const sampleCv = `Anna Svensson, Senior Consultant.
Ledde molnmigration för Stockholms stad 2019-2024 (5 år).`;

describe("sonnetMhcJudge", () => {
  beforeEach(() => mockCreate.mockReset());

  it("returns demonstrated=true when CV covers the must-have", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text:
        '{"demonstrated": true, "evidence": "Ledde molnmigration för Stockholms stad 2019-2024", "confidence": "high"}' }],
    });
    const r = await sonnetMhcJudge({
      requirement: sampleRequirement,
      consultantId: "anna_svensson",
      cvText: sampleCv,
    });
    expect(r.match).toBe(true);
    expect(r.judge).toBe("sonnet-mhc");
    expect(r.evidence).toMatch(/Stockholms stad/);
    expect(r.confidence).toBe("high");
    expect(r.field).toBe("mhc.anna_svensson.Kompetens");
  });

  it("returns demonstrated=false when CV lacks evidence", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text:
        '{"demonstrated": false, "evidence": "inget relevant nämns", "confidence": "high"}' }],
    });
    const r = await sonnetMhcJudge({
      requirement: sampleRequirement,
      consultantId: "bertil",
      cvText: "Bertil, junior developer.",
    });
    expect(r.match).toBe(false);
    expect(r.confidence).toBe("high");
  });

  it("uses Sonnet model", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text:
        '{"demonstrated": true, "evidence": "x", "confidence": "medium"}' }],
    });
    await sonnetMhcJudge({ requirement: sampleRequirement, consultantId: "c1", cvText: "cv" });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: expect.stringMatching(/sonnet/i) })
    );
  });

  it("records error when judge call fails", async () => {
    mockCreate.mockRejectedValue(new Error("timeout"));
    const r = await sonnetMhcJudge({
      requirement: sampleRequirement,
      consultantId: "anna",
      cvText: "cv",
    });
    expect(r.match).toBe(false);
    expect(r.error).toMatch(/timeout/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- evals/harness/core/__tests__/judges-sonnet-mhc.test.ts`
Expected: FAIL — "sonnetMhcJudge is not a function".

- [ ] **Step 3: Add MHC judge to `judges.ts`**

Append to `evals/harness/core/judges.ts`:

```typescript
const MhcResponseSchema = z.object({
  demonstrated: z.boolean(),
  evidence: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
});

const SONNET_MODEL = "claude-sonnet-4-6";

export interface MhcJudgeInput {
  requirement: { category: string; description: string; priority: string };
  consultantId: string;
  cvText: string;
}

export async function sonnetMhcJudge(input: MhcJudgeInput): Promise<FieldJudgment> {
  const { requirement, consultantId, cvText } = input;
  const field = `mhc.${consultantId}.${requirement.category}`;

  const system = `Du bedömer om ett konsult-CV demonstrerar ett specifikt ska-krav från en RFP.
Svara med JSON { "demonstrated": boolean, "evidence": string, "confidence": "high"|"medium"|"low" }.

demonstrated = true endast om CV:t innehåller konkret bevis (projekt, år, roll, omfattning) som visar att konsulten uppfyller kravet.
evidence = citat från CV:t som stödjer bedömningen (eller "inget relevant nämns" om demonstrated=false).
confidence = "high" om beviset är explicit, "medium" om rimlig inferens, "low" om svag inferens.

Var strikt: nämnd kompetens utan år eller roll räcker INTE. "Erfarenhet av X" måste backas av ett projekt.`;

  const userContent = `Ska-krav (kategori: ${requirement.category}):
${requirement.description}

Konsult-CV (${consultantId}):
${cvText}`;

  try {
    const judgment = await callClaude({
      model: SONNET_MODEL,
      maxTokens: 500,
      system,
      userContent,
      schema: MhcResponseSchema,
      label: `sonnet-mhc-judge(${field})`,
    });
    return {
      field,
      judge: "sonnet-mhc",
      match: judgment.demonstrated,
      evidence: judgment.evidence,
      confidence: judgment.confidence,
      golden: requirement,
      actual: `(cv text for ${consultantId})`,
    };
  } catch (err) {
    return {
      field,
      judge: "sonnet-mhc",
      match: false,
      error: err instanceof Error ? err.message : String(err),
      golden: requirement,
      actual: `(cv text for ${consultantId})`,
    };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- evals/harness/core/__tests__/judges-sonnet-mhc.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add evals/harness/core/judges.ts evals/harness/core/__tests__/judges-sonnet-mhc.test.ts
git commit -m "feat(evals): sonnet-mhc judge for must-have coverage per (requirement × consultant)"
```

---

## Task 7: Metrics primitives

**Files:**
- Create: `evals/harness/core/metrics.ts`
- Test: `evals/harness/core/__tests__/metrics.test.ts`

- [ ] **Step 1: Write failing tests**

Create `evals/harness/core/__tests__/metrics.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { setMetrics, hitAtK, aggregateMhc, meanMetric } from "../metrics";

describe("setMetrics", () => {
  it("returns 1.0 for perfect match", () => {
    const r = setMetrics({ goldenMatches: 3, outputMatches: 3, goldenTotal: 3, outputTotal: 3 });
    expect(r.recall).toBe(1);
    expect(r.precision).toBe(1);
    expect(r.f1).toBe(1);
  });

  it("computes recall=2/3, precision=2/4 for partial", () => {
    const r = setMetrics({ goldenMatches: 2, outputMatches: 2, goldenTotal: 3, outputTotal: 4 });
    expect(r.recall).toBeCloseTo(2 / 3);
    expect(r.precision).toBeCloseTo(0.5);
    expect(r.f1).toBeCloseTo((2 * (2 / 3) * 0.5) / ((2 / 3) + 0.5));
  });

  it("returns zeros when both totals are zero", () => {
    const r = setMetrics({ goldenMatches: 0, outputMatches: 0, goldenTotal: 0, outputTotal: 0 });
    expect(r.recall).toBe(1);   // vacuous truth
    expect(r.precision).toBe(1);
    expect(r.f1).toBe(1);
  });

  it("returns 0 precision when output has items but none match", () => {
    const r = setMetrics({ goldenMatches: 0, outputMatches: 0, goldenTotal: 2, outputTotal: 3 });
    expect(r.recall).toBe(0);
    expect(r.precision).toBe(0);
    expect(r.f1).toBe(0);
  });
});

describe("hitAtK", () => {
  it("returns 1 when all must-contain are in top-K", () => {
    const r = hitAtK({ ranked: ["a", "b", "c", "d"], k: 2, mustContain: ["a", "b"] });
    expect(r).toBe(1);
  });

  it("returns 0 when any must-contain is missing from top-K", () => {
    const r = hitAtK({ ranked: ["a", "c", "b", "d"], k: 2, mustContain: ["a", "b"] });
    expect(r).toBe(0);
  });

  it("handles k larger than list", () => {
    const r = hitAtK({ ranked: ["a"], k: 3, mustContain: ["a"] });
    expect(r).toBe(1);
  });
});

describe("aggregateMhc", () => {
  it("computes per-consultant coverage and overall mean", () => {
    const r = aggregateMhc([
      { consultantId: "anna", requirement: "r1", demonstrated: true },
      { consultantId: "anna", requirement: "r2", demonstrated: true },
      { consultantId: "anna", requirement: "r3", demonstrated: false },
      { consultantId: "bertil", requirement: "r1", demonstrated: true },
      { consultantId: "bertil", requirement: "r2", demonstrated: false },
      { consultantId: "bertil", requirement: "r3", demonstrated: false },
    ]);
    expect(r.perConsultant["anna"]).toBeCloseTo(2 / 3);
    expect(r.perConsultant["bertil"]).toBeCloseTo(1 / 3);
    expect(r.mean).toBeCloseTo(0.5);
  });

  it("returns passThreshold=false when any consultant below threshold", () => {
    const r = aggregateMhc([
      { consultantId: "anna", requirement: "r1", demonstrated: true },
      { consultantId: "bertil", requirement: "r1", demonstrated: false },
    ], 0.8);
    expect(r.passThreshold).toBe(false);
  });

  it("returns passThreshold=true when all consultants meet threshold", () => {
    const r = aggregateMhc([
      { consultantId: "anna", requirement: "r1", demonstrated: true },
      { consultantId: "bertil", requirement: "r1", demonstrated: true },
    ], 0.8);
    expect(r.passThreshold).toBe(true);
  });
});

describe("meanMetric", () => {
  it("averages a metric across fixtures, skipping missing", () => {
    const r = meanMetric([
      { "requirements.f1": 0.8 },
      { "requirements.f1": 0.6 },
      { "other": 0.9 },
    ], "requirements.f1");
    expect(r).toBeCloseTo(0.7);
  });

  it("returns 0 when no fixture has the metric", () => {
    const r = meanMetric([{ "other": 0.5 }], "missing");
    expect(r).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- evals/harness/core/__tests__/metrics.test.ts`
Expected: FAIL — "Cannot find module".

- [ ] **Step 3: Implement metrics**

Create `evals/harness/core/metrics.ts`:

```typescript
export interface SetMetricsInput {
  goldenMatches: number;  // # golden items that had a matching output item
  outputMatches: number;  // # output items that matched a golden item
  goldenTotal: number;
  outputTotal: number;
}

export interface SetMetricsResult {
  recall: number;
  precision: number;
  f1: number;
}

export function setMetrics(input: SetMetricsInput): SetMetricsResult {
  const { goldenMatches, outputMatches, goldenTotal, outputTotal } = input;
  const recall = goldenTotal === 0 ? 1 : goldenMatches / goldenTotal;
  const precision = outputTotal === 0 ? 1 : outputMatches / outputTotal;
  const f1 = recall + precision === 0 ? 0 : (2 * recall * precision) / (recall + precision);
  return { recall, precision, f1 };
}

export function hitAtK(input: { ranked: string[]; k: number; mustContain: string[] }): number {
  const topK = new Set(input.ranked.slice(0, input.k));
  return input.mustContain.every((id) => topK.has(id)) ? 1 : 0;
}

export interface MhcEntry {
  consultantId: string;
  requirement: string;
  demonstrated: boolean;
}

export interface MhcAggregateResult {
  perConsultant: Record<string, number>;
  mean: number;
  passThreshold: boolean;
}

export function aggregateMhc(entries: MhcEntry[], threshold = 0.8): MhcAggregateResult {
  const byConsultant = new Map<string, { total: number; demonstrated: number }>();
  for (const e of entries) {
    const row = byConsultant.get(e.consultantId) ?? { total: 0, demonstrated: 0 };
    row.total += 1;
    if (e.demonstrated) row.demonstrated += 1;
    byConsultant.set(e.consultantId, row);
  }
  const perConsultant: Record<string, number> = {};
  let sum = 0;
  for (const [id, row] of byConsultant) {
    const cov = row.total === 0 ? 1 : row.demonstrated / row.total;
    perConsultant[id] = cov;
    sum += cov;
  }
  const mean = byConsultant.size === 0 ? 1 : sum / byConsultant.size;
  const passThreshold = Object.values(perConsultant).every((c) => c >= threshold);
  return { perConsultant, mean, passThreshold };
}

export function meanMetric(
  fixtureMetrics: Array<Record<string, number>>,
  key: string
): number {
  const values = fixtureMetrics
    .map((m) => m[key])
    .filter((v): v is number => typeof v === "number");
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- evals/harness/core/__tests__/metrics.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add evals/harness/core/metrics.ts evals/harness/core/__tests__/metrics.test.ts
git commit -m "feat(evals): metrics primitives — setMetrics, hitAtK, aggregateMhc, meanMetric"
```

---

## Task 8: Thresholds YAML + loader

**Files:**
- Create: `evals/thresholds.yaml`
- Create: `evals/harness/core/thresholds.ts`
- Test: `evals/harness/core/__tests__/thresholds.test.ts`

- [ ] **Step 1: Write thresholds YAML**

Create `evals/thresholds.yaml`:

```yaml
analyzer:
  requirements.f1:
    green: 0.85
    yellow: 0.70
  evaluationCriteria.f1:
    green: 0.80
    yellow: 0.65
  requiredCompetencies.f1:
    green: 0.85
    yellow: 0.70
  title:
    green: 1.0
    yellow: 1.0
  client:
    green: 1.0
    yellow: 1.0

matcher:
  mhc.mean:
    green: 0.90
    yellow: 0.80
  hit_at_k:
    green: 1.00
    yellow: 0.80
```

- [ ] **Step 2: Write failing tests**

Create `evals/harness/core/__tests__/thresholds.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { loadThresholds, categorize } from "../thresholds";
import path from "path";

describe("loadThresholds", () => {
  it("loads thresholds.yaml from project root", async () => {
    const t = await loadThresholds(path.resolve(__dirname, "../../../thresholds.yaml"));
    expect(t.analyzer["requirements.f1"].green).toBe(0.85);
    expect(t.matcher["mhc.mean"].yellow).toBe(0.80);
  });
});

describe("categorize", () => {
  const thresholds = { green: 0.85, yellow: 0.70 };

  it("returns green for value >= green threshold", () => {
    expect(categorize(0.90, thresholds)).toBe("green");
    expect(categorize(0.85, thresholds)).toBe("green");
  });

  it("returns yellow for value between yellow and green", () => {
    expect(categorize(0.80, thresholds)).toBe("yellow");
    expect(categorize(0.70, thresholds)).toBe("yellow");
  });

  it("returns red for value below yellow", () => {
    expect(categorize(0.65, thresholds)).toBe("red");
  });

  it("returns 'unknown' when no threshold defined", () => {
    expect(categorize(0.5, undefined)).toBe("unknown");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- evals/harness/core/__tests__/thresholds.test.ts`
Expected: FAIL — "Cannot find module".

- [ ] **Step 4: Implement thresholds loader**

Create `evals/harness/core/thresholds.ts`:

```typescript
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import fs from "fs/promises";

const ThresholdPairSchema = z.object({
  green: z.number(),
  yellow: z.number(),
});

const ThresholdsSchema = z.object({
  analyzer: z.record(z.string(), ThresholdPairSchema).default({}),
  matcher: z.record(z.string(), ThresholdPairSchema).default({}),
});

export type Thresholds = z.infer<typeof ThresholdsSchema>;
export type ThresholdPair = z.infer<typeof ThresholdPairSchema>;

export async function loadThresholds(filePath: string): Promise<Thresholds> {
  const content = await fs.readFile(filePath, "utf-8");
  const raw = parseYaml(content);
  return ThresholdsSchema.parse(raw);
}

export type Category = "green" | "yellow" | "red" | "unknown";

export function categorize(value: number, pair: ThresholdPair | undefined): Category {
  if (!pair) return "unknown";
  if (value >= pair.green) return "green";
  if (value >= pair.yellow) return "yellow";
  return "red";
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- evals/harness/core/__tests__/thresholds.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add evals/thresholds.yaml evals/harness/core/thresholds.ts \
        evals/harness/core/__tests__/thresholds.test.ts
git commit -m "feat(evals): thresholds.yaml seed + loader/categorize"
```

---

## Task 9: Generic runner

**Files:**
- Create: `evals/harness/core/runner.ts`
- Test: `evals/harness/core/__tests__/runner.test.ts`

- [ ] **Step 1: Write failing tests**

Create `evals/harness/core/__tests__/runner.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { runEval } from "../runner";
import type { EvalConfig, FieldJudgment } from "../types";

type F = { id: string; value: number };
type O = { doubled: number };

function baseConfig(overrides: Partial<EvalConfig<F, O>> = {}): EvalConfig<F, O> {
  return {
    module: "test",
    fixtureDir: "nonexistent",
    loadFixture: async () => ({ id: "f", value: 2 }),
    runModule: async (f) => ({ doubled: f.value * 2 }),
    judgeOutput: async (f, a): Promise<FieldJudgment[]> => [
      { field: "doubled", judge: "exact", match: a.doubled === f.value * 2, golden: f.value * 2, actual: a.doubled },
    ],
    computeFixtureMetrics: (j) => ({ "doubled.hit": j[0].match ? 1 : 0 }),
    computeAggregate: (m) => ({ "doubled.hit.mean": m.reduce((s, x) => s + (x["doubled.hit"] ?? 0), 0) / m.length }),
    ...overrides,
  };
}

describe("runEval", () => {
  it("runs fixtures, computes per-fixture + aggregate metrics", async () => {
    const fixtures: F[] = [{ id: "a", value: 2 }, { id: "b", value: 3 }];
    const config = baseConfig();

    const run = await runEval(config, fixtures);

    expect(run.module).toBe("test");
    expect(run.fixtures).toHaveLength(2);
    expect(run.fixtures[0].metrics["doubled.hit"]).toBe(1);
    expect(run.aggregate["doubled.hit.mean"]).toBe(1);
    expect(run.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("captures module errors per fixture without crashing the run", async () => {
    const fixtures: F[] = [{ id: "a", value: 2 }, { id: "b", value: 3 }];
    const config = baseConfig({
      runModule: vi.fn()
        .mockResolvedValueOnce({ doubled: 4 })
        .mockRejectedValueOnce(new Error("module boom")),
    });

    const run = await runEval(config, fixtures);

    expect(run.fixtures[0].error).toBeUndefined();
    expect(run.fixtures[1].error).toMatch(/module boom/);
    expect(run.fixtures[1].judgments).toEqual([]);
  });

  it("captures judge errors as judge_error without crashing", async () => {
    const fixtures: F[] = [{ id: "a", value: 2 }];
    const config = baseConfig({
      judgeOutput: async () => { throw new Error("judge boom"); },
    });

    const run = await runEval(config, fixtures);

    expect(run.fixtures[0].error).toMatch(/judge boom/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- evals/harness/core/__tests__/runner.test.ts`
Expected: FAIL — "Cannot find module".

- [ ] **Step 3: Implement runner**

Create `evals/harness/core/runner.ts`:

```typescript
import type { EvalConfig, EvalRun, FixtureRunResult } from "./types";

export async function runEval<F extends { id: string }, O>(
  config: EvalConfig<F, O>,
  fixtures: F[]
): Promise<EvalRun> {
  const fixtureResults: FixtureRunResult[] = [];

  for (const fixture of fixtures) {
    try {
      const actual = await config.runModule(fixture);
      const judgments = await config.judgeOutput(fixture, actual);
      const metrics = config.computeFixtureMetrics(judgments);
      fixtureResults.push({
        fixtureId: fixture.id,
        actual,
        judgments,
        metrics,
      });
    } catch (err) {
      fixtureResults.push({
        fixtureId: fixture.id,
        judgments: [],
        metrics: {},
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const goodMetrics = fixtureResults
    .filter((r) => !r.error)
    .map((r) => r.metrics);
  const aggregate = goodMetrics.length === 0 ? {} : config.computeAggregate(goodMetrics);

  return {
    module: config.module,
    mode: config.mode,
    timestamp: new Date().toISOString(),
    fixtures: fixtureResults,
    aggregate,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- evals/harness/core/__tests__/runner.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add evals/harness/core/runner.ts evals/harness/core/__tests__/runner.test.ts
git commit -m "feat(evals): generic runner with per-fixture error capture"
```

---

## Task 10: Console + JSON reporter

**Files:**
- Create: `evals/harness/core/reporter.ts`
- Test: `evals/harness/core/__tests__/reporter.test.ts`

- [ ] **Step 1: Write failing tests**

Create `evals/harness/core/__tests__/reporter.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { formatConsoleReport, writeJsonReport } from "../reporter";
import type { EvalRun } from "../types";
import fs from "fs/promises";
import path from "path";
import os from "os";

const run: EvalRun = {
  module: "analyzer",
  timestamp: "2026-04-16T14:30:00.000Z",
  fixtures: [
    {
      fixtureId: "ted-it",
      judgments: [],
      metrics: { "requirements.f1": 0.92, "client": 1.0 },
    },
    {
      fixtureId: "ted-hr",
      judgments: [],
      metrics: { "requirements.f1": 0.60, "client": 1.0 },
    },
    {
      fixtureId: "ted-broken",
      judgments: [],
      metrics: {},
      error: "malformed golden",
    },
  ],
  aggregate: { "requirements.f1.mean": 0.76, "client.mean": 1.0 },
};

const thresholds = {
  analyzer: {
    "requirements.f1": { green: 0.85, yellow: 0.70 },
    "client": { green: 1.0, yellow: 1.0 },
  },
  matcher: {},
};

describe("formatConsoleReport", () => {
  it("includes module name, each fixture id, and aggregate", () => {
    const out = formatConsoleReport(run, thresholds);
    expect(out).toContain("analyzer");
    expect(out).toContain("ted-it");
    expect(out).toContain("ted-hr");
    expect(out).toContain("requirements.f1");
    expect(out).toContain("0.92");
  });

  it("flags errored fixtures", () => {
    const out = formatConsoleReport(run, thresholds);
    expect(out).toContain("ted-broken");
    expect(out).toContain("ERROR");
    expect(out).toContain("malformed golden");
  });

  it("marks metrics as PASS/WARN/FAIL based on thresholds", () => {
    const out = formatConsoleReport(run, thresholds);
    // 0.92 >= 0.85 green → PASS
    expect(out).toMatch(/PASS.*0\.92/);
    // 0.60 < 0.70 yellow → FAIL
    expect(out).toMatch(/FAIL.*0\.60/);
  });
});

describe("writeJsonReport", () => {
  it("writes run object to file and returns path", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "eval-runs-"));
    const filePath = await writeJsonReport(run, tmp);

    expect(filePath).toMatch(/analyzer.*\.json$/);
    const content = JSON.parse(await fs.readFile(filePath, "utf-8"));
    expect(content.module).toBe("analyzer");
    expect(content.fixtures).toHaveLength(3);

    await fs.rm(tmp, { recursive: true });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- evals/harness/core/__tests__/reporter.test.ts`
Expected: FAIL — "Cannot find module".

- [ ] **Step 3: Implement reporter**

Create `evals/harness/core/reporter.ts`:

```typescript
import fs from "fs/promises";
import path from "path";
import type { EvalRun } from "./types";
import { categorize, type Thresholds } from "./thresholds";

function statusLabel(category: "green" | "yellow" | "red" | "unknown"): string {
  switch (category) {
    case "green": return "PASS";
    case "yellow": return "WARN";
    case "red": return "FAIL";
    case "unknown": return "—";
  }
}

export function formatConsoleReport(run: EvalRun, thresholds: Thresholds): string {
  const lines: string[] = [];
  const moduleKey = run.module as keyof Thresholds;
  const moduleThresholds = thresholds[moduleKey] ?? {};

  lines.push("");
  lines.push(`=== ${run.module} eval — ${run.timestamp} ===`);
  if (run.mode) lines.push(`mode: ${run.mode}`);
  lines.push("");

  for (const fx of run.fixtures) {
    if (fx.error) {
      lines.push(`  ERROR  ${fx.fixtureId}  (${fx.error})`);
      continue;
    }
    lines.push(`  ${fx.fixtureId}`);
    for (const [key, val] of Object.entries(fx.metrics)) {
      const category = categorize(val, moduleThresholds[key]);
      lines.push(`    ${statusLabel(category).padEnd(5)}  ${key.padEnd(30)}  ${val.toFixed(2)}`);
    }
  }

  lines.push("");
  lines.push("Aggregate:");
  for (const [key, val] of Object.entries(run.aggregate)) {
    const baseKey = key.replace(/\.mean$/, "");
    const category = categorize(val, moduleThresholds[baseKey]);
    lines.push(`  ${statusLabel(category).padEnd(5)}  ${key.padEnd(30)}  ${val.toFixed(2)}`);
  }

  const errored = run.fixtures.filter((f) => f.error).length;
  lines.push("");
  lines.push(`Fixtures: ${run.fixtures.length} total, ${run.fixtures.length - errored} ok, ${errored} errored`);
  lines.push("");

  return lines.join("\n");
}

export async function writeJsonReport(run: EvalRun, runsDir: string): Promise<string> {
  await fs.mkdir(runsDir, { recursive: true });
  const stamp = run.timestamp.replace(/[:.]/g, "-").replace(/Z$/, "");
  const filename = `${stamp}-${run.module}${run.mode ? `-${run.mode}` : ""}.json`;
  const filePath = path.join(runsDir, filename);
  await fs.writeFile(filePath, JSON.stringify(run, null, 2), "utf-8");
  return filePath;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- evals/harness/core/__tests__/reporter.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add evals/harness/core/reporter.ts evals/harness/core/__tests__/reporter.test.ts
git commit -m "feat(evals): console + JSON reporter with threshold-based PASS/WARN/FAIL"
```

---

## Task 11: Analyzer config

**Files:**
- Create: `evals/harness/configs/analyzer.ts`
- Test: `evals/harness/configs/__tests__/analyzer.test.ts`

- [ ] **Step 1: Create test dir**

Run: `mkdir -p evals/harness/configs/__tests__`

- [ ] **Step 2: Write failing tests**

Create `evals/harness/configs/__tests__/analyzer.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { analyzerConfig, computeAnalyzerMetrics, computeAnalyzerAggregate } from "../analyzer";
import type { FieldJudgment } from "../../core/types";

describe("analyzerConfig", () => {
  it("declares correct module + fixtureDir", () => {
    expect(analyzerConfig.module).toBe("analyzer");
    expect(analyzerConfig.fixtureDir).toContain("evals/fixtures/analyzer");
  });
});

describe("computeAnalyzerMetrics", () => {
  it("aggregates requirement judgments into recall/precision/F1", () => {
    const judgments: FieldJudgment[] = [
      { field: "title", judge: "haiku-equiv", match: true, golden: "T", actual: "T" },
      { field: "client", judge: "exact", match: true, golden: "C", actual: "C" },
      // 3 golden reqs: 2 matched, 1 missing. Output also had 2 — both matched.
      { field: "requirements[0]", judge: "haiku-equiv", match: true, golden: "r1", actual: "o1" },
      { field: "requirements[1]", judge: "haiku-equiv", match: true, golden: "r2", actual: "o2" },
      { field: "requirements[2]", judge: "haiku-equiv", match: false, golden: "r3", actual: null },
    ];
    const metrics = computeAnalyzerMetrics(judgments, { goldenCounts: { requirements: 3 }, outputCounts: { requirements: 2 } });

    expect(metrics["title"]).toBe(1);
    expect(metrics["client"]).toBe(1);
    expect(metrics["requirements.recall"]).toBeCloseTo(2 / 3);
    expect(metrics["requirements.precision"]).toBe(1);
    expect(metrics["requirements.f1"]).toBeCloseTo((2 * (2 / 3) * 1) / ((2 / 3) + 1));
  });
});

describe("computeAnalyzerAggregate", () => {
  it("averages per-fixture metrics", () => {
    const agg = computeAnalyzerAggregate([
      { "requirements.f1": 0.8, "title": 1 },
      { "requirements.f1": 0.6, "title": 0 },
    ]);
    expect(agg["requirements.f1.mean"]).toBeCloseTo(0.7);
    expect(agg["title.mean"]).toBe(0.5);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- evals/harness/configs/__tests__/analyzer.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement analyzer config**

Create `evals/harness/configs/analyzer.ts`:

```typescript
import path from "path";
import fs from "fs/promises";
import { analyzeRfp } from "@/lib/rfp-analyzer";
import type { RfpAnalysis } from "@/lib/types";
import { AnalyzerFixtureSchema, type AnalyzerFixture } from "../core/fixtures";
import { loadFixtureFromString } from "../core/fixture-loader";
import { exactJudge, haikuEquivJudge } from "../core/judges";
import { setMetrics, meanMetric } from "../core/metrics";
import type { EvalConfig, FieldJudgment } from "../core/types";

type Output = RfpAnalysis;

export interface AnalyzerFieldCounts {
  goldenCounts: Record<string, number>;
  outputCounts: Record<string, number>;
}

/**
 * Computes per-fixture metrics from the flat judgment list.
 * `goldenMatches` = number of golden items with match=true (from set-matching below).
 * Set-matching for arrays happens in judgeAnalyzer: we emit one judgment per golden item
 * with match=true if the output contains a semantic equivalent.
 */
export function computeAnalyzerMetrics(
  judgments: FieldJudgment[],
  counts: AnalyzerFieldCounts
): Record<string, number> {
  const metrics: Record<string, number> = {};

  // Scalar fields: 0/1 direct
  for (const scalar of ["title", "client", "deadline", "domain", "summary", "estimatedScope"]) {
    const j = judgments.find((x) => x.field === scalar);
    if (j) metrics[scalar] = j.match ? 1 : 0;
  }

  // Array fields: compute recall/precision/F1
  for (const arr of ["requirements", "evaluationCriteria", "requiredCompetencies", "redFlags"]) {
    const arrJudgments = judgments.filter((x) => x.field.startsWith(`${arr}[`));
    if (arrJudgments.length === 0 && counts.goldenCounts[arr] === undefined) continue;

    const goldenMatches = arrJudgments.filter((x) => x.match).length;
    const goldenTotal = counts.goldenCounts[arr] ?? arrJudgments.length;
    const outputTotal = counts.outputCounts[arr] ?? goldenMatches;
    // precision = output items that had a match. Here we approximate with goldenMatches
    // because judge is "for each golden, find best output match" (1-to-1).
    const outputMatches = goldenMatches;

    const { recall, precision, f1 } = setMetrics({
      goldenMatches, outputMatches, goldenTotal, outputTotal,
    });
    metrics[`${arr}.recall`] = recall;
    metrics[`${arr}.precision`] = precision;
    metrics[`${arr}.f1`] = f1;
  }

  return metrics;
}

export function computeAnalyzerAggregate(
  fixtureMetrics: Array<Record<string, number>>
): Record<string, number> {
  if (fixtureMetrics.length === 0) return {};
  const keys = new Set<string>();
  for (const m of fixtureMetrics) for (const k of Object.keys(m)) keys.add(k);
  const agg: Record<string, number> = {};
  for (const k of keys) agg[`${k}.mean`] = meanMetric(fixtureMetrics, k);
  return agg;
}

async function judgeAnalyzer(
  fixture: AnalyzerFixture,
  actual: Output
): Promise<FieldJudgment[]> {
  const judgments: FieldJudgment[] = [];

  // Scalars via exact or haiku-equiv
  judgments.push(await haikuEquivJudge({ field: "title", golden: fixture.golden.title, actual: actual.title }));
  judgments.push(await exactJudge({ field: "client", golden: fixture.golden.client, actual: actual.client }));
  judgments.push(await exactJudge({ field: "deadline", golden: fixture.golden.deadline, actual: actual.deadline }));
  judgments.push(await exactJudge({ field: "domain", golden: fixture.golden.domain, actual: actual.domain }));
  judgments.push(await haikuEquivJudge({ field: "summary", golden: fixture.golden.summary, actual: actual.summary }));
  judgments.push(await haikuEquivJudge({ field: "estimatedScope", golden: fixture.golden.estimatedScope, actual: actual.estimatedScope }));

  // Array fields: per golden item, find best match in actual (greedy 1-to-1)
  await judgeArrayField(judgments, "requirements",
    fixture.golden.requirements.map((r) => `${r.priority}: ${r.description}`),
    actual.requirements.map((r) => `${r.priority}: ${r.description}`));
  await judgeArrayField(judgments, "evaluationCriteria",
    fixture.golden.evaluationCriteria.map((e) => `${e.name} (${e.weight}%): ${e.description}`),
    actual.evaluationCriteria.map((e) => `${e.name} (${e.weight}%): ${e.description}`));
  await judgeArrayField(judgments, "requiredCompetencies",
    fixture.golden.requiredCompetencies, actual.requiredCompetencies);
  await judgeArrayField(judgments, "redFlags",
    fixture.golden.redFlags, actual.redFlags);

  return judgments;
}

async function judgeArrayField(
  out: FieldJudgment[],
  field: string,
  goldenItems: unknown[],
  actualItems: unknown[]
): Promise<void> {
  const usedActual = new Set<number>();
  for (let i = 0; i < goldenItems.length; i++) {
    let bestMatch: FieldJudgment | null = null;
    let bestMatchIdx = -1;
    for (let j = 0; j < actualItems.length; j++) {
      if (usedActual.has(j)) continue;
      const judgment = await haikuEquivJudge({
        field: `${field}[${i}]`,
        golden: goldenItems[i],
        actual: actualItems[j],
      });
      if (judgment.match) {
        bestMatch = judgment;
        bestMatchIdx = j;
        break;
      }
    }
    if (bestMatch) {
      usedActual.add(bestMatchIdx);
      out.push(bestMatch);
    } else {
      out.push({
        field: `${field}[${i}]`,
        judge: "haiku-equiv",
        match: false,
        golden: goldenItems[i],
        actual: null,
      });
    }
  }
  // Record unmatched output items so precision reflects spurious outputs.
  for (let j = 0; j < actualItems.length; j++) {
    if (usedActual.has(j)) continue;
    out.push({
      field: `${field}[extra_${j}]`,
      judge: "haiku-equiv",
      match: false,
      golden: null,
      actual: actualItems[j],
    });
  }
}

export const analyzerConfig: EvalConfig<AnalyzerFixture, Output> = {
  module: "analyzer",
  fixtureDir: path.resolve(process.cwd(), "evals/fixtures/analyzer"),
  loadFixture: async (filePath: string) => {
    const content = await fs.readFile(filePath, "utf-8");
    return loadFixtureFromString(content, AnalyzerFixtureSchema, path.basename(filePath));
  },
  runModule: async (fixture) => analyzeRfp(fixture.rfp_text),
  judgeOutput: judgeAnalyzer,
  computeFixtureMetrics: (judgments) => {
    // Reconstruct counts from judgments produced by judgeArrayField:
    //   golden items  → fields `${arr}[N]`     — N is a number
    //   extra outputs → fields `${arr}[extra_N]`
    const counts: AnalyzerFieldCounts = { goldenCounts: {}, outputCounts: {} };
    for (const arr of ["requirements", "evaluationCriteria", "requiredCompetencies", "redFlags"]) {
      const goldenJudgments = judgments.filter((x) => /^[^\[]+\[\d+\]$/.test(x.field) && x.field.startsWith(`${arr}[`));
      const extraJudgments = judgments.filter((x) => x.field.startsWith(`${arr}[extra_`));
      counts.goldenCounts[arr] = goldenJudgments.length;
      const matched = goldenJudgments.filter((x) => x.match).length;
      counts.outputCounts[arr] = matched + extraJudgments.length;
    }
    return computeAnalyzerMetrics(judgments, counts);
  },
  computeAggregate: computeAnalyzerAggregate,
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- evals/harness/configs/__tests__/analyzer.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add evals/harness/configs/analyzer.ts evals/harness/configs/__tests__/analyzer.test.ts
git commit -m "feat(evals): analyzer config — field-to-judge mapping + set-matching metrics"
```

---

## Task 12: Analyzer script + stub fixture + smoke test

**Files:**
- Create: `evals/fixtures/analyzer/_stub.yaml`
- Create: `evals/scripts/run-analyzer.ts`

- [ ] **Step 1: Create stub analyzer fixture**

Create `evals/fixtures/analyzer/_stub.yaml`:

```yaml
id: _stub
notes: |
  Smoke-test-fixture. Används för att verifiera CLI-pipeline utan att betrakta
  metrics seriöst. Ersätts av riktiga TED-fixtures.
rfp_text: |
  Stockholms stad söker konsult för digital transformation. Uppdraget är 18 månader
  och kräver minst 5 års erfarenhet av digital transformation i offentlig sektor.
  Flytande svenska är ett ska-krav. Deadline för anbud: 2026-06-15.
  Utvärdering: kvalitet 60%, pris 40%.

golden:
  title: "Digital transformation — Stockholms stad"
  client: "Stockholms stad"
  deadline: "2026-06-15"
  domain: "IT"
  summary: "Stockholms stad söker konsult för 18 månaders digital-transformation-uppdrag."
  requirements:
    - category: "Kompetens"
      description: "Minst 5 års erfarenhet av digital transformation i offentlig sektor"
      priority: "must"
    - category: "Språk"
      description: "Flytande svenska"
      priority: "must"
  evaluationCriteria:
    - name: "Kvalitet"
      weight: 60
      description: "Metod och leveransplan"
    - name: "Pris"
      weight: 40
      description: "Timarvode"
  requiredCompetencies: ["digital transformation", "offentlig sektor"]
  estimatedScope: "18 månaders uppdrag"
  redFlags: []
```

- [ ] **Step 2: Create analyzer runner script**

Create `evals/scripts/run-analyzer.ts`:

```typescript
import path from "path";
import fs from "fs/promises";
import { analyzerConfig } from "../harness/configs/analyzer";
import { runEval } from "../harness/core/runner";
import { formatConsoleReport, writeJsonReport } from "../harness/core/reporter";
import { loadThresholds } from "../harness/core/thresholds";
import { AnalyzerFixtureSchema } from "../harness/core/fixtures";
import { loadFixtureFromString } from "../harness/core/fixture-loader";
import type { AnalyzerFixture } from "../harness/core/fixtures";

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY not set. Put it in .env.local and source it.");
    process.exit(1);
  }

  // Parse --fixture flag
  const fixtureArgIdx = process.argv.indexOf("--fixture");
  const fixtureFilter = fixtureArgIdx >= 0 ? process.argv[fixtureArgIdx + 1] : null;

  // Load fixtures
  const dir = analyzerConfig.fixtureDir;
  const entries = await fs.readdir(dir);
  const yamlFiles = entries.filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  const fixtures: AnalyzerFixture[] = [];
  for (const file of yamlFiles.sort()) {
    const content = await fs.readFile(path.join(dir, file), "utf-8");
    const fx = loadFixtureFromString(content, AnalyzerFixtureSchema, file);
    if (fixtureFilter && fx.id !== fixtureFilter) continue;
    fixtures.push(fx);
  }

  if (fixtures.length === 0) {
    console.error(`No fixtures found in ${dir}${fixtureFilter ? ` matching id=${fixtureFilter}` : ""}.`);
    process.exit(1);
  }

  console.log(`Running ${fixtures.length} analyzer fixture(s)...`);

  const run = await runEval(analyzerConfig, fixtures);

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

- [ ] **Step 3: Verify tsx picks up the script structure**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run smoke test with stub fixture (requires API key)**

Run: `npm run eval:analyzer -- --fixture _stub`

Expected: Script runs, console report prints with fixture `_stub`, JSON dumped to `evals/runs/`. Metrics may be yellow/red — that's fine; smoke test only validates the pipeline, not quality. If ANTHROPIC_API_KEY isn't available in this env, skip and note in commit message that smoke test is deferred.

- [ ] **Step 5: Commit**

```bash
git add evals/fixtures/analyzer/_stub.yaml evals/scripts/run-analyzer.ts
git commit -m "feat(evals): analyzer CLI script + _stub fixture for smoke testing"
```

---

## Task 13: Consultant pool stub + schema

**Files:**
- Create: `evals/fixtures/consultants/synthetic-pool.yaml`
- Create: `evals/harness/core/consultant-pool.ts`
- Test: `evals/harness/core/__tests__/consultant-pool.test.ts`

- [ ] **Step 1: Create minimal consultant pool**

Create `evals/fixtures/consultants/synthetic-pool.yaml`:

```yaml
consultants:
  - id: anna_svensson
    match_profile:
      intent: "strong-match-it-consulting"
      cv_format: "structured-bullets"
      must_haves_demonstrated: ["digital_transformation_5yr", "public_sector"]
    cv_text: |
      Anna Svensson — Senior Management Consultant
      12 års erfarenhet inom digital transformation i offentlig sektor.

      Projekt:
      - Stockholms stad 2019-2024: Ledde molnmigration för 12 förvaltningar.
        Ansvarig för strategi, partnerval och leverans. Agila metoder (SAFe).
      - Region Skåne 2015-2019: Digitaliseringsstrateg, ledde journalsystem-projekt.

      Kompetenser: digital transformation, molnmigration, offentlig sektor, SAFe, Scrum.
      Språk: svenska (modersmål), engelska (flytande).
    parsed_profile:
      name: "Anna Svensson"
      level: "expert"
      yearsExperience: 12
      summary: "Senior management consultant med djup erfarenhet av digital transformation i offentlig sektor."
      competencies: ["digital transformation", "molnmigration", "offentlig sektor", "SAFe", "Scrum"]
      projects:
        - client: "Stockholms stad"
          role: "Lead konsult"
          years: "2019-2024"
          description: "Molnmigration för 12 förvaltningar"
        - client: "Region Skåne"
          role: "Digitaliseringsstrateg"
          years: "2015-2019"
          description: "Journalsystem-projekt"

  - id: bertil_larsson
    match_profile:
      intent: "non-match-junior"
      cv_format: "narrative"
      must_haves_demonstrated: []
    cv_text: |
      Bertil Larsson, junior utvecklare med 2 års erfarenhet av React och TypeScript.
      Jobbat på startup inom e-handel. Inga konsultuppdrag eller offentlig sektor.
    parsed_profile:
      name: "Bertil Larsson"
      level: "junior"
      yearsExperience: 2
      summary: "Junior frontend-utvecklare."
      competencies: ["React", "TypeScript", "e-handel"]
      projects:
        - client: "E-handelsstartup AB"
          role: "Utvecklare"
          years: "2024-2026"
          description: "Frontend för kundportal"

  - id: cecilia_berg
    match_profile:
      intent: "close-call-it-consulting"
      cv_format: "structured-bullets"
      must_haves_demonstrated: ["digital_transformation_5yr"]
    cv_text: |
      Cecilia Berg — Senior konsult, 8 års erfarenhet av digital transformation.

      Projekt:
      - Volvo Cars 2020-2024: Ledde DX-program, 4 workstreams.
      - IKEA 2018-2020: Digitaliseringsanalys e-handel.

      Offentlig sektor: inget. Privata företag hela karriären.
      Språk: svenska, engelska.
    parsed_profile:
      name: "Cecilia Berg"
      level: "senior"
      yearsExperience: 8
      summary: "Senior konsult med 8 års DX-erfarenhet i privat sektor."
      competencies: ["digital transformation", "change management", "privat sektor"]
      projects:
        - client: "Volvo Cars"
          role: "DX-lead"
          years: "2020-2024"
          description: "Lead för 4 workstreams"
        - client: "IKEA"
          role: "Digitaliseringskonsult"
          years: "2018-2020"
          description: "E-handelsanalys"
```

- [ ] **Step 2: Write failing test for pool loader**

Create `evals/harness/core/__tests__/consultant-pool.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { loadConsultantPool, getConsultantsByIds } from "../consultant-pool";
import path from "path";

const POOL_PATH = path.resolve(__dirname, "../../../fixtures/consultants/synthetic-pool.yaml");

describe("loadConsultantPool", () => {
  it("loads and validates the pool", async () => {
    const pool = await loadConsultantPool(POOL_PATH);
    expect(pool.length).toBeGreaterThanOrEqual(3);
    expect(pool.find((c) => c.id === "anna_svensson")).toBeDefined();
  });
});

describe("getConsultantsByIds", () => {
  it("returns consultants in request order", async () => {
    const pool = await loadConsultantPool(POOL_PATH);
    const selected = getConsultantsByIds(pool, ["bertil_larsson", "anna_svensson"]);
    expect(selected.map((c) => c.id)).toEqual(["bertil_larsson", "anna_svensson"]);
  });

  it("throws on unknown id", async () => {
    const pool = await loadConsultantPool(POOL_PATH);
    expect(() => getConsultantsByIds(pool, ["does_not_exist"])).toThrow(/does_not_exist/);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- evals/harness/core/__tests__/consultant-pool.test.ts`
Expected: FAIL — "Cannot find module".

- [ ] **Step 4: Implement pool loader**

Create `evals/harness/core/consultant-pool.ts`:

```typescript
import fs from "fs/promises";
import { parse as parseYaml } from "yaml";
import { ConsultantPoolSchema, type SyntheticConsultant } from "./fixtures";

export async function loadConsultantPool(filePath: string): Promise<SyntheticConsultant[]> {
  const content = await fs.readFile(filePath, "utf-8");
  const raw = parseYaml(content);
  const parsed = ConsultantPoolSchema.parse(raw);
  return parsed.consultants;
}

export function getConsultantsByIds(
  pool: SyntheticConsultant[],
  ids: string[]
): SyntheticConsultant[] {
  const byId = new Map(pool.map((c) => [c.id, c]));
  const result: SyntheticConsultant[] = [];
  for (const id of ids) {
    const c = byId.get(id);
    if (!c) throw new Error(`unknown consultant_id: ${id}`);
    result.push(c);
  }
  return result;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- evals/harness/core/__tests__/consultant-pool.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add evals/fixtures/consultants/synthetic-pool.yaml evals/harness/core/consultant-pool.ts \
        evals/harness/core/__tests__/consultant-pool.test.ts
git commit -m "feat(evals): synthetic consultant pool (3 stub profiles) + loader"
```

---

## Task 14: Matcher config

**Files:**
- Create: `evals/harness/configs/matcher.ts`
- Test: `evals/harness/configs/__tests__/matcher.test.ts`

- [ ] **Step 1: Write failing tests**

Create `evals/harness/configs/__tests__/matcher.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  matcherConfig,
  computeMatcherMetrics,
  computeMatcherAggregate,
} from "../matcher";
import type { FieldJudgment } from "../../core/types";

describe("matcherConfig", () => {
  it("declares correct module + mode + fixtureDir", () => {
    expect(matcherConfig.module).toBe("matcher");
    expect(matcherConfig.mode).toBe("isolated");
    expect(matcherConfig.fixtureDir).toContain("evals/fixtures/matcher");
  });
});

describe("computeMatcherMetrics", () => {
  it("extracts MHC per-consultant + mean + pass/fail", () => {
    const judgments: FieldJudgment[] = [
      { field: "mhc.anna_svensson.Kompetens", judge: "sonnet-mhc", match: true, golden: {}, actual: "" },
      { field: "mhc.anna_svensson.Språk", judge: "sonnet-mhc", match: true, golden: {}, actual: "" },
      { field: "mhc.cecilia_berg.Kompetens", judge: "sonnet-mhc", match: true, golden: {}, actual: "" },
      { field: "mhc.cecilia_berg.Språk", judge: "sonnet-mhc", match: false, golden: {}, actual: "" },
      { field: "hit_at_k", judge: "exact", match: true, golden: ["anna_svensson", "cecilia_berg"], actual: ["anna_svensson", "cecilia_berg"] },
      { field: "reasoning.anna_svensson", judge: "haiku-equiv", match: true, golden: "good", actual: "good" },
      { field: "reasoning.cecilia_berg", judge: "haiku-equiv", match: false, golden: "good", actual: "weak" },
    ];
    const metrics = computeMatcherMetrics(judgments, 0.8);

    expect(metrics["mhc.anna_svensson"]).toBe(1);
    expect(metrics["mhc.cecilia_berg"]).toBeCloseTo(0.5);
    expect(metrics["mhc.mean"]).toBeCloseTo(0.75);
    expect(metrics["mhc.pass"]).toBe(0);   // cecilia 0.5 < 0.8
    expect(metrics["hit_at_k"]).toBe(1);
    expect(metrics["reasoning.good_ratio"]).toBeCloseTo(0.5);
  });
});

describe("computeMatcherAggregate", () => {
  it("averages across fixtures", () => {
    const agg = computeMatcherAggregate([
      { "mhc.mean": 0.9, "hit_at_k": 1, "mhc.pass": 1 },
      { "mhc.mean": 0.6, "hit_at_k": 1, "mhc.pass": 0 },
    ]);
    expect(agg["mhc.mean.mean"]).toBeCloseTo(0.75);
    expect(agg["hit_at_k.mean"]).toBe(1);
    expect(agg["mhc.pass.mean"]).toBe(0.5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- evals/harness/configs/__tests__/matcher.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement matcher config**

Create `evals/harness/configs/matcher.ts`:

```typescript
import path from "path";
import fs from "fs/promises";
import { matchConsultants } from "@/lib/consultant-matcher";
import type { Consultant, RfpAnalysis, ScoredMatchResult } from "@/lib/types";
import { MatcherFixtureSchema, AnalyzerFixtureSchema, type MatcherFixture, type AnalyzerFixture, type SyntheticConsultant } from "../core/fixtures";
import { loadFixtureFromString } from "../core/fixture-loader";
import { loadConsultantPool, getConsultantsByIds } from "../core/consultant-pool";
import { sonnetMhcJudge, haikuEquivJudge, exactJudge } from "../core/judges";
import { hitAtK, aggregateMhc, meanMetric } from "../core/metrics";
import type { EvalConfig, FieldJudgment } from "../core/types";

type Output = ScoredMatchResult;

interface MatcherEvalContext {
  fixture: MatcherFixture;
  analyzerFixture: AnalyzerFixture;
  consultants: SyntheticConsultant[];
}

const POOL_PATH = path.resolve(process.cwd(), "evals/fixtures/consultants/synthetic-pool.yaml");
const ANALYZER_FIXTURE_DIR = path.resolve(process.cwd(), "evals/fixtures/analyzer");

async function loadContext(fixture: MatcherFixture): Promise<MatcherEvalContext> {
  const analyzerPath = path.join(ANALYZER_FIXTURE_DIR, `${fixture.analyzer_fixture}.yaml`);
  const analyzerContent = await fs.readFile(analyzerPath, "utf-8");
  const analyzerFixture = loadFixtureFromString(
    analyzerContent, AnalyzerFixtureSchema, path.basename(analyzerPath)
  );
  const pool = await loadConsultantPool(POOL_PATH);
  const consultants = getConsultantsByIds(pool, fixture.consultant_ids);
  return { fixture, analyzerFixture, consultants };
}

export function computeMatcherMetrics(
  judgments: FieldJudgment[],
  threshold: number
): Record<string, number> {
  const metrics: Record<string, number> = {};

  // MHC aggregation from mhc.<id>.* judgments
  const mhcEntries = judgments
    .filter((j) => j.judge === "sonnet-mhc" && j.field.startsWith("mhc."))
    .map((j) => {
      const parts = j.field.split(".");  // mhc, <consultantId>, <category>
      return {
        consultantId: parts[1],
        requirement: parts[2],
        demonstrated: j.match,
      };
    });

  if (mhcEntries.length > 0) {
    const mhc = aggregateMhc(mhcEntries, threshold);
    for (const [id, cov] of Object.entries(mhc.perConsultant)) {
      metrics[`mhc.${id}`] = cov;
    }
    metrics["mhc.mean"] = mhc.mean;
    metrics["mhc.pass"] = mhc.passThreshold ? 1 : 0;
  }

  // hit@K — single judgment
  const hit = judgments.find((j) => j.field === "hit_at_k");
  if (hit) metrics["hit_at_k"] = hit.match ? 1 : 0;

  // Reasoning quality — ratio of "good" judgments
  const reasoningJudgments = judgments.filter((j) => j.field.startsWith("reasoning."));
  if (reasoningJudgments.length > 0) {
    const good = reasoningJudgments.filter((j) => j.match).length;
    metrics["reasoning.good_ratio"] = good / reasoningJudgments.length;
  }

  return metrics;
}

export function computeMatcherAggregate(
  fixtureMetrics: Array<Record<string, number>>
): Record<string, number> {
  if (fixtureMetrics.length === 0) return {};
  const keys = new Set<string>();
  for (const m of fixtureMetrics) for (const k of Object.keys(m)) keys.add(k);
  const agg: Record<string, number> = {};
  for (const k of keys) agg[`${k}.mean`] = meanMetric(fixtureMetrics, k);
  return agg;
}

async function judgeMatcher(
  fixture: MatcherFixture & { _context?: MatcherEvalContext },
  actual: Output
): Promise<FieldJudgment[]> {
  const judgments: FieldJudgment[] = [];
  const context = fixture._context!;

  // Ranking → hit@K
  const rankedIds = actual.scoredConsultants
    .slice()
    .sort((a, b) => b.score - a.score)
    .map((c) => c.consultantId);

  const { k, must_contain } = fixture.golden.expected_top_k;
  const hitResult = hitAtK({ ranked: rankedIds, k, mustContain: must_contain });
  judgments.push({
    field: "hit_at_k",
    judge: "exact",
    match: hitResult === 1,
    golden: must_contain,
    actual: rankedIds.slice(0, k),
  });

  // MHC per (top-K consultant × must requirement)
  if (fixture.golden.must_have_coverage.enabled) {
    const topK = rankedIds.slice(0, k);
    const mustReqs = context.analyzerFixture.golden.requirements.filter((r) => r.priority === "must");
    for (const consultantId of topK) {
      const consultant = context.consultants.find((c) => c.id === consultantId);
      if (!consultant) continue;
      for (const req of mustReqs) {
        judgments.push(await sonnetMhcJudge({
          requirement: req,
          consultantId,
          cvText: consultant.cv_text,
        }));
      }
    }
  }

  // Reasoning quality per top-K consultant
  for (const consultantId of rankedIds.slice(0, k)) {
    const consultant = actual.scoredConsultants.find((c) => c.consultantId === consultantId);
    if (!consultant) continue;
    judgments.push({
      ...(await haikuEquivJudge({
        field: `reasoning.${consultantId}`,
        golden: "good reasoning — konkret, refererar CV-punkter, kopplad till RFP-krav, utan hallucination",
        actual: consultant.reasoning,
      })),
    });
  }

  return judgments;
}

export const matcherConfig: EvalConfig<MatcherFixture & { _context?: MatcherEvalContext }, Output> = {
  module: "matcher",
  mode: "isolated",
  fixtureDir: path.resolve(process.cwd(), "evals/fixtures/matcher"),
  loadFixture: async (filePath: string) => {
    const content = await fs.readFile(filePath, "utf-8");
    return loadFixtureFromString(content, MatcherFixtureSchema, path.basename(filePath));
  },
  runModule: async (fixture) => {
    const context = await loadContext(fixture);
    (fixture as MatcherFixture & { _context?: MatcherEvalContext })._context = context;

    const analysis: RfpAnalysis = context.analyzerFixture.golden;
    const NOW = new Date().toISOString();
    const consultantsForMatcher: Consultant[] = context.consultants.map((c) => ({
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
    }));

    return matchConsultants(analysis, consultantsForMatcher);
  },
  judgeOutput: (fixture, actual) => judgeMatcher(fixture, actual),
  computeFixtureMetrics: (judgments) =>
    computeMatcherMetrics(judgments, 0.8),
  computeAggregate: computeMatcherAggregate,
};
```

**Adapter note:** `matchConsultants` expects a `Consultant[]` shape defined in `src/lib/consultant-matcher.ts`. If its signature differs from what we build above, adjust the adapter in `runModule` to match. Inspect `src/lib/consultant-matcher.ts` for the exact type before running the smoke test.

- [ ] **Step 4: Verify consultant-matcher signature and adjust adapter if needed**

Read `src/lib/consultant-matcher.ts` and `src/lib/ai-schemas.ts` (ConsultantExtractionSchema). If `matchConsultants` signature doesn't match `(analysis, consultants)` or the consultant shape, tweak the adapter in `runModule`. Goal: the adapter produces consultants shaped exactly like what `matchConsultants` expects.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- evals/harness/configs/__tests__/matcher.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add evals/harness/configs/matcher.ts evals/harness/configs/__tests__/matcher.test.ts
git commit -m "feat(evals): matcher config — MHC + hit@K + reasoning + isolated mode adapter"
```

---

## Task 15: Matcher script + stub fixture + smoke test

**Files:**
- Create: `evals/fixtures/matcher/_stub.yaml`
- Create: `evals/scripts/run-matcher.ts`

- [ ] **Step 1: Create stub matcher fixture**

Create `evals/fixtures/matcher/_stub.yaml`:

```yaml
id: _stub
analyzer_fixture: _stub
mode: isolated
consultant_ids:
  - anna_svensson
  - bertil_larsson
  - cecilia_berg
golden:
  evaluation_method: "top_k"
  expected_top_k:
    k: 2
    must_contain:
      - anna_svensson
      - cecilia_berg
  must_have_coverage:
    enabled: true
    judge_model: "claude-sonnet-4-6"
    required_threshold: 0.80
  reasoning_rubric: |
    Top-K-konsultens motivering ska referera konkreta CV-punkter (klient, år, roll)
    och koppla dessa till RFP:s ska-krav, utan att hitta på fakta.
```

- [ ] **Step 2: Create matcher runner script**

Create `evals/scripts/run-matcher.ts`:

```typescript
import path from "path";
import fs from "fs/promises";
import { matcherConfig } from "../harness/configs/matcher";
import { runEval } from "../harness/core/runner";
import { formatConsoleReport, writeJsonReport } from "../harness/core/reporter";
import { loadThresholds } from "../harness/core/thresholds";
import { MatcherFixtureSchema } from "../harness/core/fixtures";
import { loadFixtureFromString } from "../harness/core/fixture-loader";
import type { MatcherFixture } from "../harness/core/fixtures";

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY not set. Put it in .env.local and source it.");
    process.exit(1);
  }

  const fixtureArgIdx = process.argv.indexOf("--fixture");
  const fixtureFilter = fixtureArgIdx >= 0 ? process.argv[fixtureArgIdx + 1] : null;

  const dir = matcherConfig.fixtureDir;
  const entries = await fs.readdir(dir);
  const yamlFiles = entries.filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  const fixtures: MatcherFixture[] = [];
  for (const file of yamlFiles.sort()) {
    const content = await fs.readFile(path.join(dir, file), "utf-8");
    const fx = loadFixtureFromString(content, MatcherFixtureSchema, file);
    if (fixtureFilter && fx.id !== fixtureFilter) continue;
    fixtures.push(fx);
  }

  if (fixtures.length === 0) {
    console.error(`No fixtures found in ${dir}${fixtureFilter ? ` matching id=${fixtureFilter}` : ""}.`);
    process.exit(1);
  }

  console.log(`Running ${fixtures.length} matcher fixture(s) (mode: ${matcherConfig.mode})...`);

  const run = await runEval(matcherConfig, fixtures);

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

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run smoke test with stub fixture (requires API key)**

Run: `npm run eval:matcher -- --fixture _stub`

Expected: Script runs, console report prints with fixture `_stub`, JSON dumped to `evals/runs/`. Metrics may be anywhere — smoke test only validates pipeline. If ANTHROPIC_API_KEY isn't available, skip and note in commit message.

- [ ] **Step 5: Commit**

```bash
git add evals/fixtures/matcher/_stub.yaml evals/scripts/run-matcher.ts
git commit -m "feat(evals): matcher CLI script + _stub fixture for smoke testing"
```

---

## Task 16: README — annotation workflow + how to use

**Files:**
- Create: `evals/README.md`

- [ ] **Step 1: Write README**

Create `evals/README.md`:

````markdown
# AI Eval Harness

Verifierar träffsäkerhet i `rfp-analyzer` och `consultant-matcher` via ett fixerat golden set av YAML-fixtures. MVP-primärmål: conviction på att modellen matchar konsulter vars CV:n demonstrerar RFP:ns ska-krav.

## Köra evals

```bash
# Kräver ANTHROPIC_API_KEY i .env.local
source .env.local

npm run eval:analyzer                        # alla analyzer-fixtures
npm run eval:matcher                         # alla matcher-fixtures (mode: isolated)
npm run eval:analyzer -- --fixture _stub     # enskild fixture
```

Output:
- Konsollen: färgmärkt rapport (PASS/WARN/FAIL per metric)
- `evals/runs/<timestamp>-<modul>.json`: komplett run-dump för senare diff/trend

## Lägga till en ny analyzer-fixture

1. Välj en RFP från TED, Opic eller liknande källa. Loggbok: lägg `source_url` i fixturen.
2. Kopiera mallen `evals/fixtures/analyzer/_stub.yaml` till `evals/fixtures/analyzer/<id>.yaml` (id = slugified RFP-namn).
3. Klistra in hela RFP-texten under `rfp_text`.
4. Annotera `golden` manuellt — gå igenom RFP:n och dokumentera vad modellen *borde* producera:
   - `title`, `client`, `deadline`, `domain` — triviala
   - `summary` — 1-2 meningar, vad uppdraget gör
   - `requirements[]` — varje ska/bör-krav, korrekt kategoriserat med priority
   - `evaluationCriteria[]` — vikter ska summa 100
   - `requiredCompetencies[]` — explicit nämnda kompetenser
   - `estimatedScope` — omfattning (månader + procent + budget om angivet)
   - `redFlags[]` — otydligheter, risker, kravkombinationer
5. Kör `npm run eval:analyzer -- --fixture <id>` och granska rapporten.

Annotationstid: ~30-40 min per fixture. Svårast: `requirements[]` (lätt att missa implicita krav).

## Lägga till en ny matcher-fixture

1. Identifiera en analyzer-fixture att återanvända (samma RFP).
2. Välj 4-6 konsulter från `evals/fixtures/consultants/synthetic-pool.yaml`. Spridning:
   - 1-2 "strong-match" (ska hamna top-K)
   - 1-2 "close-call" (testar matcher:s diskrimination)
   - 1-2 "non-match" (ska aldrig vara top-K)
3. Skapa `evals/fixtures/matcher/<id>.yaml`:
   - `analyzer_fixture`: id på analyzer-fixture
   - `consultant_ids`: listan
   - `golden.expected_top_k`: vilka K ska vara i toppen (ordning spelar ingen roll)
   - `golden.must_have_coverage.required_threshold`: oftast 0.80
4. Kör `npm run eval:matcher -- --fixture <id>`.

Annotationstid: ~15 min per fixture (största arbetet: välja konsultpool med rätt spridning).

## Utöka syntetisk konsultpool

Redigera `evals/fixtures/consultants/synthetic-pool.yaml`. Lägg till 1-2 konsulter per körning tills poolen har 8-10 profiler. Viktigt att:

- `cv_text` varierar i format: strukturerade bullets, narrativ, tabeller
- `match_profile.intent` dokumenterar *vad* konsulten är tänkt att testa
- `parsed_profile` motsvarar exakt vad `consultant-extractor` *borde* ha extraherat från `cv_text`

## Kalibrering av Haiku-judge

Första gången du kör en ny fixture: manuellt verifiera 20-30 haiku-equiv-domar i JSON-rapporten (fältet `judgments[]` per fixture i `evals/runs/<timestamp>.json`). 

- Om >90% av domarna känns rätt → Haiku-judge är pålitlig för det fält-paret.
- Om <90% → ändra prompten i `evals/harness/core/judges.ts` (`haikuEquivJudge`), eller migrera fältet till `sonnetMhcJudge`-mönster.

## Judges

| Judge | Modell | Används för | Ungefärlig kostnad/dom |
|---|---|---|---|
| `exact` | — | enum, ISO-datum, numeriska värden, strikt string-jämförelse | $0 |
| `haiku-equiv` | Haiku 4.5 | fält-ekvivalens (title, summary, requirement-description, kompetensnamn) | ~$0.0001 |
| `sonnet-mhc` | Sonnet 4.6 | must-have coverage per (RFP-krav × konsult-CV) | ~$0.001 |

Totalkostnad per full eval-körning: < $0.20 (negligerbart vid nuvarande pris).

## Metrics

**Analyzer:**
- `requirements.recall/precision/f1` — kan vi fånga alla golden-krav?
- `evaluationCriteria.recall/precision/f1` — och utvärderingskriterier?
- `title`, `client`, `domain` — scalars (0/1)

**Matcher:**
- `mhc.<id>` — hur stor andel av RFP:s ska-krav demonstrerar denna top-K-konsult?
- `mhc.mean` — genomsnittlig MHC över alla top-K
- `mhc.pass` — 1 om *alla* top-K ≥ threshold, annars 0
- `hit_at_k` — binärt: innehåller top-K alla `must_contain` från golden?
- `reasoning.good_ratio` — andel motiveringar som bedömdes "good" av Haiku

**Varför MHC är primär matcher-metric (inte hit@K):** MHC mäter om matcher valde konsulter som faktiskt uppfyller kraven. hit@K mäter bara om matcher höll med golden-annotatorn. Båda i grönt = hög conviction.

## Struktur

```
evals/
├── fixtures/
│   ├── analyzer/        # per-RFP YAML + full golden
│   ├── matcher/         # refererar analyzer-fixture + consultant_ids + MHC-förväntan
│   └── consultants/     # delad pool av syntetiska CV:n
├── harness/
│   ├── core/            # domän-agnostisk: runner, judges, metrics, reporter, loader
│   └── configs/         # modul-specifik: analyzer.ts, matcher.ts
├── scripts/             # CLI-wrappers: run-analyzer.ts, run-matcher.ts
├── runs/                # gitignored — per-körning JSON-dumps
├── thresholds.yaml      # grönt/gult/rött-gränser
└── README.md
```

## Lägga till en ny modul-eval (framtida)

1. Lägg fixtures i `evals/fixtures/<modul>/`
2. Skapa `evals/harness/configs/<modul>.ts` — deklarera fält-till-judge-mapping + metrics-funktioner
3. Skapa `evals/scripts/run-<modul>.ts` — 20-rads wrapper (se `run-analyzer.ts` som mall)
4. Lägg till `"eval:<modul>": "tsx evals/scripts/run-<modul>.ts"` i package.json

Ingen ändring i `core/` krävs.

## Kända MVP-begränsningar

- `_stub`-fixtures är bara för pipeline-verifiering — ge ingen riktig conviction
- End-to-end matcher-mode (`mode: end_to_end`) är inte implementerat ännu
- Full-rank evaluation method är i schemat men inte stödd i runnern
- Ingen CI-integration — eval:s körs manuellt
- Ingen historisk trend-visualisering
````

- [ ] **Step 2: Commit**

```bash
git add evals/README.md
git commit -m "docs(evals): README with fixture-annotation workflow + metric glossary"
```

---

## Self-Review Checklist

After completing all 16 tasks:

**Spec coverage:**
- [ ] `rfp-analyzer` eval covered (Task 11-12)
- [ ] `consultant-matcher` eval covered (Task 13-15)
- [ ] MHC as primary matcher metric (Task 6, 14)
- [ ] Generic `core/` + modul-specific `configs/` (Tasks 2-10 vs 11, 14)
- [ ] YAML fixtures loaded with Zod validation (Task 3)
- [ ] Three judges: exact, haiku-equiv, sonnet-mhc (Tasks 4-6)
- [ ] Console + JSON reporter (Task 10)
- [ ] Threshold-based PASS/WARN/FAIL (Tasks 8, 10)
- [ ] CLI: `npm run eval:analyzer`, `npm run eval:matcher`, `--fixture` flag (Tasks 12, 15)
- [ ] `evals/runs/` gitignored (Task 1)
- [ ] README with annotation workflow (Task 16)

**Out of scope (confirmed not in plan):**
- [ ] `consultant-extractor` evals — correctly omitted
- [ ] `opportunity-scorer` evals — correctly omitted
- [ ] End-to-end matcher mode runner — correctly omitted (schema supports it, runner doesn't)
- [ ] Full-rank evaluation — correctly omitted
- [ ] CI integration — correctly omitted
- [ ] Historical trend analysis — correctly omitted

**Placeholder scan:**
- [ ] Every code step has complete, runnable code
- [ ] No "TBD" / "TODO" / "fill in later"
- [ ] Exact commands with expected output in every test-run step
- [ ] Exact file paths (absolute to repo root) everywhere

**Type consistency:**
- [ ] `FieldJudgment` shape used consistently across judges, metrics, runner, reporter
- [ ] `EvalConfig<F, O>` generic used consistently across runner + both configs
- [ ] `AnalyzerFixture`, `MatcherFixture`, `SyntheticConsultant` types flow through correctly
- [ ] Judge function signatures: `exactJudge` / `haikuEquivJudge` take `JudgeInput`, `sonnetMhcJudge` takes `MhcJudgeInput`

**Known tension — call out at execution time:**
- Task 11's analyzer config imports `analyzeRfp` from `@/lib/rfp-analyzer` (verified to exist). `RfpAnalysis` type imported from `@/lib/types`.
- Task 14's adapter builds full `Consultant` shape from `@/lib/types` (verified — needs `organizationId`, `rawCvText`, `createdAt`, `updatedAt`). `sector` is hardcoded to `"public"` for all references in the synthetic pool. If future fixtures need private-sector references, extend `ParsedProfileSchema` in Task 3 to add a `sector` field per project, then read it here.
- Task 14's `RfpAnalysis` cast from `context.analyzerFixture.golden`: the golden shape matches `RfpAnalysis` exactly (both derived from the same schema), so this is type-safe. Verify by running `npx tsc --noEmit` after Task 14.

---

## Out-of-Plan Roadmap (future iterations — not tasks here)

After MVP ships:

1. Annotation: Stefan writes 5 real analyzer fixtures (TED RFPs) + 5 matcher fixtures, extending consultant pool to 8-10 profiles.
2. Haiku-judge calibration: Stefan manually reviews 20-30 Haiku judgments from first real run. Update prompts if <90% agreement.
3. End-to-end matcher-mode runner (consuming `mode: end_to_end` fixtures).
4. Full-rank evaluation method.
5. CI integration (GitHub Action).
6. Historical trend diffing between `evals/runs/*.json`.
7. `consultant-extractor` and `opportunity-scorer` eval configs.
