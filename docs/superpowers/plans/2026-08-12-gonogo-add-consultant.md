# Go/No-Go Add-Consultant Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Go/no-go improvement suggestions of type ADD — "lägg till en fjärde konsult" to cover an uncovered requirement — alongside the existing SWAP type, plus a structured "poolen räcker inte" signal when no pool candidate covers a gap at all.

**Architecture:** A required `kind: "swap" | "add"` discriminator on improvements (required enum in the AI schema per the BUG-A lesson — optional fields get omitted by structured outputs; optional only in the read-side TS type for legacy rows) with the existing flat nullable-leaves shape (no discriminatedUnion — unproven against the structured-output converter). Add suggestions carry `swap: { remove: null, add }` / `swapIds: { removeId: null, addId }`. A required-nullable `poolGap: string | null` on the response captures "no candidate covers the gap". All four gates that currently kill add-shaped suggestions move together: prompt, evaluator filter, card render, apply route.

**Product decisions (Stefan 2026-08-12):** additions primarily to cover uncovered ska-krav — bör-krav luckor may also be suggested; "poolen räcker inte" gets a structured, honest surface; team cap is MAX_TEAM_SIZE (5).

## Global Constraints

- All UI copy Swedish; code/comments/commits English.
- Surgical; no new dependencies; **no DB migration** (result jsonb is never re-validated on read — new fields must be optional in read-side types, required in the AI schema).
- `estimatedImpact` is a STRING parsed by the private `parseImpactPct` (go-no-go-evaluator.ts:199-204; NaN > 0 === false — word-only impacts drop).
- The route test convention mocks `@/lib/org` `getUserId` (NOT `requireUser`/api-helpers) — follow `src/app/api/analyses/[id]/apply-swap/__tests__/route.test.ts`.
- Grind-policy: gonogo-prompt changes = live smoke + stickprov (controller runs in Task 4), NO eval run.
- Worktree: `C:\Users\stefa\projects\bidsmith-teamadd`, branch `feat/gonogo-add-consultant`. Push to remote **`bidsmith`**. Explicit-path staging; quote paths containing `[id]`.
- MERGE ORDER NOTE (controller): PR A (extraction hardening) merges first; this branch rebases/merges main over the ROADMAP.md conflict before its own merge.

---

### Task 1: Schema + types + evaluator (prompt, filter, poolGap)

**Files:**
- Modify: `src/lib/ai-schemas.ts` (improvements entry + `poolGap` on `GoNoGoResultSchema`)
- Modify: `src/lib/types.ts` (`ImprovementSuggestion.kind?`, `GoNoGoResult.poolGap?`)
- Modify: `src/lib/go-no-go-evaluator.ts` (SYSTEM_PROMPT, team-size injection, filter)
- Test: `src/lib/__tests__/go-no-go-evaluator.test.ts` (extend the post-processing describe), `src/lib/__tests__/ai-schemas.test.ts` (GoNoGo describe: kind required, poolGap required-nullable)

**Interfaces:**
- Produces (Tasks 2-3 rely on these): improvements entries carry `kind: "swap" | "add"` (AI schema: `z.enum(["swap","add"])`, REQUIRED; TS type: `kind?: "swap" | "add"` — legacy rows lack it and are always swap-shaped). `GoNoGoResult.poolGap?: string | null`. Filter contract: swap kept iff `remove != null && add != null && impact > 0`; add kept iff `kind === "add" && swap?.add != null && swapIds?.addId != null && swap?.remove == null && impact > 0 && teamConsultants.length < MAX_TEAM_SIZE`.

- [ ] **Step 1: Failing tests.** In `src/lib/__tests__/go-no-go-evaluator.test.ts`, extend the post-processing describe (read the file's mock conventions first — it mocks `@anthropic-ai/sdk` via `vi.hoisted` + `messages.stream`; improvements fixture test at ~:155 asserts `toHaveLength(1)` on a 3-entry payload — that fixture gains `kind: "swap"` on its entries):

```ts
it("keeps a valid add suggestion when the team has a free slot", async () => {
  // payload improvement: { kind: "add", swap: { remove: null, add: "Aram" },
  //   swapIds: { removeId: null, addId: "id-aram" }, estimatedImpact: "+12%", reason: "..." }
  // team fixture: 3 consultants (< MAX_TEAM_SIZE)
  // expect it to survive the filter
});

it("drops an add suggestion when the team is at MAX_TEAM_SIZE", async () => {
  // team fixture: 5 consultants → expect improvements toHaveLength(0)
});

it("drops an add suggestion with non-positive or unparseable impact", async () => {
  // "+0%" and "täcker ska-krav 2" → both dropped
});

it("drops a kind:add entry that still carries a remove (malformed)", async () => {
  // kind "add" with swap.remove != null → dropped
});

it("passes poolGap through and tolerates null", async () => {
  // payload poolGap: "Gapet kräver GIS-kompetens som saknas i poolen" → present on result
  // payload poolGap: null → result.poolGap null
});
```

Write these as real tests with the file's fixtures. In `src/lib/__tests__/ai-schemas.test.ts`, add to the GoNoGo describe: parsing fails without `kind` on an improvements entry; parsing fails without `poolGap` key; `poolGap: null` parses.

- [ ] **Step 2: Run to verify failures** (missing schema fields).

- [ ] **Step 3: Schema + types.** `src/lib/ai-schemas.ts` improvements entry gains `kind: z.enum(["swap", "add"])` (REQUIRED — comment why: structured outputs omit optional fields, BUG-A). `GoNoGoResultSchema` gains `poolGap: z.string().nullable()` (REQUIRED-nullable, same reason). `src/lib/types.ts`: `ImprovementSuggestion` gains `kind?: "swap" | "add";` and `GoNoGoResult` gains `poolGap?: string | null;` — optional with a comment: legacy persisted rows lack them; absent kind ⇒ swap-shaped by construction (the old filter guaranteed non-null remove+add).

- [ ] **Step 4: Evaluator.** In `src/lib/go-no-go-evaluator.ts`:

1. SYSTEM_PROMPT task 6 (currently "Generera förbättringsförslag genom att jämföra teamets luckor mot tillgängliga konsulter i poolen. Föreslå konkreta byten med uppskattad påverkan.") becomes:

```
6. Generera förbättringsförslag genom att jämföra teamets luckor mot tillgängliga konsulter i poolen. Två typer: BYTE (kind "swap") och TILLÄGG (kind "add" — lägg till en konsult utan att ta bort någon, bara när teamet har lediga platser enligt raden "Teamstorlek" nedan). Föreslå tillägg i första hand när ett ska-krav står otäckt och en poolkonsult täcker det; tillägg för bör-krav-luckor är också tillåtna. Föreslå konkreta förslag med uppskattad påverkan.
```

2. The JSON example gains `"kind": "swap"` on the existing entry plus a second example entry:

```
    {
      "kind": "add",
      "swap": { "remove": null, "add": "Konsult C" },
      "swapIds": { "removeId": null, "addId": "uuid-c" },
      "estimatedImpact": "+12%",
      "reason": "Konsult C täcker ska-krav Z som ingen i teamet täcker; teamet har en ledig plats"
    }
```

and, after the improvements example, `"poolGap": null,` with the rule below.

3. Rules block additions (after the existing improvements rules):

```
- kind: "swap" kräver både remove och add (removeId och addId). kind: "add" kräver add/addId och remove/removeId ska vara null. Föreslå ALDRIG "add" när teamet är fullt.
- poolGap: om ett ouppfyllt krav inte kan täckas av NÅGON konsult i poolen — varken via byte eller tillägg — beskriv gapet kort och konkret (t.ex. "Gapet kräver dokumenterad GIS-kompetens som ingen i poolen har"). Annars EXAKT null. Aldrig tom sträng.
```

4. Team-size injection: where the user content is built, add a line near the team section: `Teamstorlek: ${teamConsultants.length} av ${MAX_TEAM_SIZE} platser fyllda.` (import MAX_TEAM_SIZE from `@/lib/constants`).

5. Filter (go-no-go-evaluator.ts:185-194) becomes per-kind (update the comment accordingly):

```ts
  result.improvements = result.improvements.filter((imp) => {
    if (!(parseImpactPct(imp.estimatedImpact) > 0)) return false;
    if (imp.kind === "add") {
      return (
        imp.swap?.add != null &&
        imp.swapIds?.addId != null &&
        imp.swap?.remove == null &&
        teamConsultants.length < MAX_TEAM_SIZE
      );
    }
    return imp.swap?.remove != null && imp.swap?.add != null;
  });
```

- [ ] **Step 5: Run** evaluator + ai-schemas test files → green; full `npx vitest run`, `npx tsc --noEmit`.

- [ ] **Step 6: Commit** — `feat: add-type improvement suggestions + poolGap signal in go/no-go evaluator`

---

### Task 2: Apply route add-path + schema riders

**Files:**
- Modify: `src/lib/api-schemas.ts` (`ApplySwapSchema.removeId` → optional-nullable; `GoNoGoCreateSchema` `.max(200)` → `.max(MAX_TEAM_SIZE)` rider)
- Modify: `src/app/api/analyses/[id]/apply-swap/route.ts`
- Test: `src/app/api/analyses/[id]/apply-swap/__tests__/route.test.ts`, `src/lib/__tests__/api-schemas.test.ts`

**Interfaces:**
- Produces (Task 3 relies on this): POST `/api/analyses/[id]/apply-swap` body `{ assessmentId, removeId?, addId }` — removeId absent or null ⇒ ADD: validates addId ∉ team (409), team not full (409 "Teamet är fullt — max 5 konsulter."), pool membership (422), `newTeamIds = [...teamIds, addId]`. removeId present ⇒ existing swap semantics unchanged.

- [ ] **Step 1: Failing tests.** Route tests (follow the file's fixtures/mocks; `validBody()` keeps working for swap):

```ts
it("applies an ADD: appends the consultant, keeps everyone, inserts new assessment", async () => {
  // body { assessmentId, addId: ADD_ID } (no removeId)
  // expect fetchCalls[0] to equal [KEEP_ID, REMOVE_ID, ADD_ID] (append, order preserved)
  // expect inserted team_consultant_ids likewise; expect 200
});

it("409s an ADD when the team is already at MAX_TEAM_SIZE", async () => {
  // assessment fixture with 5 team ids → 409, no eval call
});

it("409s an ADD whose consultant is already in the team", async () => { ... });

it("still 400s when addId is missing entirely", async () => { ... });

it("accepts removeId: null as ADD (client sends explicit null)", async () => { ... });
```

api-schemas tests: `ApplySwapSchema` parses `{assessmentId, addId}` and `{assessmentId, removeId: null, addId}`; still parses full swap; rejects missing addId. `GoNoGoCreateSchema` rejects 6 team ids (rider).

- [ ] **Step 2: Run to verify failures.**

- [ ] **Step 3: Implement.** `ApplySwapSchema.removeId: z.guid().nullable().optional()` (comment: absent or null ⇒ add). `GoNoGoCreateSchema`: `.max(200)` → `.max(MAX_TEAM_SIZE)` with comment (first server-side team-growing feature closes the late-failure gap; UI already caps at 5). Route: import MAX_TEAM_SIZE; branch on `removeId == null`:

```ts
    const teamIds = (latest.team_consultant_ids as string[]) ?? [];
    const isAdd = removeId == null;
    if (isAdd) {
      if (teamIds.includes(addId)) {
        return NextResponse.json(
          { error: "Konsulten är redan i teamet — ladda om sidan." },
          { status: 409 },
        );
      }
      if (teamIds.length >= MAX_TEAM_SIZE) {
        return NextResponse.json(
          { error: `Teamet är fullt — max ${MAX_TEAM_SIZE} konsulter.` },
          { status: 409 },
        );
      }
    } else if (!teamIds.includes(removeId) || teamIds.includes(addId)) {
      return NextResponse.json(
        { error: "Förslaget matchar inte det låsta teamet — ladda om sidan." },
        { status: 409 },
      );
    }
```

and later `const newTeamIds = isAdd ? [...teamIds, addId] : teamIds.map((id) => (id === removeId ? addId : id));`. Everything else (CAS, bid guards ×2, pool check, eval-before-delete, insert) unchanged.

- [ ] **Step 4: Run** route + api-schemas tests → green; full suite + tsc.

- [ ] **Step 5: Commit** — `feat: apply-swap route accepts add-only suggestions with team-size guard`

---

### Task 3: UI — add-variant of the card, handler, comparison, poolGap note

**Files:**
- Modify: `src/components/go-no-go-result.tsx`
- Modify: `src/components/go-no-go-section.tsx`

**Interfaces:** consumes Task 1's `kind?`/`poolGap?` and Task 2's request contract. No component tests (repo convention) — gates are tsc/eslint/suite + controller's live smoke.

- [ ] **Step 1: `go-no-go-result.tsx`.** Read fully first. In the card loop:

1. Kind detection + render gate (replaces `if (!imp.swap?.remove || !imp.swap?.add) return null;`):

```tsx
              const isAdd = imp.swap?.add != null && imp.swap?.remove == null;
              if (!imp.swap?.add || (!isAdd && !imp.swap?.remove)) return null;
```

2. Title: `{isAdd ? <>Lägg till {imp.swap.add}</> : <>Byt {imp.swap.remove} → {imp.swap.add}</>}` keeping the impact span unchanged.
3. Button gate becomes `onApplySwap && imp.swapIds?.addId && (isAdd || imp.swapIds?.removeId)`; label `{isAdd ? "Testa tillägget" : "Testa bytet"}`. Undo suppression (`isUndo`) applies to swap cards only (`!isAdd && ...` — an add has removeId null and can never match the signature anyway; keep the existing expression, no change needed, but verify).
4. poolGap note — after the improvements block (or standalone when improvements are empty), render when `result.poolGap` is a non-empty string:

```tsx
      {result.poolGap && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-900">
          <span className="font-medium">Poolen räcker inte:</span> {result.poolGap}
        </div>
      )}
```

placed inside the improvements section container (so it shows under the "Förbättringsförslag" heading when both exist) and ALSO shown when `result.improvements.length === 0` — restructure the section condition to `(result.improvements.length > 0 || result.poolGap) && (...)`.

- [ ] **Step 2: `go-no-go-section.tsx`.** In `applySwap`:

1. Guard: `if (!ids?.addId) return;` and `const isAdd = ids.removeId == null;` (swap still requires removeId: `if (!isAdd && !ids.removeId) return;` — keep simple: `if (!ids?.addId || (imp.swap?.remove != null && !ids.removeId)) return;` — implementer picks the cleanest equivalent, behavior: add proceeds without removeId, swap still requires both).
2. Confirm copy branches:

```ts
    const actionText = isAdd
      ? `tillägget ${imp.swap?.add ?? "föreslagen konsult"}`
      : `bytet ${imp.swap?.remove && imp.swap?.add ? `${imp.swap.remove} → ${imp.swap.add}` : "föreslaget byte"}`;
    const message = bid
      ? `Detta raderar anbudsutkastet och kör en ny bedömning med ${actionText}. Fortsätt?`
      : `Detta kör en ny bedömning med ${actionText}. Fortsätt?`;
```

3. POST body: `JSON.stringify({ assessmentId: assessment.id, ...(isAdd ? {} : { removeId: ids.removeId }), addId: ids.addId })`.
4. Comparison bar add-branch (currently the diff clause requires both removed and added non-empty): extend so an add-only diff renders ` · tillägg: {comparison.added.join(", ")}` when `comparison.removed.length === 0 && comparison.added.length > 0` (keep the existing byte-clause for the both-case).

- [ ] **Step 3: Gates** — full `npx vitest run`, `npx tsc --noEmit`, `npx eslint .` 0 errors.

- [ ] **Step 4: Commit** — `feat: add-suggestion card, apply handler and poolGap note in go/no-go UI`

---

### Task 4: Roadmap + gates + live smoke + PR (controller-run)

- [ ] **Step 1 (controller):** live smoke per grind-policy (prompt change on gonogo role): run the evaluator headless against an existing dev analysis with a deliberately small team, verify structured output carries `kind` on every improvement, `poolGap` present-or-null, adds only when slots free; stickprov the reasons. `npx next build` (route + page-adjacent changes).
- [ ] **Step 2:** ROADMAP.md: header entry for this PR; note the known limit (no undo suppression for add-cards — an "undo" of an add would be a remove-type which doesn't exist; circularity risk lower than swaps).
- [ ] **Step 3:** Push, NON-DRAFT PR, wait for routine (~5-7 min), address findings, rebase over merged PR A (ROADMAP conflict), squash-merge (Stefan's standing order tonight).

## Self-review notes

- The four add-killing gates move together: prompt (T1.4.1-3), filter (T1.4.5), card render (T3.1), route (T2.3).
- BUG-A honored: `kind` and `poolGap` REQUIRED in the AI schema, optional in read-side TS types for legacy rows.
- MAX_TEAM_SIZE enforced at model level (prompt + filter) AND server level (route 409) AND rider on GoNoGoCreateSchema.
- estimatedImpact stays a string; add-suggestions flow through the same `parseImpactPct > 0` gate.
