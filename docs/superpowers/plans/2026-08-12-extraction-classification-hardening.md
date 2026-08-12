# Extraction Classification Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anchor the ska-/bör-krav classification in the RFP's own explicit markers (when in doubt → bör, never ska) and deterministically dedupe near-exact duplicate requirements — so re-analysis of the same RFP cannot flip a go/no-go from ~48% to a mechanical 0% on a wobbling classification, and duplicate rows stop reaching the UI.

**Architecture:** Two surgical changes in the extraction path (`src/lib/rfp-analyzer.ts`): (1) a classification-anchoring rule added to the prompt's priority section, (2) a new pure util `dedupeRequirements` (built on the existing `trigramSimilarity`) hooked in AFTER schema parse and BEFORE `runEvidenceGuard` (the guard's `evidences[i]` write-back at rfp-analyzer.ts:125-127 is index-aligned — dedupe after it would desync). No DB migration (analysis is an immutable jsonb blob; hardening is forward-only). Gates: unit suite + the paid extraction gates run by the controller (`eval:analyzer` before/after + `eval:zero-halluc --target=rfp` must be green).

**Background (Stefan 2026-08-12):** upphandlingar are, as a rule, explicit about ska vs bör — often a literal matrix. The classification must be read off the document, not judged. Live repro: the same RFP re-analyzed classified "facklig samverkan" as bör in one run and ska in the next → mechanical 0% (unmet-ska gate) + a verbatim duplicate requirement in the list. ROADMAP.md logs this as finding (7).

## Global Constraints

- Code/comments/commits in English; any user-facing copy Swedish (none expected in this PR).
- Surgical: touch ONLY the files each task lists. Do NOT touch `temperature: 0`, its comment, or its test (known-stale, tracked elsewhere). Do NOT fix the `nice-to-have` label fallback in analysis-result.tsx (logged separately).
- No new dependencies. No DB migration.
- Prompt edits go in `src/lib/rfp-analyzer.ts` only; prompt-content tests mirror the existing style in `src/lib/__tests__/rfp-analyzer.test.ts` (assert the built prompt contains the instruction strings).
- The dedupe util lives beside `requirement-kind.ts` convention: small pure module + own `__tests__` file.
- Worktree: `C:\Users\stefa\projects\bidsmith-harden`, branch `feat/extraction-hardening`. Push to remote **`bidsmith`**, never origin. Explicit-path staging only.

---

### Task 1: `dedupeRequirements` util + hook in the analyzer

**Files:**
- Create: `src/lib/requirement-dedupe.ts`
- Test: `src/lib/__tests__/requirement-dedupe.test.ts`
- Modify: `src/lib/rfp-analyzer.ts` (insert hook between schema parse and `runEvidenceGuard`, ~line 107)
- Modify: `src/lib/__tests__/rfp-analyzer.test.ts` (one new case: duplicated requirements in the mocked AI response come back deduped)

**Interfaces:**
- Consumes: `trigramSimilarity(a, b)` from `@/lib/text-similarity` (character-trigram Jaccard, 0..1).
- Produces: `dedupeRequirements<T extends { description: string; priority: string; kind?: string }>(requirements: T[]): T[]` — keep-first, order-preserving.

- [ ] **Step 1: Write the failing tests** — `src/lib/__tests__/requirement-dedupe.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { dedupeRequirements } from "../requirement-dedupe";

const req = (description: string, priority = "must", kind = "qualification") => ({
  category: "Kompetens",
  description,
  priority,
  kind,
  evidence: "citat",
});

describe("dedupeRequirements", () => {
  it("keeps a list without duplicates untouched", () => {
    const list = [req("Erfarenhet av kollektivavtal"), req("Senior uppdragsansvarig")];
    expect(dedupeRequirements(list)).toEqual(list);
  });

  it("drops an identical duplicate, keeping the first occurrence", () => {
    const a = req("Anbudet ska innehålla CV och prisbilaga");
    const b = req("Anbudet ska innehålla CV och prisbilaga");
    expect(dedupeRequirements([a, b])).toEqual([a]);
  });

  it("collapses near-identical wording (whitespace/case) via normalization", () => {
    const a = req("Erfarenhet av facklig samverkan");
    const b = req("  erfarenhet av  Facklig samverkan ");
    expect(dedupeRequirements([a, b])).toEqual([a]);
  });

  it("collapses high-similarity rephrasings at the trigram threshold", () => {
    const a = req("Anbudet ska innehålla beskrivning av leverantör, föreslagna konsulter med CV, metodbeskrivning, referens samt prisbilaga");
    const b = req("Anbudet ska innehålla beskrivning av leverantören, föreslagna konsulter med CV, metodbeskrivning, referens och prisbilaga");
    expect(dedupeRequirements([a, b])).toHaveLength(1);
  });

  it("keeps near-dupes whose priority differs (never guesses the classification)", () => {
    const a = req("Erfarenhet av facklig samverkan", "must");
    const b = req("Erfarenhet av facklig samverkan", "should");
    expect(dedupeRequirements([a, b])).toHaveLength(2);
  });

  it("keeps near-dupes whose kind differs", () => {
    const a = req("Slutrapport med rekommendationer", "must", "qualification");
    const b = req("Slutrapport med rekommendationer", "must", "deliverable");
    expect(dedupeRequirements([a, b])).toHaveLength(2);
  });

  it("preserves order and dedupes across non-adjacent positions", () => {
    const a = req("Krav A");
    const b = req("Krav B");
    const a2 = req("Krav A");
    expect(dedupeRequirements([a, b, a2])).toEqual([a, b]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/lib/__tests__/requirement-dedupe.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** `src/lib/requirement-dedupe.ts`:

```ts
import { trigramSimilarity } from "@/lib/text-similarity";

const DUPLICATE_THRESHOLD = 0.9;

function normalized(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Deterministic near-exact dedupe of extracted requirements, keep-first.
 * Two rows are duplicates only when priority AND kind match and the
 * descriptions are identical after normalization or trigram-similar >= 0.9 —
 * near-dupes that disagree on classification are deliberately kept, because
 * collapsing them would silently guess which classification is right.
 * Runs BEFORE the evidence guard: the guard's write-back is index-aligned,
 * so the array must have its final shape before verification starts.
 */
export function dedupeRequirements<
  T extends { description: string; priority: string; kind?: string },
>(requirements: T[]): T[] {
  const kept: T[] = [];
  for (const candidate of requirements) {
    const isDupe = kept.some((existing) => {
      if (existing.priority !== candidate.priority) return false;
      if ((existing.kind ?? "qualification") !== (candidate.kind ?? "qualification")) return false;
      const a = normalized(existing.description);
      const b = normalized(candidate.description);
      return a === b || trigramSimilarity(a, b) >= DUPLICATE_THRESHOLD;
    });
    if (!isDupe) kept.push(candidate);
  }
  return kept;
}
```

- [ ] **Step 4: Run to verify pass** — all 7 PASS.

- [ ] **Step 5: Hook into the analyzer.** In `src/lib/rfp-analyzer.ts`, directly after the `callClaude` result is available and BEFORE the `runEvidenceGuard` block (~line 107; read the file first):

```ts
  const beforeDedupe = analysis.requirements.length;
  analysis.requirements = dedupeRequirements(analysis.requirements);
  if (analysis.requirements.length < beforeDedupe) {
    console.warn(
      `[rfp-analyzer] dropped ${beforeDedupe - analysis.requirements.length} duplicate requirement(s), kept first occurrences`,
    );
  }
```

(plus the import). Then add ONE test case to `src/lib/__tests__/rfp-analyzer.test.ts` (mirror the existing mock conventions — note the file's own comment: the guard mutates evidence in place, so build FRESH requirement objects per test): mocked AI response containing the same requirement twice → resolved analysis has it once, and the evidence guard receives the deduped list (assert on the guard mock's items length if the file's mocking makes that natural, otherwise assert on the returned analysis only).

- [ ] **Step 6: Full-suite check** — `npx vitest run` green, `npx tsc --noEmit` clean.

- [ ] **Step 7: Commit** (explicit paths: the four files) — `feat: deterministic dedupe of extracted requirements before the evidence guard`

---

### Task 2: Anchor the ska/bör classification in the document's own markers

**Files:**
- Modify: `src/lib/rfp-analyzer.ts` (the priority instruction block, currently ~lines 46-49)
- Modify: `src/lib/__tests__/rfp-analyzer.test.ts` (prompt-content assertions)

**Interfaces:** none new — prompt text only.

- [ ] **Step 1: Write the failing prompt-content test** (mirror the existing "instruerar modellen att bära ordagrant källcitat" test style — capture the prompt sent to the mocked ai-client and assert substrings):

```ts
it("anchors the ska/bör classification in the document's explicit markers", async () => {
  // reuse the file's existing mock-capture pattern for the prompt
  expect(capturedPrompt).toContain("uttryckligen");
  expect(capturedPrompt).toContain('ALDRIG "must"');
  expect(capturedPrompt).toContain("kravmatris");
});
```

(Write it as a real test using the file's existing helpers — read the file first; the strings asserted must match Step 2's inserted text exactly.)

- [ ] **Step 2: Extend the priority block in the prompt.** Directly after the existing mapping lines (`- priority MÅSTE vara exakt ett av strängvärdena ... Använd aldrig svenska värden eller andra varianter i fältet.`), insert:

```
- KLASSNINGEN MÅSTE FÖRANKRAS I UNDERLAGETS EGEN MARKERING. Upphandlingar anger i
  regel uttryckligen vad som är ska-krav respektive bör-krav — ofta i en kravmatris
  eller med orden "ska"/"skall"/"obligatoriskt" i kravmeningen eller dess rubrik.
  Sätt "must" ENDAST när en sådan uttrycklig markering finns i underlaget för just
  det kravet. Saknas uttrycklig markering, eller är den tvetydig, klassa som
  "should" — ALDRIG "must" på egen bedömning av hur viktigt kravet verkar vara.
  När markören står i löptexten: låt evidence-citatet omfatta den.
```

- [ ] **Step 3: Run the analyzer test file** — all green (old prompt tests must still pass: the mapping lines are extended, not replaced).

- [ ] **Step 4: Full gates** — `npx vitest run` green, `npx tsc --noEmit` clean, `npx eslint .` 0 errors.

- [ ] **Step 5: Commit** — `feat: anchor ska/bör classification in the RFP's explicit markers, doubt -> should`

---

### Task 3: Roadmap + paid extraction gates + PR (controller-run)

**Files:**
- Modify: `notes/ROADMAP.md`

- [ ] **Step 1 (controller):** Baseline `npm run eval:analyzer` BEFORE merging the branch changes is impractical (worktree already carries them) — instead run it on the branch and compare against the stored thresholds (`evals/thresholds.yaml`: requirements.f1 green ≥ 0.85) and the most recent results file in `evals/results/`. Then run `npm run eval:zero-halluc` (default `--target=rfp`) — MUST exit 0 (0 unverifiable quotes). Budget guard is built in (`BIDSMITH_LOOP_BUDGET_USD` default 20).
- [ ] **Step 2:** ROADMAP.md: new header paragraph (this PR: klassningsförankring + dedupe, born from finding 7), demote previous header to Historik; strike/annotate finding (7) in the backlog bullet; log the `nice-to-have`-label fallback bug (analysis-result.tsx PRIORITY_LABELS key `nice` vs stored `nice-to-have` → raw string renders) as a new polish bullet.
- [ ] **Step 3:** Full gates once more if anything changed; `npx next build` (CLAUDE.md rule; prompt/lib-only changes still get one build before PR).
- [ ] **Step 4:** Push to `bidsmith`, open NON-DRAFT PR (routine fires on open), wait for routine review (~5-7 min), address findings, squash-merge (Stefan's standing order tonight: merge when routine-checked and green).

## Self-review notes

- Spec coverage: anchoring (T2), doubt→should (T2 text), dedupe (T1), gates (T3), roadmap (T3). Differing-priority dupes deliberately kept — matches "never guess" and keeps the eval comparable.
- Types: `dedupeRequirements` is generic over the minimal structural type — works on the schema-parsed shape in rfp-analyzer without importing analyzer types.
- The prompt strings asserted in T2 Step 1 match T2 Step 2's text verbatim (`uttryckligen`, `ALDRIG "must"`, `kravmatris`).
