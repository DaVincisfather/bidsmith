# PPTX Korrigerings-pipeline — design

**Datum:** 2026-05-03
**Branch:** `feat/pptx-corrector`
**Worktree:** master (ingen separat worktree — Stefans val 2026-05-03)
**Bygger på:** `_soft-cap.ts` (PR #41), bullets-pass-spec (`2026-04-29-pptx-bullets-pass-design.md`)
**Relaterar till:** `~/.claude/projects/C--Users-stefa/memory/project_dealflow_next_steps.md`

---

## Bakgrund

Produkttröskeln för Agentic Dealflow är **100% anbud-grade innehåll konsekvent + 90% layout-fidelity** (etablerad 2026-05-03). De sista 10% av layout får konsulten touch:a själv om overflows flag:as tydligt.

Idag finns en första byggsten: `_soft-cap.ts` (PR #41) som loggar `console.warn` när text > hårdkodad threshold per applikator-anrop. Det är ett mätinstrument utan åtgärds-loop. Konsulten ser inte warnings (bara dev-console), och bid-generation har ingen mekanism för att förebygga eller åtgärda overflow.

Den här pipelinen lägger till tre lager ovanpå `_soft-cap.ts`:

1. **Lager 1 — Slot-budget i prompt.** LLM får per-fält max-tecken i prompten, så texten skrivs rätt från början.
2. **Lager 2 — Inline verify text-cap.** Post-LLM check, före PPTX-render. Cap nås → 1 retry med tightenat prompt.
3. **Lager 3 — Flag-only post-retry.** Kvarvarande overflow flag:as på bid:en, surfacas i bid-editor som "Pre-export checklist" där konsulten åtgärdar manuellt.

`_soft-cap.ts` behålls som *render-time backstop* — om någon overflow slipper igenom (icke-LLM-fält, fält utan budget-konfig) loggas det fortfarande till console.

---

## Mål

- Bid-generator producerar `bid.overflow_flags` korrekt när LLM-output > budget och retry inte löser.
- Per-bid retry-cap (5 totalt) skyddar mot token-runaway om budget-konfig är fel.
- Bid-editor visar Pre-export checklist (right rail) grupperat per slide. 0 flags = "Klart för export".
- Konsult-edit i bid-editor uppdaterar flags realtime (`onChange`) — räkning under budget tar bort flag.
- Multi-template-stöd från start: `anbudsmall-v2` + `anbudsmall-colors` båda kalibrerbara via `template_configs`-rad.

## Icke-mål

- **Geometric verify** (lager 2b — TS-port av open-design `verify_layout.py`). Parkat. Övervägs om vi börjar se överraskande overflows i fält där text-cap är grön (t.ex. font-substitution Aptos→Calibri ändrar bredder).
- **Inline-fältflaggor** (visuell flagga på själva fältet utöver counter). Räknare per fält ingår; röda kanter / tooltip-overlays gör vi inte i v1.
- **Template-picker UI i bid-editor.** Separat PR (per Stefans val 2026-05-03 att separera korrektör + picker).
- **Kund-template-onboarding.** Egen spec, egen runda.
- **Budget-redigerings-UI.** Stefan editerar via Supabase SQL Editor i v1. Admin-yta kommer med onboarding-spåret.
- **Per-customer budget-overrides.** `template_configs.customer_id` läggs till när onboarding-spåret startar.
- **Hard-cap eller text-truncering med ellipsis.** Konsekvent med bullets-pass-spec.

---

## Arkitektur

```
[Bid-generator pipeline]  ──läser──▶  [template_configs (Supabase)]
         │                                      │
         │           injicerar budgets i prompt │
         ▼                                      │
[LLM-anrop per section]  ◀──────────────────────┘
         │
         ▼ output
[verifyFieldBudgets]  ──text.length > budget?──┐
         │                                     │
         ▼ pass                            ▼ fail
   (gå vidare)                    [retry once, tighter prompt]
                                            │
                                  ▼ pass    ▼ still fail
                              (gå vidare)   [append to bid.overflowFlags]
         │                                     │
         └──────────────┬──────────────────────┘
                        ▼
                  [PPTX render]
                        │
                        ▼
              [bids row in Supabase]
                        │
                        ▼
                  [Bid-editor]
                        │
                        ▼
        [OverflowChecklist (right rail)]
                  (visar overflow_flags)
                        │
                        ▼ konsult-edit (onChange)
                  [re-verify lokalt]
                        │
                        ▼ length <= budget?
                  [ta bort flag, persistera]
```

---

## Komponenter

### 1. `template_configs`-tabell (Supabase)

Migration: `supabase/migrations/017_template_configs.sql` (se [Migrationer](#migrationer)).

Schema:
```ts
type TemplateConfig = {
  id: string;             // uuid
  name: string;           // "anbudsmall-v2" | "anbudsmall-colors" | ...
  budgets: FieldBudgets;  // jsonb
  created_at: string;
  updated_at: string;
};

type FieldBudgets = Record<string, number>;
// Exempel:
// {
//   "phase.objective": 120,
//   "phase.activities[*]": 120,
//   "phase.deliverables[*]": 100,
//   "phase.decisions[*]": 100,
//   "section.checkpoints[*]": 80,
//   "section.certs[*].description": 80,
//   "phase.name": 40,
//   "phase.period": 10
// }
```

**Wildcard-konvention:** `phase.activities[*]` matchar alla index i array:en. Resolveras i `verifyFieldBudgets` runtime.

### 2. Budget-loader — `/agentic-dealflow/src/lib/pptx-template/budget-loader.ts`

```ts
export async function loadBudgets(templateName: string): Promise<FieldBudgets>;
```

- Query:ar Supabase `template_configs` på `name`.
- Cache:ar per `templateName` i process-level Map (engångsladdning per process-livstid).
- Validerar mot Zod-schema (`FieldBudgetsSchema`).
- Throws `TemplateConfigMissingError` om rad saknas — fail-fast (vi vill inte tyst köra utan budgets).
- Throws `InvalidBudgetSchemaError` om budgets-JSONB inte matchar schemat.

Cache-invalidering exponeras som `clearBudgetCache(name?: string)` — anropas av framtida admin-UI när budgets editeras.

### 3. Budget-aware prompt builder

Utökning i `/agentic-dealflow/src/lib/bid-generator/` (befintlig mapp — orchestrator i `index.ts`, prompt-builders per bundle i `bundles/*.ts`).

Per bundle-prompt: vid prompt-byggande, slå upp vilka fält bundle:n genererar och appendera tabell:

```
TEXT-LIMITS (max tecken):
- objective: 120
- activities (varje punkt): 120
- deliverables (varje punkt): 100

Skriv inom dessa gränser. Är ett område långt — komprimera, inte dela.
```

Bara fält som bundle:n faktiskt producerar inkluderas (inte hela budget-tabellen — håller token-overhead nere).

Inkluderas i alla 4 bundles. Token-overhead per bundle: ~80-150 tokens. Total: ~600 tokens × Opus pricing ≈ +$0.01/bid. Marginellt.

### 4. `verifyFieldBudgets` — `/agentic-dealflow/src/lib/pptx-template/verify-budgets.ts`

```ts
export type Overflow = {
  fieldPath: string;       // "phases[0].activities[2]"
  fieldLabel: string;      // "Fas 1 — aktivitet 3"
  length: number;
  budget: number;
  slide: number;
};

export function verifyFieldBudgets(
  bidContent: BidSectionContent,
  budgets: FieldBudgets
): { pass: boolean; overflows: Overflow[] };
```

- Pure function. Walks `bidContent`.
- Resolveras wildcard-paths (`phase.activities[*]` → iterera alla index i `phases[i].activities`).
- För varje konkret path: `text.length > budget` → push till `overflows`.
- `pass = overflows.length === 0`.
- `slide`-mapping: hårdkodad lookup-tabell i samma fil (vilken slide en fieldPath bor på). Lägg till entries när nya applikatorer läggs till.
- `fieldLabel`: human-readable, för UI ("Fas 1 — aktivitet 3" istället för "phases[0].activities[2]").

### 5. Retry-mekanism

Orchestrerad i `/agentic-dealflow/src/lib/bid-generator/index.ts` (befintlig orchestrator):

```ts
async function generateBundleWithRetry(
  bundle: BundleConfig,
  budgets: FieldBudgets,
  retryBudget: { remaining: number }
): Promise<{ output: BundleOutput; overflows: Overflow[] }> {
  const prompt = buildBundlePrompt(bundle, budgets);
  let output = await callClaude(prompt);
  let { pass, overflows } = verifyFieldBudgets(output, budgets);

  if (!pass && retryBudget.remaining > 0) {
    retryBudget.remaining -= 1;
    const tightenedPrompt = appendOverflowList(prompt, overflows);
    output = await callClaude(tightenedPrompt);
    ({ pass, overflows } = verifyFieldBudgets(output, budgets));
  }

  return { output, overflows };
}
```

- 1 retry per LLM-anrop.
- Global retry-cap 5 per bid (mot runaway om budget-konfig är fel). När `retryBudget.remaining === 0`, alla efterföljande overflows flag:as direkt utan retry. Logga `console.warn("[corrector] retry-cap reached for bid X")`.

### 6. `bids.overflow_flags`-kolumn

Migration: `supabase/migrations/018_bid_overflow_flags.sql` (se [Migrationer](#migrationer)).

```ts
type OverflowFlag = {
  slide: number;
  fieldPath: string;
  fieldLabel: string;
  length: number;
  budget: number;
};

// bids.overflow_flags: OverflowFlag[]
```

Sparas vid bid-create. Uppdateras vid konsult-edit i bid-editor (re-verify lokalt → om under budget, ta bort flag, persistera).

Ärver befintlig RLS-policy på `bids`-tabellen (user-scope).

### 7. `OverflowChecklist`-komponent

Path: `/agentic-dealflow/src/components/bid-editor/OverflowChecklist.tsx`

```tsx
type Props = {
  flags: OverflowFlag[];
  onJumpToField: (flag: OverflowFlag) => void;
};
```

- Right rail-panel, ~280px bred. Sticky position.
- Default expanderad om `flags.length > 0`, kollapsad om 0.
- Renderar grupperat per slide. Varje rad: `Slide 7 — Fas 1 aktivitet 3: 145/120 tecken`.
- Klick → `onJumpToField(flag)` (parent scrollar bid-editor till fältet + focus).
- Tom state: "Inga overflows — redo för export".

### 8. Per-fält counter i `EditableText`

Path: `/agentic-dealflow/src/components/bid-editor/EditableText.tsx` (befintlig — utökas).

- Subtle text under fältet: `145/120` när text är under budget (grå), `145/120` röd när över.
- Uppdateras `onChange` (per knapptryck). Debounce 100ms för att undvika excess re-renders.
- Counter syns bara om fältet har en budget-entry för aktiv template. Ingen counter på fält utan budget.

---

## Datamodell

### `template_configs` (ny)

| Kolumn | Typ | Beskrivning |
|---|---|---|
| `id` | uuid PK | Default `gen_random_uuid()` |
| `name` | text unique not null | T.ex. `anbudsmall-v2`, `anbudsmall-colors` |
| `budgets` | jsonb not null | `FieldBudgets`-objekt |
| `created_at` | timestamptz | Default `now()` |
| `updated_at` | timestamptz | Default `now()` |

### `bids.overflow_flags` (ny kolumn)

| Kolumn | Typ | Beskrivning |
|---|---|---|
| `overflow_flags` | jsonb not null default '[]'::jsonb | `OverflowFlag[]` |

---

## Dataflöde

### Generation (per bid)

1. **Template selection.** Bid-generator får `templateName` (default `anbudsmall-v2`, kan vara `anbudsmall-colors` när picker är på plats).
2. **Load budgets.** `loadBudgets("anbudsmall-v2")` → cache hit eller Supabase query → `FieldBudgets`.
3. **Per bundle (4 bundles enligt befintlig pipeline):**
   - a. Bygg prompt → injicera relevanta budgets.
   - b. Anropa Claude Opus.
   - c. Parse + Zod-validera (befintligt).
   - d. `verifyFieldBudgets(bundleOutput, budgets)` → `{ pass, overflows }`.
   - e. Om `!pass` och `retryBudget.remaining > 0`: bygg om prompten med `appendOverflowList()`, retry **1 gång**.
   - f. Om fortfarande overflow: append till `bid.overflowFlags`.
4. **Compose bid.** Befintlig composite-logik mergar 4 bundles → `bidContent`.
5. **Render PPTX.** Befintlig `renderBid()` skriver `tmp/bid-{id}.pptx`. `_soft-cap.ts`-anrop loggar fortfarande som backstop.
6. **Persistera.** Insert i `bids` med `overflow_flags JSONB`.

### Editing (i bid-editor)

7. **Load bid.** Bid-editor läser `bid` + `overflow_flags`.
8. **Render `OverflowChecklist`.** Right rail, default expanderad om flags > 0.
9. **Konsult-edit av fält (onChange):**
   - Per-fält counter uppdateras live (`145/120`).
   - `verifyFieldBudgets` kör lokalt (klient-side, single-field check).
   - Om `length <= budget`: ta bort flag från `overflow_flags`, persistera till Supabase (debounced).
   - Om konsult ökar längden över budget på fält som *inte* hade flag: lägg till ny flag.
10. **Re-export.** Konsult klickar "Exportera": re-render PPTX från `bidContent`. Inga nya retries — vi använder konsultens text rakt av.

---

## Migrationer

### 017_template_configs.sql

```sql
create table template_configs (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  budgets jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table template_configs enable row level security;

create policy "template_configs_read"
  on template_configs for select
  to authenticated
  using (true);

-- Inga write-policies via API. Stefan editerar via SQL Editor (service_role bypass:ar RLS).

insert into template_configs (name, budgets) values
  ('anbudsmall-v2', jsonb_build_object(
    'phase.objective', 120,
    'phase.activities[*]', 120,
    'phase.deliverables[*]', 100,
    'phase.decisions[*]', 100,
    'section.checkpoints[*]', 80,
    'section.certs[*].description', 80,
    'phase.name', 40,
    'phase.period', 10
  )),
  ('anbudsmall-colors', jsonb_build_object(
    'phase.objective', 120,
    'phase.activities[*]', 120,
    'phase.deliverables[*]', 100,
    'phase.decisions[*]', 100,
    'section.checkpoints[*]', 80,
    'section.certs[*].description', 80,
    'phase.name', 40,
    'phase.period', 10
  ));
```

`anbudsmall-colors` seedas med samma värden som v2 — kalibreras separat när stress-fixturen körs mot den.

### 018_bid_overflow_flags.sql

```sql
alter table bids
  add column overflow_flags jsonb not null default '[]'::jsonb;
```

Ärver befintlig RLS på `bids`.

---

## Error-handling

| Scenario | Hantering |
|---|---|
| `template_configs`-rad saknas vid load | `loadBudgets()` throws `TemplateConfigMissingError` med template-namn. Bid-generation avbryts. Stefan ser meddelandet, fixar via SQL Editor. |
| Budget-JSON validerar inte mot Zod-schema | Throws `InvalidBudgetSchemaError`. Same flow. |
| LLM-anrop fail under retry | Genom befintlig `callClaude()` retry-stack (network/rate-limit retries existerar redan). Om retry till slut fail:ar, propagera upp som befintligt fel. |
| Retry-cap (5/bid) nådd | Log `console.warn("[corrector] retry-cap reached for bid X, remaining overflows flagged without retry")`. Continue. Övriga overflows flag:as direkt. |
| `bids.overflow_flags`-update fail i bid-editor | Toast-error till konsult ("Kunde inte spara — försök igen"). Lokal state behålls så konsulten inte tappar input. |
| Konsult editar bid från två tabs | Utanför scope (existerande bid-editor concurrency-modell ärvs). |

---

## Test-strategi

TDD per superpowers + befintlig Vitest-stack.

### Unit

- `verify-budgets.test.ts` — pure function, fixture-based: pass-case, single overflow, multi-overflow, wildcard-expansion, tom output, fält utan budget-entry ignoreras.
- `budget-loader.test.ts` — Supabase-mock: cache-hit, cache-miss, missing template throws, invalid JSON-schema throws, `clearBudgetCache` fungerar.
- `retry-orchestrator.test.ts` — mocked Claude: pass first try, fail then retry-pass, fail twice (flagged), global cap nått (continue utan retry).

### Integration

- `bid-generator-overflow.test.ts` — end-to-end med mocked Claude som returnerar known-overflow output, asserta `bid.overflow_flags` är populerade korrekt och PPTX renderas.
- Existerande `bid-export-e2e.test.ts` ska fortfarande passera (regression).

### Component

- `overflow-checklist.test.tsx` — Vitest + Testing Library: render med 0 flags ("Klart för export"), render med 3 flags grupperade per slide, klick → `onJumpToField` anropad med rätt flag.
- `editable-text-counter.test.tsx` — counter uppdateras vid input, color-shift vid > budget, ingen counter om fält saknar budget-entry.

### Manual smoke

- Generera bid med stress-fixture mot `anbudsmall-v2` → verifiera flags i Supabase + checklist i editor.
- Editera flagged fält i editor → verifiera flag försvinner från checklist live + counter uppdateras.
- Generera bid mot `anbudsmall-colors` med samma input → notera om budget-kalibrering behövs (förväntat: ja, eftersom färgade textboxarna förmodligen har annan kapacitet).

---

## Acceptance-kriterier

1. Bid-generation populerar `bid.overflow_flags` korrekt när LLM-output > budget och retry inte löser.
2. Retry triggas 1× per LLM-anrop. Global cap 5 per bid. Cap-nått loggas.
3. Pre-export checklist (right rail) visar alla flags grupperat per slide. 0 flags = "Klart för export".
4. Konsult-edit i bid-editor (`onChange`) uppdaterar live counter + flag-status. Räkning under budget → flag försvinner från checklist + Supabase.
5. Existerande `pptx-template`-tester + `bid-export-e2e` gröna.
6. `loadBudgets("nonexistent")` fail:ar tydligt med template-namn i felmeddelande.
7. Token-overhead < $0.10/bid worst case (kalibrerade budgets, 0 retries vanligtvis).

---

## Token-budget och pricing-impact

Per `project_pricing_model.md`: $1.70/bid baseline, ~70% bruttomarginal = ~$1.19 i tokenbudget.

Korrektör-overhead:
- Lager 1 (prompt-budget): ~80-150 tokens × 4 bundles × Opus pricing ≈ **+$0.01/bid**.
- Lager 2 (verify): gratis (TS pure function).
- Lager 3 retry: hela bundle-prompten igen ≈ 2000-4000 tokens ≈ $0.03-0.06/retry. Cap 5 = max ~$0.30/bid worst case.

Realistic med kalibrerade budgets: retry triggar <1×/bid i snitt, så **~$0.01-0.06/bid extra**. Sitter komfortabelt inom budgeten.

---

## Implementationsordning

Utförs i `superpowers:writing-plans` separat. Förslag på fasning för planen:

1. **Foundation.** Migrations 017+018 applicerade. `budget-loader.ts` + tester. `verify-budgets.ts` + tester.
2. **Bid-generator-integration.** Prompt-builder uppdaterad. Retry-orchestrator. Integration-test med mocked Claude.
3. **Bid-editor UI.** `OverflowChecklist`-komponent + `EditableText`-counter + tester.
4. **Manual smoke + kalibrering.** Generera mot v2 + colors, kalibrera budgets vid behov.

Branch-disciplin: allt på `feat/pptx-corrector` (skapad från master). PRs per fas (eller en bundlad om diff hålls liten).

---

## Open questions

Inga open questions vid spec-skrivning. Alla val gjorda 2026-05-03 i brainstorming-session.

Framtida frågor (utanför scope, väntar på annan trigger):
- Geometric verify (lager 2b): triggers när vi ser overflows i fält som text-cap inte fångar.
- Budget-redigerings-UI: triggers när onboarding-spåret startar.
- Per-customer budget-overrides: triggers när första kund-template läggs till.
