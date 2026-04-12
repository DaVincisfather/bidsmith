# Bid Planner Design

**Date:** 2026-04-11
**Status:** Design approved, ready for implementation planning
**Author:** Stefan + Claude

## Problem

Today's bid generator produces structurally identical PPTX output regardless of RFP. Section order, dividers, section titles, format choices (prose vs bullets vs phases) and placeholder sections are all hardcoded in `bid-generator.ts`. The consequences:

- **Homogeneity risk.** If multiple consultant firms use the tool, all their bids share the same skeleton. That is a commercial liability — bids are a signature.
- **Language lock-in.** Section titles and prompts are Swedish-only. English RFPs can't be served cleanly.
- **Rigid format mapping.** Each section has a fixed format (e.g., `understanding` is always prose). The AI can't say "this section is better as a three-column layout."
- **No room for RFP-specific sections.** Unusual requirements (sustainability annexes, sector-specific boilerplate) have no place to land unless we hardcode them for every possible RFP type.

The PPTX v2 renderer built in the previous session solved the *visual* problem. This spec solves the *structural* problem.

## Goals

1. **Move structural decisions from code to AI.** Section order, section titles, format per section, number/placement of dividers, inclusion of Gantt — all become AI outputs.
2. **Guarantee a baseline of required sections** regardless of AI variability (cover, team, quality, references, contact, confidentiality).
3. **Surface unmapped requirements** as explicit placeholders + log entries so the format palette can evolve based on real usage.
4. **Preserve the PPTX renderer.** Slide-level rendering is untouched. The contract between generator and renderer (`BidSection[]`) stays the same.
5. **Support multi-language bids** via a `language` field that flows through planner → content generators → rendered output.
6. **Graceful degradation.** No failure in the planner or a single content call is allowed to crash the entire bid generation. There is always a usable PPTX at the end.

## Non-goals

- **BrandProfile** (per-firm tone, signature moves, density preferences) — deferred to v2. For MVP, variation comes from RFP-driven planning, not from per-firm profiles.
- **Open format palette.** The planner may only choose from the 11 existing slide formats. New format types remain a manual, human-reviewed addition to the codebase.
- **Advisor-tool pattern.** Evaluated and rejected for this pipeline. Pipeline is single-turn structured output, not an agentic loop — advisor-tool adds cost without value. Revisit if/when we build iterative agents (bid reviewer, interactive chat).
- **Eval dataset / regression harness.** Manual prompt evaluation on 3-5 real RFPs is the MVP quality gate. Automated eval comes later.

## Design principles

- **Plan and content are separated.** The planner decides *what* the bid should contain and *how it should be structured*. Content generators decide *what the words say*. Different models can serve different roles (Sonnet for planning, Opus for content).
- **Abstraction layering.** `kind` (planner vocabulary) ≠ `format` (PPTX vocabulary). The translation happens in the generator. Loose coupling: renderer layer can evolve independently.
- **Repair, don't reject.** The validator injects missing required sections and enforces position constraints silently. The planner is allowed to be wrong; the system is not.
- **Three-level content steering.** For AI-generated sections, content is shaped by: (1) format-specific system prompt (*how* it should look), (2) semantic guidance keyed on `semanticKey` (*what theme* it covers), (3) planner's per-section `promptHint` (*the RFP-specific angle*). Composable, not monolithic.
- **Observable by default.** Full plans, repair actions, unmapped requirements, and AI rationale are logged per run. Debuggability and eval feedback matter more than clean logs.

## Architecture

```
RfpAnalysis + Consultants + Context
           |
           v
   +------------------+
   |   BidPlanner     |   new — single Claude call, structured output
   |   (AI call)      |
   +------------------+
           |
           v
       BidPlan            new — discriminated union schema, validated by Zod
           |
           v
   +------------------+
   |   Validator      |   new — repair-based: injection + position enforcement
   +------------------+
           |
           v
       BidPlan'           (validated)
           |
           v
   +------------------+
   |   Generator      |   refactored — dispatcher over plan.sections
   +------------------+
           |
           v
      BidSection[]        UNCHANGED — same contract as today
           |
           v
    PPTX Renderer         UNCHANGED — v2 from previous session
           |
           v
        .pptx
```

**New files:**
- `src/lib/bid-planner.ts` — planner call + Zod schema + `DEFAULT_BID_PLAN`
- `src/lib/bid-plan-validator.ts` — repair-based validator
- `src/lib/__tests__/bid-planner.test.ts`
- `src/lib/__tests__/bid-plan-validator.test.ts`

**Modified files:**
- `src/lib/bid-generator.ts` — refactored from hardcoded pipeline to plan-driven dispatcher (shrinks from ~320 to ~180 lines)
- `src/lib/bid-section-prompts.ts` — section-identity prompts (`understanding`, `value-proposition`, ...) replaced with format-level prompts (`prose`, `bullets`, `three-column`, `phases`) composed with `semanticGuidance()`
- `src/lib/ai-schemas.ts` — add `BidPlanSchema`, retain existing per-format content schemas

**Unchanged:**
- Everything under `src/lib/pptx/` — the v2 renderer layer
- `src/lib/types.ts` `BidSection` and `BidSectionContent` union
- `src/lib/pptx-renderer.ts` re-export shim

## Data contract — `BidPlan`

```typescript
type BidPlan = {
  language: "sv" | "en";
  sections: PlannedSection[];
  unmappedRequirements?: string[];
  rationale?: string;
};

type PlannedSection = (
  | { kind: "cover" }
  | { kind: "toc"; title: string }
  | { kind: "divider"; number: number; title: string; subtitle: string }
  | { kind: "prose"; title: string; promptHint: string }
  | { kind: "bullets"; title: string; promptHint: string; minItems?: number }
  | { kind: "three-column"; title: string; columnHints: [string, string, string] }
  | { kind: "phases"; title: string; promptHint: string }
  | { kind: "gantt"; title: string }
  | { kind: "team"; title: string; preferredSize?: number }
  | { kind: "requirement-matrix"; title: string }
  | { kind: "references"; title: string; minCount?: number }
  | {
      kind: "placeholder";
      title: string;
      instruction: string;
      reason?: "manual-fill" | "unmapped-requirement";
    }
) & { semanticKey?: string };
```

**Field semantics:**

- `language` — drives all localized text in generated content, validator default-injection, and prompt construction. Planner infers this from the RFP language.
- `sections` — ordered. Order is authoritative; the generator assembles the final `BidSection[]` in this sequence after validator repairs.
- `kind` — discriminator. Planner vocabulary, not PPTX format. Translation to `BidSectionContent.format` happens in the generator dispatcher.
- `semanticKey` — optional tag used by the validator to identify obligatorily-present sections that share `kind` with optional ones (e.g., the "quality" prose section among other prose sections). Prompt instructs the planner to use exact literal strings: `cover`, `quality`, `team`, `requirement-matrix`, `references`, `contact`, `confidentiality`, `understanding`, `value-proposition`, `execution-plan`, `risks`, `pricing`.
- `promptHint` — planner's directive to the content generator. Example: "Fokusera på digital mognad i offentlig sektor, ca 200 ord." Keeps planning and writing separated.
- `columnHints` — for `three-column`, exactly three strings. Content generator produces column body text per hint.
- `unmappedRequirements` — top-level log of RFP requirements the planner couldn't fit in any existing format. Feeds `notes/unmapped-requirements.log` for future format palette work.
- `rationale` — short (one sentence per significant structural decision) explanation from the planner. Mostly for debug and eval; not rendered.

## Planner component

### `planBid(ctx: BidContext): Promise<BidPlan>`

Located in `src/lib/bid-planner.ts`. Single Claude call. Uses:
- **Model:** `claude-sonnet-4-6`. Planning is structured decision-making, not deep analysis — Sonnet's sweet spot. Opus is reserved for content generation in the next step.
- **Max tokens:** 3000
- **Schema:** `BidPlanSchema` (Zod discriminated union)
- **Label:** `"bid planner"` (for logging)

### Prompt structure

**System prompt covers:**
1. Role: "plan structure only, do not write content"
2. Closed palette: list of 11 available `kind` values with 1-sentence description each + when to use
3. Required-set: explicit list of mandatory `semanticKey` values that must be present
4. Exact `semanticKey` literals for each mandatory role
5. Format-variety guidance: "don't fall back on prose as default; use three-column, bullets, phases where they fit better"
6. Unmapped-requirement handling: "if a RFP requirement doesn't fit any format, create a placeholder with `reason: unmapped-requirement` and log it in `unmappedRequirements`"
7. `rationale` field: "write one sentence per significant structural choice"
8. Language inference rule: "set `language` based on the RFP's language"

**User content contains (concise, to minimize tokens):**
- RFP summary: title, client, short summary
- Top 10 requirements (compact form)
- Team composition: count + role list only (no full CVs)
- Explicit "required-set" reminder as a checklist

Exact wording is tuned during implementation and manually evaluated on 3-5 real RFPs before release.

## Validator component

### `validateAndRepair(plan: BidPlan, ctx: BidContext): BidPlan`

Located in `src/lib/bid-plan-validator.ts`. Pure code logic, no AI.

**Three repair passes:**

**Pass A — inject missing required sections.** For each rule in `REQUIRED_SECTIONS`, check if `plan.sections` contains a section with that `semanticKey`. If not, append a default section built from context.

**Pass B — enforce position constraints:**
- `cover` → index 0
- `contact` → second-to-last
- `confidentiality` → last

**Pass C — sanity checks:**
- Remove duplicates of `cover`, `toc`, `gantt` (keep first occurrence).
- If `phases` section exists but no `gantt`, auto-inject `gantt` immediately after `phases` (opinionated: most real bids benefit from the timeline view).
- If `gantt` exists but no `phases`, remove the `gantt` and log a warning.
- If `sections.length > 6` and no dividers exist, log a warning (don't inject — plannern may have chosen correctly).

### `REQUIRED_SECTIONS` rule table

| semanticKey | kind | position | injection default |
|---|---|---|---|
| `cover` | `cover` | first | built from `ctx.analysis` |
| `quality` | `prose` | free | prose with `promptHint: "Hur kvalitet säkerställs, samverkan, rapportering"` |
| `team` | `team` | free | team section with all `ctx.teamConsultants` |
| `requirement-matrix` | `requirement-matrix` | free | built from `ctx.analysis.requirements` + `ctx.teamConsultants` |
| `references` | `references` | free | references with `minCount: 3` |
| `contact` | `placeholder` | second-to-last | "Fyll i kontaktuppgifter" (localized) |
| `confidentiality` | `placeholder` | last | "Lägg in sekretess-boilerplate" (localized) |

**Principle: repair, don't reject.** Validator is idempotent and silent. Each repair action is logged for observability but does not fail the pipeline.

## Generator refactor

### New `generateAllSections(ctx): Promise<{ sections, plan }>`

Located in `src/lib/bid-generator.ts`. Orchestrates planner + validator + content generation.

**Flow:**

1. Call `planBid(ctx)` — planner AI call
2. Call `validateAndRepair(rawPlan, ctx)` — deterministic repair
3. **Pass A (parallel)** — for all independent sections (everything except `toc` and `gantt`), call `buildSection(planned, ctx)` in parallel via `Promise.all`. Each result is mapped to its original index.
4. **Pass B (sequential)** — walk `plan.sections` and handle `toc` (reads other sections' titles) and `gantt` (reads phases data from pass A).
5. Assemble `BidSection[]` in plan order. Return `{ sections, plan }`.

### `buildSection(planned, ctx)` dispatcher

```typescript
async function buildSection(
  planned: PlannedSection,
  ctx: BidContext
): Promise<BidSection> {
  switch (planned.kind) {
    case "cover":              return buildCoverSection(ctx.analysis);
    case "divider":            return buildDividerFromPlan(planned);
    case "placeholder":        return buildPlaceholderFromPlan(planned);
    case "requirement-matrix": return buildRequirementMatrix(
                                    ctx.analysis,
                                    ctx.teamConsultants,
                                    planned.title
                                  );
    case "team":               return generateTeamSection(ctx, planned);
    case "references":         return generateReferencesSection(ctx, planned);
    case "prose":              return generateFormatSection("prose", planned, ctx);
    case "bullets":            return generateFormatSection("bullets", planned, ctx);
    case "three-column":       return generateFormatSection("three-column", planned, ctx);
    case "phases":             return generateFormatSection("phases", planned, ctx);
    // toc and gantt handled in pass B
    default: {
      const _exhaustive: never = planned;
      throw new Error(`Unhandled kind: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
```

**Exhaustiveness guard** enforced via `never` type. Adding a new `kind` to the schema becomes a compile-time error until the dispatcher handles it.

### Prompt refactor in `bid-section-prompts.ts`

Today's SECTION_PROMPTS keyed on section identity (`understanding`, `value-proposition`, `execution-plan`, ...) is replaced with format-level prompts keyed on `kind`, composed with semantic guidance:

```typescript
export const FORMAT_PROMPTS: Record<AiFormat, FormatPrompt> = {
  prose: {
    system: ({ promptHint, semanticKey, language }) =>
      `Du skriver en prose-sektion i ett konsultanbud på ${language}.
${semanticGuidance(semanticKey, language)}
Fokus enligt plannern: ${promptHint}
Svara med JSON: { "text": "..." }
150–250 ord.`,
    userContent: formatContext,
  },
  bullets: { ... },
  "three-column": { ... },   // columnHints injected into prompt
  phases: { ... },
};

function semanticGuidance(key: string | undefined, language: "sv" | "en"): string {
  if (!key) return "";
  const sv = {
    quality: "Sektionen ska täcka avstämningar, rapportering, eskalering, kunskapsöverföring.",
    risks: "Sektionen ska lista risker med mitigering — parade ihop.",
    understanding: "Sektionen ska visa att ni förstått uppdragets kärna, inte bara repetera RFP:n.",
    // ...
  };
  // en: { ... }
  return (language === "sv" ? sv : en)[key] ?? "";
}
```

### What disappears from current `bid-generator.ts`

- `SECTION_ORDER` constant → replaced by `plan.sections`
- `SECTION_TITLES` map → titles come from `planned.title`
- `SECTION_FORMAT` map → format derives from `planned.kind`
- `PLACEHOLDER_SECTIONS` array → planner inserts placeholders
- Hardcoded `buildSectionDivider(...)` calls → planner decides divider placement and count
- `generateAiSection(key, ctx)` with identity switch → rewritten as `generateFormatSection(format, planned, ctx)` keyed on format

### Parallelism

Today's pipeline runs ~7 AI section calls in parallel. New pipeline runs N-ish calls where N varies with plan size (typically 6–10). Same order of magnitude. No meaningful latency regression. The extra planner call adds ~2-4 seconds at the start but is a single call.

## Error handling

Four failure layers, each with an explicit fallback. No failure crashes the pipeline.

| Layer | Failure mode | Fallback |
|---|---|---|
| Planner call | Network, rate limit, timeout | Retry once. If still fails, use `DEFAULT_BID_PLAN`. |
| Planner response | Invalid JSON / Zod parse failure | Retry once with sharpened prompt ("previous response was invalid JSON"). If still fails, use `DEFAULT_BID_PLAN`. |
| Planner response | Semantically broken plan (missing required, duplicates, etc.) | Validator repairs silently. Not a failure path. |
| Content generation | Per-section AI call fails | Retry once. If still fails, replace the section with a `placeholder` carrying "could not auto-generate — fill in manually". Other sections generate normally. |
| Gantt | Gantt in plan but no phases | Validator removes gantt and logs warning. |

**`DEFAULT_BID_PLAN`** is a hardcoded constant in `bid-planner.ts` defining a safe ~16-section baseline roughly equivalent to today's `SECTION_ORDER`. It is unit-tested as a standalone valid plan and serves as the ultimate safety net. Its shape:

```typescript
export const DEFAULT_BID_PLAN: BidPlan = {
  language: "sv",
  sections: [
    { kind: "cover", semanticKey: "cover" },
    { kind: "toc", title: "Innehåll" },
    { kind: "divider", number: 1, title: "Uppdragsförståelse", subtitle: "Vår förståelse" },
    { kind: "prose", title: "Uppdragsförståelse", promptHint: "Visa förståelse för uppdragets kärna", semanticKey: "understanding" },
    { kind: "bullets", title: "Identifierat värde", promptHint: "4-6 värdepunkter", semanticKey: "value-proposition" },
    { kind: "divider", number: 2, title: "Genomförande", subtitle: "Metod och tidplan" },
    { kind: "phases", title: "Genomförandeplan", promptHint: "3-5 faser", semanticKey: "execution-plan" },
    { kind: "gantt", title: "Tidplan" },
    { kind: "prose", title: "Kvalitetssäkring", promptHint: "Hur kvalitet säkerställs", semanticKey: "quality" },
    { kind: "bullets", title: "Risker", promptHint: "Risker med mitigering", semanticKey: "risks" },
    { kind: "divider", number: 3, title: "Team & Referenser", subtitle: "" },
    { kind: "team", title: "Team", semanticKey: "team" },
    { kind: "requirement-matrix", title: "Kravuppfyllnad", semanticKey: "requirement-matrix" },
    { kind: "references", title: "Referenser", semanticKey: "references" },
    { kind: "placeholder", title: "Pris", instruction: "Fyll i prisbild", semanticKey: "pricing" },
    { kind: "placeholder", title: "Kontakt", instruction: "Fyll i kontaktuppgifter", semanticKey: "contact" },
    { kind: "placeholder", title: "Anbudssekretess", instruction: "Lägg in sekretess-boilerplate", semanticKey: "confidentiality" },
  ],
};
```

**Principle:** a bad planner response produces a *worse* bid, not a crashed bid. You always get a usable PPTX.

## Testing strategy

| Type | Scope | Priority |
|---|---|---|
| Unit: validator | Each repair pass. Missing cover, missing confidentiality, missing quality, duplicate cover, phases without gantt, gantt without phases, empty plan, valid plan pass-through. | **Highest** — validator is the safety net |
| Unit: schema parse | `BidPlanSchema.safeParse()` on valid and invalid fixtures | High |
| Unit: dispatcher | `buildSection()` returns correct `BidSection` for each `kind` | High |
| Unit: `DEFAULT_BID_PLAN` | Passes schema validation and validator repairs | High |
| Integration: mock planner | `generateAllSections()` with mocked `planBid()` returning 3 canned plans (minimal, exotic, with unmapped-requirement). Verify correct `BidSection[]` | High |
| Integration: mock Claude | Full pipeline with mocked `callClaude`. No real API calls | Medium |
| E2E: real run | One real planner + real content calls on a real RFP, generate PPTX, visual inspection | Medium, manual |
| Prompt eval | Run planner against 3–5 real RFPs, manually rate outputs, document in `notes/` | Medium, manual, pre-release gate |

**MVP bar:** validator unit tests + schema tests + mock integration tests. E2E and prompt eval are manual gates run before first release of this feature.

## Observability

All logging via `console.log` / `console.warn` / `console.error` for MVP. Migration to structured logs in Supabase is a future task.

**What is logged per generation run:**
- Full raw `BidPlan` from planner (pre-validation)
- Full validated `BidPlan` (post-repair)
- Each validator repair action (injected section, repositioned section, removed duplicate) with reason
- `unmappedRequirements` — appended to `notes/unmapped-requirements.log` (file, not console) as structured JSONL
- `rationale` — logged to console for debug
- Planner timing (start, end, duration)
- Each content-generation section call (success, retry, failure → placeholder)

## Future work (out of scope for this spec)

- **BrandProfile** — per-firm tone, signature moves, density preferences. Enables variation between two firms responding to the same RFP. Likely a separate Zod schema + UI for firm configuration.
- **Open format palette** — allow planner to describe new slide layouts. Requires a slide-composition DSL and renderer generalization. Significant effort.
- **Eval dataset** — collection of RFPs with expert-judged "good plans" for regression testing as prompts evolve.
- **Structured logging to Supabase** — move from console to a queryable eval data store.
- **Advisor-tool pattern** — revisit when/if building iterative agents (bid reviewer, interactive edit chat).
- **RFP language detection refinement** — today planner infers `language` from RFP text. For edge cases (English RFP requiring Swedish response, etc.) might need explicit override.

## Open questions

None at this time. All design decisions are made. Ready for implementation planning.
