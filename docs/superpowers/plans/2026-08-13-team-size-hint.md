# Team Size Hint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The default team size follows the RFP instead of always being top-3: extraction captures an explicit, evidence-backed consultant-count hint from the document (`teamSizeHint`), and both default-team sites size from it (fallback: 3, exactly today's behavior).

**Architecture:** One new required-nullable field on `RfpAnalysisSchema` (BUG-A lesson: required in the AI schema, optional in read-side types for legacy analyses), anchored the same way as #111's classification rule — extracted ONLY when the document explicitly states a count, with a verbatim quote, mechanically verified post-parse via the existing pure `verifyEvidence` (unverifiable ⇒ hint dropped to null, fail closed to status quo). A tiny pure helper `defaultTeamSize(analysis)` is the single consumer-side rule (clamp to 1..MAX_TEAM_SIZE, use the hint's max — Stefan's domain note: praxis bemannar mot övre gränsen för att täcka ledigheter), wired into the two existing default sites.

**Product decisions (Stefan 2026-08-13):** första bedömningen byggs; storleks-FÖRSLAG (remove-typ) skippas — bolaget bedömer själva. Stefans marknadsbild (designinput, bokförs i ROADMAP): 1–2 vanligt på små uppdrag, 3 standard, 4 för ledighetstäckning, 5 oerhört ovanligt. "Ideal 3–5"-raden i team-bundlens prompt är writing-roll (eval-grindad) — RÖRS INTE i denna PR, bokförs som separat beslut.

## Global Constraints

- Code/comments/commits English; all UI copy Swedish.
- Surgical; no new dependencies; NO DB migration (analysis jsonb is forward-only — legacy analyses lack the field; every consumer must tolerate `undefined`).
- `teamSizeHint` REQUIRED-nullable in the AI schema (`.nullable()`, never `.optional()`/`.default()` — structured outputs omit optional fields, BUG-A at ai-schemas.ts ~55-60). Read-side TS type optional (`teamSizeHint?: ... | null`).
- The hint is anchored: extracted ONLY on explicit document statements, with verbatim evidence, mechanically verified. Never inferred from scope/budget — that would reintroduce the model-judgment wobble #111 removed.
- Existing behavior unchanged when hint is null/absent: default stays top-3.
- Worktree: `C:\Users\stefa\projects\bidsmith-teamsize`, branch `feat/team-size-hint`. Push to remote **`bidsmith`**. Explicit-path staging; quote `[id]` paths.

---

### Task 1: Schema, prompt, post-parse verification

**Files:**
- Modify: `src/lib/ai-schemas.ts` (field on `RfpAnalysisSchema`)
- Modify: `src/lib/types.ts` (`RfpAnalysis.teamSizeHint?`)
- Modify: `src/lib/rfp-analyzer.ts` (schema sketch line + instruction block + post-parse verification)
- Test: `src/lib/__tests__/ai-schemas.test.ts`, `src/lib/__tests__/rfp-analyzer.test.ts`

**Interfaces:**
- Produces (Task 2 consumes): `RfpAnalysis.teamSizeHint?: { min: number; max: number; evidence?: string } | null`. AI schema:

```ts
  // REQUIRED-nullable (BUG-A: optional fields get omitted by structured outputs).
  // Extracted ONLY when the document explicitly states a consultant count;
  // the evidence quote is mechanically verified post-parse — a miss drops the
  // whole hint to null (fail closed to the top-3 default).
  teamSizeHint: z
    .object({
      min: z.number().int().min(1),
      max: z.number().int().min(1),
      evidence: z.string().min(1),
    })
    .nullable(),
```

- [ ] **Step 1: Failing schema tests** (`ai-schemas.test.ts`, mirror the file's RfpAnalysis fixtures — they will need the new key added to stay green, behavior-preserving): parse fails when `teamSizeHint` key is missing; `teamSizeHint: null` parses; a valid object parses; `min: 0` rejects.

- [ ] **Step 2: Failing analyzer tests** (`rfp-analyzer.test.ts`, mirror mock/prompt-capture conventions):

```ts
it("instructs the model to extract teamSizeHint only from explicit statements", async () => {
  // prompt contains: "teamSizeHint", "uttryckligen", "ALDRIG utifrån omfattning"
});

it("drops a teamSizeHint whose evidence does not verify against the source", async () => {
  // mocked response: teamSizeHint { min: 1, max: 2, evidence: "text som inte finns i underlaget" }
  // → returned analysis.teamSizeHint === null
});

it("keeps a teamSizeHint whose evidence verifies verbatim", async () => {
  // rfpText contains "Uppdraget bedöms kräva 1–2 konsulter." and evidence quotes it exactly
  // → hint kept with min 1, max 2
});

it("normalizes an inverted range (min > max) by swapping", async () => { ... });
```

- [ ] **Step 3: Run → fail.**

- [ ] **Step 4: Implement.**
1. Schema field + `RfpAnalysis.teamSizeHint?: { min: number; max: number; evidence?: string } | null;` in types.ts (evidence optional in read type — symmetry with requirements: the guard-style strip would set it undefined; here a failed verify nulls the whole hint instead).
2. Prompt: schema sketch gains `"teamSizeHint": { "min": 1, "max": 2, "evidence": "Ordagrant citat" } | null` and an instruction block after the priority rules:

```
- teamSizeHint: SÄTT ENDAST när underlaget UTTRYCKLIGEN anger antal konsulter
  (t.ex. "1–2 konsulter", "en (1) konsult", "ett team om tre konsulter").
  evidence = ordagrant citat som bär angivelsen. Härled ALDRIG utifrån omfattning,
  budget eller timmar — saknas uttrycklig angivelse: sätt EXAKT null.
```

3. Post-parse (in `analyzeRfp`, after dedupe, before/independent of the evidence guard): if `analysis.teamSizeHint` is non-null, swap inverted min/max, then verify the evidence with the existing pure `verifyEvidence` (single-item call — read `src/lib/verify-evidence.ts` for the exact signature and result shape); on miss set `analysis.teamSizeHint = null` and `console.warn` with the label, mirroring the dedupe warn.

- [ ] **Step 5: Run targeted tests → green; full `npx vitest run`, `npx tsc --noEmit`.**

- [ ] **Step 6: Commit** — `feat: evidence-anchored teamSizeHint in RFP extraction (explicit statements only)`

---

### Task 2: `defaultTeamSize` helper + the two default sites + UI transparency line

**Files:**
- Create: `src/lib/default-team-size.ts`
- Test: `src/lib/__tests__/default-team-size.test.ts`
- Modify: `src/app/api/go-no-go/route.ts` (the `slice(0, 3)` fallback, ~line 48)
- Modify: `src/components/analysis-match-section.tsx` (`buildDefaultTeamIds`, ~lines 32-36, + one transparency line; check how the component receives the analysis — if it doesn't, thread `teamSizeHint` from the page that renders it, smallest possible prop)

**Interfaces:**
- Produces: `defaultTeamSize(analysis: Pick<RfpAnalysis, "teamSizeHint">): number` — `hint ? clamp(hint.max, 1, MAX_TEAM_SIZE) : 3`. (`max` over `min` per Stefan: praxis bemannar övre gränsen för ledighetstäckning.)

- [ ] **Step 1: Failing helper tests:** null/undefined hint → 3; `{min:1,max:2}` → 2; `{min:1,max:1}` → 1; `{min:4,max:9}` → 5 (clamped to MAX_TEAM_SIZE); legacy analysis without the key → 3.

- [ ] **Step 2: Implement helper** (import MAX_TEAM_SIZE from `@/lib/constants`; 3 stays a named constant `DEFAULT_TEAM_SIZE` with a comment: standard assignment size per Stefan's market picture 2026-08-13).

- [ ] **Step 3: Wire the two sites.** go-no-go route: `slice(0, defaultTeamSize(rfpAnalysis))`. Match section: `buildDefaultTeamIds` picks top-N with `N = defaultTeamSize(...)`; where the hint is present render one muted Swedish line near the team selector: `Underlaget anger {min}–{max} konsulter — {N} förvalda.` (collapse to a single number when min === max; no chip/source-viewer in v1). Read both files fully first; thread the smallest prop needed.

- [ ] **Step 4: Gates** — full suite, tsc, eslint 0 errors.

- [ ] **Step 5: Commit** — `feat: default team size follows the RFP's explicit hint, top-3 otherwise`

---

### Task 3: Live smoke + roadmap + build + PR (controller-run)

- [ ] Live extraction smoke (~$0.3): run `analyzeRfp` headless on (a) a text WITH an explicit count → hint extracted with verified quote; (b) one of yesterday's real RFP texts (no explicit count expected) → null. Stickprov the quotes.
- [ ] ROADMAP.md: header entry (första bedömningen levererad, förslags-dynamik skippad per Stefans beslut, marknadsbilden bokförd som designinput, "Ideal 3–5"-raden bokförd som separat writing-roll-beslut).
- [ ] `npx next build` (route + component changes). Push, NON-DRAFT PR, routine, fix findings. Merge on Stefan's go (he is awake — not the overnight mandate).

## Self-review notes

- Anchoring symmetry with #111: explicit-marker-only, verbatim quote, mechanical verification, fail closed.
- Legacy safety: read-type optional; helper handles absent key; UI line renders only on present hint.
- Both default sites share one helper — no drift; behavior identical to today when no hint exists.
