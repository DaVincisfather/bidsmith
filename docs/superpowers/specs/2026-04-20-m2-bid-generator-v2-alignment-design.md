# M2 — Bid-generator alignment to v2 slot-formats (design)

**Date:** 2026-04-20
**Estimated effort:** ~5-7h (excluding eval-harness, manual PPTX QA)
**Prerequisites:** PR #16 (phase-detail Topp 2 fix) merged to master

---

## Why

PR #13 landed the template-based renderer pivot. The v2 `anbudsmall-v2` template ships with 11 distinct slot-formats (`cover`, `understanding-*`, `phases`, `quality-assurance`, `team-pricing`, `requirement-matrix-v2`, `reference-v2`, `confidentiality`, `certifications`). The bid-generator still emits the v1 union (`prose`, `bullets`, `team`, `references`, `requirement-matrix`, `placeholder`, `section-divider`, `three-column`, `gantt`). The template renderer silently skips unknown formats, so production exports render with missing slides.

M2 aligns the bid-generator output contract with the v2 template contract end-to-end: types, Zod schemas, prompt architecture, bid-editor renderers, and export-path failure behaviour.

---

## Scope

### In-scope

1. **Types & Zod** — replace v1 union in `BidSectionContent` with the 11 v2 formats. Extend `requirement-matrix-v2` with a `coverage` array for per-consultant matrix data (future template upgrade). Change `team-pricing.members[].timpris` to `number | null`.
2. **Bid-generator refactor** — split into 6 AI-bundle prompts (grouped by theme) + 3 deterministic generators. Estimated 6 AI calls per bid (vs. ~12 pre-M2).
3. **`rfp-analyzer` extension** — extract `oslReference` (OSL paragraph) and `secrecyRows` from RFP source text. Feed into `confidentiality` section deterministically.
4. **Renderer fail-loud** — `src/lib/pptx-template/loader.ts:100` throws on unknown format instead of silent skip.
5. **Bid-editor renderers** — remove v1 renderers; add `team-pricing` editable pricing table with visible "Fyll i timpriser innan export" reminder; extend `requirement-matrix-v2` renderer with collapsible coverage view.
6. **DB wipe** — `010_wipe_bids.sql` migration (TRUNCATE bids CASCADE). Applied manually in Supabase SQL Editor before merge.

### Out-of-scope (M2.5 or later)

- Template slide 13 layout upgrade to per-consultant matrix (Stefan owns design, separate session)
- `organizations.bid_template_config` JSONB migration (M3)
- `requirement-matrix.ts` applicator `01`-`06` substring-corruption risk (flagged by Topp 2 reviewer — separate small PR, same pattern as PR #16)
- Conditional-skipped slides per org-config (after M4)
- Multi-template support (M4)
- Consultant-specific pricing persistence (Stefan: timpris is per-bid, not per-consultant)

---

## Done criteria

- `npx tsc --noEmit` clean
- All vitest suites green (including new bid-generator bundle tests + e2e smoke test)
- Manual end-to-end: upload RFP → generate → open bid-editor → fill pricing → export PPTX → open in PowerPoint → no MISSING slides, no unreplaced `{placeholders}`, no substring-corrupted strings (e.g. "ISO 27001" preserved)
- Eval-harness extended with M2 bundle scenarios (time-boxed; punt to M2.5 if >2h)

---

## Types & Zod schemas

### `src/lib/types.ts` `BidSectionContent` — v2 union (11 members)

**Removed:** `prose` (dead — slides 3-5 use `understanding-*` via prose applicator), `bullets`, `team`, `references`, `requirement-matrix` (v1), `placeholder`, `section-divider`, `three-column`, `gantt`. Interfaces `TeamPresentation`, `BidReference`, `RequirementRow` also removed (scan usage during impl).

**Unchanged:** `cover`, `phases`, `understanding-current`, `understanding-assignment`, `understanding-vision`, `quality-assurance`, `reference-v2`, `confidentiality`, `certifications`.

**Modified — `requirement-matrix-v2`:**

```ts
{
  format: "requirement-matrix-v2";
  rows: Array<{
    requirement: string;
    hurUppfylls: string;           // compressed summary for current template
    referens: string;
    coverage: Array<{               // NEW — per-consultant matrix data
      consultantName: string;
      status: "JA" | "NEJ" | "DELVIS";
      evidence: string;             // short motivation
    }>;
    met?: boolean;
  }>;
}
```

**Modified — `team-pricing`:**

```ts
{
  format: "team-pricing";
  members: Array<{
    name: string;
    role: string;
    omfattningPct: number;          // AI-derived from phase data
    timpris: number | null;         // null until company fills in
    timmar: number;                 // AI-derived
    total: number | null;           // timpris * timmar; null if timpris is null
  }>;
  summary?: { totalTimmar: number; totalPris: number | null };
}
```

### `src/lib/ai-schemas.ts`

- Delete all v1-section Zod schemas (verify names during impl: likely `RequirementMatrixSchema`, `TeamSchema`, `ReferencesSchema`, `BulletsSchema`, etc.)
- Add `BidSectionV2Schema` — Zod discriminated union keyed on `format`
- Export each format's Zod constant individually for per-bundle validation in the bid-generator orchestrator

### Registry sub-fix

`src/lib/pptx-template/registry.ts:22` has `cloneFrom: "references"` while the format is `reference-v2`. Verify during impl whether `cloneFrom` refers to section `key` (likely correct) or is a bug. Fix if it is a bug.

---

## Bid-generator refactor — grouped prompt architecture

New layout:

```
src/lib/bid-generator/
  index.ts              # orchestrator; runs bundles in Promise.all
  bundles/
    understanding.ts    # Opus
    phases.ts           # Opus
    quality.ts          # Opus
    requirement-matrix.ts  # Sonnet
    team.ts             # Sonnet
    reference.ts        # Sonnet
  deterministic/
    cover.ts
    certifications.ts
    confidentiality.ts
```

Old `src/lib/bid-generator.ts` and `src/lib/bid-section-prompts.ts` are replaced by this structure.

### Bundles — 6 AI calls total

| Bundle | Model | Produces | Why Opus vs. Sonnet |
|--------|-------|----------|----------------------|
| `understanding` | Opus | `understanding-current` + `understanding-assignment` + `understanding-vision` | Cohesive narrative, star sections — Opus quality |
| `phases` | Opus | `phases` (consumed by both phases-overview and phase-detail slides) | Bid-writing core |
| `quality` | Opus | `quality-assurance` | Bid-writing, but QA-specific |
| `requirement-matrix` | Sonnet | `requirement-matrix-v2` with coverage array | Mechanical matching against consultant CVs |
| `team` | Sonnet | `team-pricing` with `omfattningPct` + `timmar` derived from phases; `timpris: null` | Derivation from structured data |
| `reference` | Sonnet | `reference-v2` (matches consultant references to RFP) | Matching |

All bundles run in parallel via `Promise.all`. Each bundle's output is Zod-validated against the per-format schema before inclusion in the final `BidSection[]` array. Validation failure after `callClaude`'s built-in retry → throw (no silent fallback à la `DEFAULT_BID_PLAN`).

### Deterministic generators — no AI

- **`cover`:** built from `RfpAnalysis` (client, bidName, date) + organization fields (companyName). Trivial mapping.
- **`certifications`:** hardcoded default — ISO 9001/27001/14001 with `number: "Fyll i certifikatnummer"` and `validUntil: "—"`. TODO comment referencing M3 `organizations.bid_template_config` migration.
- **`confidentiality`:** built from `RfpAnalysis.oslReference` + `RfpAnalysis.secrecyRows`. Fallback: empty rows + null reference when the RFP does not address secrecy.

### Confidentiality data source — rfp-analyzer extension

`rfp-analyzer`'s Sonnet prompt gains two extractions, flowing through the `RfpAnalysis` object to the deterministic `confidentiality` generator:

- `oslReference: string | null` — OSL paragraph cited by the RFP (e.g. "19 kap 3 §"); null if not referenced.
- `secrecyRows: Array<{reference, scope, justification}>` — what the RFP asks to be classified.

### Input surface per bundle

- `RfpAnalysis` (compressed M0 output, now with OSL fields)
- `Assessment` (chosen consultants from go/no-go)
- `consultants[]` (profiles with CV data)
- `organizations.bid_template_config` (M3 future; defaults until then)

---

## Renderer — fail-loud on unknown format

`src/lib/pptx-template/loader.ts:100` currently has `default: /* silent skip */`. Replace with:

```ts
default:
  throw new Error(`unknown bid section format: ${format}`);
```

API route `/api/bids/[id]/export` catches and returns 500 with the error message. New unit test in `src/lib/pptx-template/__tests__/loader.test.ts` verifies throw on invalid section.

---

## Bid-editor renderers

`src/components/bid-editor/renderers/index.tsx`:

1. Verify post-PR #14 that all 11 v2 formats have renderer cases. Add any missing.
2. Remove v1 renderers (bullets, team, references, v1 requirement-matrix, placeholder, section-divider, three-column, gantt, prose).
3. New `team-pricing` renderer with editable `timpris` text inputs per row. Auto-recompute `total` client-side. Write back through existing bid-editor save flow.
4. Bid-editor header banner: when any `team-pricing.members[].timpris === null`, show yellow "⚠ Fyll i timpriser innan export" banner with anchor link to the team-pricing section. Non-blocking — export stays enabled.
5. Extended `requirement-matrix-v2` renderer: primary view shows `hurUppfylls` + `referens` columns (matches template output). Collapsible "Visa coverage per konsult" expands the `coverage` array as a debug/QA view — not rendered in the exported deck until the template slide 13 is upgraded in a future session.

---

## DB wipe

`supabase/migrations/010_wipe_bids.sql`:

```sql
TRUNCATE bids CASCADE;
```

Applied manually via Supabase SQL Editor per project convention. Committed to the migration history.

---

## Tests

### Unit (vitest)

- **`src/lib/__tests__/ai-schemas-v2.test.ts`** (new) — happy-path validation + rejection of invalid payloads for all 11 v2 formats.
- **Deterministic generators** — `cover` and `certifications` builders: simple input→output mapping tests.
- **`rfp-analyzer`** — mocked Sonnet response maps correctly to `oslReference` + `secrecyRows`.
- **`loader.ts` throw** — new test in `src/lib/pptx-template/__tests__/loader.test.ts` verifies throw on unknown format.

### Bundle tests (mocked `callClaude`)

- Per bundle: mocked AI response → verify orchestrator maps into `BidSection` structure + Zod validates before inclusion in output array.
- Fallback behaviour: validation failure after `callClaude` retry → throw (no `DEFAULT_BID_PLAN`-style silent fallback).

### Integration (e2e)

New `src/lib/pptx-template/__tests__/bid-export-e2e.test.ts` — mocks Supabase + consultants, runs full bid-generator orchestrator with fixture AI responses, renders PPTX via `renderTemplate`, unzips, verifies every rendered slide contains expected content, no `{placeholder}` leftovers, no MISSING texts. Closes M1 review Topp 3 gap (missing integration test for export route).

### Eval-harness

Extend existing harness (PR #7) with M2 bundle scenarios. New rubric judge for bid-generator: scores cross-bundle coherence (no contradictions between understanding-current and understanding-assignment, team-pricing roles match phase activities). **Time-boxed — if >2h, defer to M2.5.**

### Manual QA

- Full e2e: upload RFP → generate → open bid-editor → verify team-pricing warning banner → fill timpris values → export PPTX → open in PowerPoint/Keynote → screenshot all 18 slides → verify no corrupted strings, no missing content.
- Topp 2 regression in situ: use a RFP that mentions "ISO 27001" in an activity, confirm preserved.

---

## Risks

1. **Bundle Zod validation fails in prod** after retry → throws 500 on export. Accepted — this is the fail-loud behaviour that mitigates Ekan-style silent QoS regression.
2. **`coverage` array never rendered** while slide 13 template is unchanged. Mitigation: collapsible coverage view in bid-editor provides feedback on data quality without a rendered slide.
3. **"Forgot pricing" export** — company exports PPTX with `timpris: null` resulting in blank cells. Mitigation: visible yellow banner. Non-blocking per decision. Residual risk accepted.
4. **Eval-harness scope creep** → time-box to 2h; punt excess to M2.5.
5. **Default certifications look unprofessional in export** — mitigation: default strings are explicitly "Fyll i certifikatnummer" rather than placeholder-looking values.

---

## Dependencies & sequencing

- **Before M2 starts:** PR #16 (phase-detail Topp 2) merged to master (avoid rebase conflict on `phase-detail.ts`).
- **Parallel branches unaffected:** PR #12 (`feat/m4-invite-flow`) and local `feat/organisation-index` remain parked. `BidSection` container is not modified in M2, so no cross-branch rebase needed.
- **After M2 merges:** apply `010_wipe_bids.sql` in Supabase SQL Editor, then exercise full RFP → export flow end-to-end before declaring done.

---

## Open questions

None remaining from brainstorm.
