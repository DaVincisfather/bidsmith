# Bid-editor-slimning — implementationsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Slimma bid-editorn för onboardade mallar: kortfält döljs, prosa-rutor grupperas per slide med intent-etikett + teckenräknare, och wizarden får en "hela sliden är fast"-knapp.

**Architecture:** Editorn får slot-metadata genom ett server-side join mot mallprofilen (ingen migration, ingen genererings-ändring). Wizard-knappen är bulk-skip via befintlig decision-mekanik. Spec: `notes/2026-07-15-bid-editor-slim-design.md` — läs den först.

**Tech Stack:** Next.js 16 App Router, TypeScript strikt, Tailwind v4, vitest + @testing-library/react (INGEN user-event — använd `fireEvent`), Zod.

## Global Constraints

- Worktree: `C:\Users\stefa\projects\bidsmith-editorslim`, branch `feat/bid-editor-slim`. ALLA kommandon körs med denna som cwd (PowerShell, inte bash — bash-sandboxen ser inte färska filändringar).
- Surgical changes: rör bara det uppgiften kräver; matcha befintlig stil (svenska UI-strängar, engelska identifierare/kommentarer i ny kod följer grannkodens mönster — befintliga filer blandar; härma filen du redigerar).
- TypeScript strikt — inga `any` utan motiverad kommentar. Filer under ~300 rader (BidEditor.tsx är redan 335 — väx den INTE, ny logik läggs i nya filer).
- Genereringen, kalibreringsloopen, exporten och sparlogiken (PATCH-payload med ALLA sektioner) ändras INTE.
- Conventional commits. Committa per task.
- Testkommando: `npm test -- --run <fil>` för enskild fil, `npm test -- --run` för hela sviten. Lint: `npm run lint`. Typecheck: `npx tsc --noEmit`.
- Foreign-vägen är env-grindad: `BIDSMITH_FOREIGN_TEMPLATES=on` måste stå i worktreens `.env.local` för wizard/API-tasks som körs mot dev (kolla; kopierad från bidsmith-main där den ska finnas).

## Filkarta

| Fil | Ansvar | Task |
|---|---|---|
| `src/lib/pptx-template/onboarding/draft-logic.ts` (modify) | + `applySlideDecision` — bulk-beslut för en slides alla slots | 1 |
| `src/lib/api-schemas.ts` (modify) | + `OnboardingSlideDecisionSchema`, `OnboardingPatchSchema` (union) | 2 |
| `src/app/api/templates/[id]/onboarding/route.ts` (modify) | PATCH tar även slide-beslut | 2 |
| `src/components/onboarding/OnboardingWizard.tsx` (modify) | "Markera hela sliden som fast"-knapp + ångra | 3 |
| `src/components/onboarding/SummaryView.tsx` (modify) | Rad som listar fasta slides | 4 |
| `src/lib/bid-generator/short-field.ts` (create) | Kortfälts-konstanten utan server-beroenden (klientsäker) | 5 |
| `src/lib/bid-generator/bundles/generic-prose.ts` (modify) | Re-exporterar konstanten från short-field.ts | 5 |
| `src/lib/bid-editor/slot-meta.ts` (create) | `buildSlotMeta` + `groupSectionsBySlide` — rena funktioner | 5 |
| `src/components/bid-editor/SlideNav.tsx` (create) | Slide-navigering (ersätter SectionNav för foreign-anbud) | 6 |
| `src/components/bid-editor/renderers/index.tsx` (modify) | generic-prose-fallet: intent-etikett + teckenräknare via `meta`-prop | 7 |
| `src/components/bid-editor/SlideGroupedSections.tsx` (create) | Grupperad huvudvy (sliderubriker + Övriga rutor) | 8 |
| `src/components/bid-editor/BidEditor.tsx` (modify) | `slotMeta`-prop, väljer grupperad vy/SlideNav | 9 |
| `src/app/bids/[id]/page.tsx` (modify) | Laddar profil, bygger slotMeta server-side | 9 |
| `notes/ROADMAP.md` (modify) | Bocka av spåret | 10 |

Task 1–4 (wizard-spåret) och 5–9 (editor-spåret) är oberoende och kan byggas i valfri ordning, men inom varje spår gäller ordningen.

---

### Task 1: `applySlideDecision` i draft-logic

**Files:**
- Modify: `src/lib/pptx-template/onboarding/draft-logic.ts` (efter `applyDecision`, ~rad 120)
- Test: `src/lib/pptx-template/onboarding/__tests__/draft-logic.test.ts` (nytt describe-block sist i filen)

**Interfaces:**
- Consumes: `applyDecision(draft, input): ApplyResult` (befintlig, samma fil), `OnboardingDraft` från `../draft`.
- Produces: `applySlideDecision(draft: OnboardingDraft, source: number, decision: "skipped" | "pending"): ApplyResult` — Task 2 anropar den från PATCH-routen.

- [ ] **Step 1: Skriv failande test**

Lägg sist i `draft-logic.test.ts` (återanvänd filens befintliga hjälpare om det finns en draft-factory — annars bygg utkastet inline så här; matcha filens stil):

```ts
describe("applySlideDecision", () => {
  const draft = parseOnboardingDraft({
    draftVersion: 1,
    slideSize: { cx: 12192000, cy: 6858000 },
    slots: [
      { source: 2, shapeIndex: 0, shapeText: "Metod", token: "{Metod}", capability: "understanding", intent: "Metod", confidence: "high", decision: "confirmed" },
      { source: 2, shapeIndex: 1, shapeText: "Tidplan", token: "{Tidplan}", capability: "understanding", intent: "Tidplan", confidence: "low", decision: "pending" },
      { source: 3, shapeIndex: 0, shapeText: "Referens", token: "{Referens}", capability: "understanding", intent: "Referens", confidence: "high", decision: "confirmed" },
    ],
    wireframe: [
      { source: 2, shapes: [
        { shapeIndex: 0, geometry: { x: 0, y: 0, cx: 100, cy: 100 }, text: "Metod", candidate: true },
        { shapeIndex: 1, geometry: { x: 0, y: 200, cx: 100, cy: 100 }, text: "Tidplan", candidate: true },
      ] },
      { source: 3, shapes: [
        { shapeIndex: 0, geometry: { x: 0, y: 0, cx: 100, cy: 100 }, text: "Referens", candidate: true },
      ] },
    ],
  });

  it("skippar ALLA slots på sliden och rör inte andra slides", () => {
    const result = applySlideDecision(draft, 2, "skipped");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const bySlide2 = result.draft.slots.filter((s) => s.source === 2);
    expect(bySlide2.every((s) => s.decision === "skipped")).toBe(true);
    const slide3 = result.draft.slots.find((s) => s.source === 3);
    expect(slide3?.decision).toBe("confirmed");
  });

  it("pending återställer sliden till obeslutad (ångra)", () => {
    const skipped = applySlideDecision(draft, 2, "skipped");
    if (!skipped.ok) throw new Error(skipped.error);
    const restored = applySlideDecision(skipped.draft, 2, "pending");
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.draft.slots.filter((s) => s.source === 2).every((s) => s.decision === "pending")).toBe(true);
  });

  it("okänd slide → fel", () => {
    const result = applySlideDecision(draft, 99, "skipped");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/99/);
  });

  it("muterar inte input-utkastet", () => {
    const before = JSON.stringify(draft);
    applySlideDecision(draft, 2, "skipped");
    expect(JSON.stringify(draft)).toBe(before);
  });
});
```

Import-raden överst i testfilen ska nu även ta `applySlideDecision` från `../draft-logic` och `parseOnboardingDraft` från `../draft` (om de inte redan importeras).

- [ ] **Step 2: Kör testet — ska faila**

Kör: `npm test -- --run src/lib/pptx-template/onboarding/__tests__/draft-logic.test.ts`
Förväntat: FAIL — `applySlideDecision is not a function` / saknad export.

- [ ] **Step 3: Implementera**

I `draft-logic.ts`, direkt efter `applyDecision`:

```ts
/**
 * Slide-nivå-bulk: alla slidens slots får samma beslut (fast-slide-knappen i
 * wizarden). "skipped" = markera sliden fast (originaltexten behålls —
 * buildInjections instrumenterar bara confirmed); "pending" = ångra, rutorna
 * kräver nytt ställningstagande (tidigare beslut återskapas inte). Ren
 * funktion, återanvänder applyDecision per slot så validering delas.
 */
export function applySlideDecision(
  draft: OnboardingDraft,
  source: number,
  decision: "skipped" | "pending",
): ApplyResult {
  const slideSlots = draft.slots.filter((s) => s.source === source);
  if (slideSlots.length === 0) {
    return { ok: false, error: `slide ${source} har inga textrutor` };
  }
  let current = draft;
  for (const slot of slideSlots) {
    const result = applyDecision(current, {
      source: slot.source,
      shapeIndex: slot.shapeIndex,
      decision,
    });
    if (!result.ok) return result;
    current = result.draft;
  }
  return { ok: true, draft: current };
}
```

- [ ] **Step 4: Kör testet — ska passera**

Kör: `npm test -- --run src/lib/pptx-template/onboarding/__tests__/draft-logic.test.ts`
Förväntat: PASS (alla, inkl. befintliga).

- [ ] **Step 5: Commit**

```powershell
git add src/lib/pptx-template/onboarding/draft-logic.ts src/lib/pptx-template/onboarding/__tests__/draft-logic.test.ts
git commit -m "feat(onboarding): applySlideDecision — bulk decision for a slide's slots"
```

---

### Task 2: PATCH-routen tar slide-beslut

**Files:**
- Modify: `src/lib/api-schemas.ts` (efter `OnboardingDecisionSchema`, ~rad 139)
- Modify: `src/app/api/templates/[id]/onboarding/route.ts` (rad 5, 8, 111, 131)
- Test: `src/lib/pptx-template/onboarding/__tests__/onboarding-patch-schema.test.ts` (create)

**Interfaces:**
- Consumes: `applySlideDecision` (Task 1), `OnboardingDecisionSchema` (befintlig), `parseBody` (befintlig).
- Produces: PATCH `/api/templates/[id]/onboarding` accepterar NU ÄVEN body `{ slide: number, decision: "skipped" | "pending" }` och svarar `{ draft }` som förut — Task 3:s wizard-klient anropar den formen.

- [ ] **Step 1: Skriv failande test**

Skapa `src/lib/pptx-template/onboarding/__tests__/onboarding-patch-schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { OnboardingPatchSchema } from "@/lib/api-schemas";

describe("OnboardingPatchSchema", () => {
  it("accepterar slot-beslut (befintlig form)", () => {
    const r = OnboardingPatchSchema.safeParse({ source: 2, shapeIndex: 1, decision: "confirmed" });
    expect(r.success).toBe(true);
  });

  it("accepterar slide-beslut", () => {
    const r = OnboardingPatchSchema.safeParse({ slide: 2, decision: "skipped" });
    expect(r.success).toBe(true);
    if (r.success) expect("slide" in r.data).toBe(true);
  });

  it("avvisar confirmed som slide-beslut (fast slide kan bara skippas/ångras)", () => {
    expect(OnboardingPatchSchema.safeParse({ slide: 2, decision: "confirmed" }).success).toBe(false);
  });

  it("avvisar slide-beslut utan slide-nummer", () => {
    expect(OnboardingPatchSchema.safeParse({ decision: "skipped" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Kör testet — ska faila**

Kör: `npm test -- --run src/lib/pptx-template/onboarding/__tests__/onboarding-patch-schema.test.ts`
Förväntat: FAIL — `OnboardingPatchSchema` finns inte.

- [ ] **Step 3: Implementera schemat**

I `api-schemas.ts`, direkt efter `OnboardingDecisionSchema`:

```ts
/** Slide-nivå-beslut (fast slide-knappen): alla slidens rutor får samma beslut.
 *  Bara skipped/pending — confirmed kräver ställningstagande per ruta. */
export const OnboardingSlideDecisionSchema = z.object({
  slide: z.number().int().positive(),
  decision: z.enum(["skipped", "pending"]),
});

/** PATCH-body: ett slot-beslut ELLER ett slide-beslut. Slot-formen först —
 *  den är den vanliga och har disjunkta obligatoriska nycklar. */
export const OnboardingPatchSchema = z.union([
  OnboardingDecisionSchema,
  OnboardingSlideDecisionSchema,
]);
```

- [ ] **Step 4: Koppla in i routen**

I `route.ts`:

Rad 5 — byt import:
```ts
import { OnboardingPatchSchema } from "@/lib/api-schemas";
```

Rad 8 — utöka import:
```ts
import { applyDecision, applySlideDecision } from "@/lib/pptx-template/onboarding/draft-logic";
```

Rad 111 — byt schema:
```ts
  const parsed = await parseBody(request, OnboardingPatchSchema);
```

Rad 131 — diskriminera på formen:
```ts
  const result =
    "slide" in parsed.data
      ? applySlideDecision(draft, parsed.data.slide, parsed.data.decision)
      : applyDecision(draft, parsed.data);
```

- [ ] **Step 5: Kör test + typecheck**

Kör: `npm test -- --run src/lib/pptx-template/onboarding/__tests__/onboarding-patch-schema.test.ts` → PASS
Kör: `npx tsc --noEmit` → 0 fel.

- [ ] **Step 6: Commit**

```powershell
git add src/lib/api-schemas.ts "src/app/api/templates/[id]/onboarding/route.ts" src/lib/pptx-template/onboarding/__tests__/onboarding-patch-schema.test.ts
git commit -m "feat(onboarding): PATCH accepts slide-level bulk decision"
```

---

### Task 3: Wizard-knappen "Markera hela sliden som fast"

**Files:**
- Modify: `src/components/onboarding/OnboardingWizard.tsx`
- Test: `src/components/onboarding/__tests__/OnboardingWizard.test.tsx` (nytt test sist)

**Interfaces:**
- Consumes: PATCH-formen `{ slide, decision }` från Task 2 (svarar `{ draft }`).
- Produces: inget nytt API — ren UI.

- [ ] **Step 1: Skriv failande test**

Sist i `OnboardingWizard.test.tsx` (filen har redan `render, screen, waitFor` — lägg till `fireEvent` i importen från `@testing-library/react`; `draft`-fixturen överst i filen har EN slot på slide 2):

```tsx
  it("fast slide-knappen bulk-skippar slidens rutor och visar ångra-läget", async () => {
    const skippedDraft: OnboardingDraft = {
      ...draft,
      slots: draft.slots.map((s) => ({ ...s, decision: "skipped" as const })),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: "draft", name: "kundmall", version: 1, draft }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ draft: skippedDraft }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<OnboardingWizard templateId="t-1" />);
    const btn = await screen.findByRole("button", { name: /markera hela sliden som fast/i });
    fireEvent.click(btn);

    await waitFor(() =>
      expect(screen.getByText(/sliden är markerad som fast/i)).toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/templates/t-1/onboarding",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ slide: 2, decision: "skipped" }),
      }),
    );
    expect(screen.getByRole("button", { name: /ångra/i })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Kör testet — ska faila**

Kör: `npm test -- --run src/components/onboarding/__tests__/OnboardingWizard.test.tsx`
Förväntat: FAIL — knappen finns inte.

- [ ] **Step 3: Implementera**

I `OnboardingWizard.tsx`:

(a) Efter `decide()`-funktionen (~rad 103), lägg till:

```tsx
  // Fast slide = alla rutor skippade → originaltexten behålls i alla anbud.
  // Ångra sätter pending (tidigare beslut återskapas inte — utkastet minns dem inte).
  async function decideSlide(decision: "skipped" | "pending") {
    if (!slide) return;
    setSaving(true);
    setUiError(null);
    try {
      const res = await fetch(`/api/templates/${templateId}/onboarding`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slide: slide.source, decision }),
      });
      const body = await res.json();
      if (!res.ok) { setUiError(body.error ?? "kunde inte spara beslutet"); return; }
      setData((d) => (d ? { ...d, draft: body.draft } : d));
    } catch {
      setUiError("nätverksfel — försök igen");
    } finally {
      setSaving(false);
    }
  }
```

(b) Efter `const pending = ...` (~rad 216), lägg till:

```tsx
  const slideIsFast =
    slotsOnSlide.length > 0 && slotsOnSlide.every((s) => s.decision === "skipped");
```

(c) I JSX:et, mellan navigeringsremsan (`</div>` som stänger `flex items-center gap-2 flex-wrap`) och grid-diven, lägg in:

```tsx
      <div className="flex items-center gap-3">
        {slideIsFast ? (
          <>
            <span className="text-xs text-ink-soft">
              Sliden är markerad som fast — originaltexten behålls i alla anbud.
            </span>
            <button type="button" disabled={saving} onClick={() => decideSlide("pending")}
              className="text-xs underline text-ink-mute hover:text-ink disabled:opacity-50">
              Ångra (rutorna blir obeslutade)
            </button>
          </>
        ) : (
          <button type="button" disabled={saving} onClick={() => decideSlide("skipped")}
            title="Alla rutor på sliden skippas — slidens originaltext behålls oförändrad i varje anbud"
            className="border border-rule py-1.5 px-3 rounded text-xs font-medium hover:border-accent disabled:opacity-50">
            Markera hela sliden som fast
          </button>
        )}
      </div>
```

- [ ] **Step 4: Kör testet — ska passera**

Kör: `npm test -- --run src/components/onboarding/__tests__/OnboardingWizard.test.tsx`
Förväntat: PASS (alla, inkl. befintliga).

- [ ] **Step 5: Commit**

```powershell
git add src/components/onboarding/OnboardingWizard.tsx src/components/onboarding/__tests__/OnboardingWizard.test.tsx
git commit -m "feat(onboarding): mark-whole-slide-as-fixed button in wizard"
```

---

### Task 4: SummaryView listar fasta slides

**Files:**
- Modify: `src/components/onboarding/SummaryView.tsx`
- Test: `src/components/onboarding/__tests__/SummaryView.test.tsx` (nytt test sist)

**Interfaces:**
- Consumes: `slots: DraftSlot[]` (befintlig prop) — beräknar själv.
- Produces: inget nytt API.

- [ ] **Step 1: Skriv failande test**

Sist i `SummaryView.test.tsx` (filen har `makeSlot`-hjälparen):

```tsx
  it("listar slides där alla rutor är skippade som fasta", () => {
    const slots = [
      makeSlot({ source: 2, shapeIndex: 1, decision: "confirmed", token: "{A}" }),
      makeSlot({ source: 3, shapeIndex: 1, decision: "skipped", token: "{B}" }),
      makeSlot({ source: 3, shapeIndex: 2, decision: "skipped", token: "{C}" }),
    ];
    render(
      <SummaryView slots={slots} confirmed={1} saving={false} uiError={null} onBack={vi.fn()} onComplete={vi.fn()} />,
    );
    expect(screen.getByText(/fasta slides/i)).toHaveTextContent("#3");
    expect(screen.getByText(/fasta slides/i)).not.toHaveTextContent("#2");
  });

  it("visar ingen fasta slides-rad när ingen slide är helt skippad", () => {
    const slots = [makeSlot({ source: 2, shapeIndex: 1, decision: "confirmed" })];
    render(
      <SummaryView slots={slots} confirmed={1} saving={false} uiError={null} onBack={vi.fn()} onComplete={vi.fn()} />,
    );
    expect(screen.queryByText(/fasta slides/i)).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Kör testet — ska faila**

Kör: `npm test -- --run src/components/onboarding/__tests__/SummaryView.test.tsx`
Förväntat: FAIL.

- [ ] **Step 3: Implementera**

I `SummaryView.tsx`, inuti komponenten efter `const pending = ...`:

```tsx
  // Slides där ALLA rutor är skippade = fasta (originaltext behålls) — visas
  // explicit så beslutet syns innan onboardingen låses.
  const bySlide = new Map<number, DraftSlot[]>();
  for (const s of slots) {
    const list = bySlide.get(s.source) ?? [];
    list.push(s);
    bySlide.set(s.source, list);
  }
  const fastSlides = [...bySlide.entries()]
    .filter(([, list]) => list.every((s) => s.decision === "skipped"))
    .map(([source]) => source)
    .sort((a, b) => a - b);
```

I JSX:et, efter pending-varningen (före `<table>`):

```tsx
      {fastSlides.length > 0 && (
        <p className="text-sm text-ink-soft">
          Fasta slides (originaltexten behålls i alla anbud): {fastSlides.map((n) => `#${n}`).join(", ")}
        </p>
      )}
```

- [ ] **Step 4: Kör testet — ska passera**

Kör: `npm test -- --run src/components/onboarding/__tests__/SummaryView.test.tsx` → PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/components/onboarding/SummaryView.tsx src/components/onboarding/__tests__/SummaryView.test.tsx
git commit -m "feat(onboarding): summary lists fixed slides before complete"
```

---

### Task 5: `slot-meta.ts` — join, filtrering, gruppering

**Files:**
- Create: `src/lib/bid-generator/short-field.ts`
- Modify: `src/lib/bid-generator/bundles/generic-prose.ts` (rad 62–69)
- Create: `src/lib/bid-editor/slot-meta.ts`
- Test: `src/lib/bid-editor/__tests__/slot-meta.test.ts` (create; katalogen `src/lib/bid-editor/` finns — `field-path.ts` bor där; skapa `__tests__` om den saknas)

**Interfaces:**
- Consumes: `TemplateProfile` (`@/lib/pptx-template/template-profile`), `BidSection` (`@/lib/types`).
- Produces (Task 6–9 använder exakt dessa):

```ts
export interface SlotMetaEntry { slide: number; shortField: boolean; intent: string; budgetChars?: number }
export type SlotMeta = Record<string, SlotMetaEntry>;
export function buildSlotMeta(profile: TemplateProfile): SlotMeta;
export interface SlideGroup { source: number; sections: BidSection[] }
export interface GroupedSections { slides: SlideGroup[]; other: BidSection[]; hiddenShortFields: number }
export function groupSectionsBySlide(sections: BidSection[], meta: SlotMeta): GroupedSections;
```

**VIKTIGT — klientsäkerhet:** `slot-meta.ts` importeras av klientkomponenter. Den får INTE importera `bundles/generic-prose.ts` (drar in ai-client/server-kod i klientbundeln). Därför flyttas kortfälts-konstanten till en egen beroendefri modul först.

- [ ] **Step 1: Bryt ut kortfälts-konstanten**

Skapa `src/lib/bid-generator/short-field.ts`:

```ts
/** Fields at or under this budget are VALUES (a name, a date, a number), not
 *  prose. Shared by the generator (kortfältsregeln — value or empty, never
 *  apology prose) and the bid editor (short fields carry no UI surface).
 *  Dependency-free on purpose: imported by client components.
 *  Design docs 2026-07-14 (calibration loop) + 2026-07-15 (editor slim). */
export const SHORT_FIELD_MAX_CHARS = 80;

export function isShortBudget(budgetChars: number | undefined): boolean {
  return budgetChars !== undefined && budgetChars <= SHORT_FIELD_MAX_CHARS;
}
```

I `bundles/generic-prose.ts` ersätt raderna 62–69 (konstanten + `isShortField`) med:

```ts
export { SHORT_FIELD_MAX_CHARS };

export function isShortField(slot: GenericProseSlot): boolean {
  return isShortBudget(slot.budgetChars);
}
```

och lägg till i filens imports (import + lokal bindning — filen refererar konstanten
i kommentarer/ev. kod, `export ... from` skapar INGEN lokal bindning):

```ts
import { isShortBudget, SHORT_FIELD_MAX_CHARS } from "../short-field";
```

Kör: `npm test -- --run src/lib/bid-generator` och `npx tsc --noEmit`
Förväntat: PASS / 0 fel — refaktorn är beteendeneutral.

- [ ] **Step 2: Skriv failande test för slot-meta**

Skapa `src/lib/bid-editor/__tests__/slot-meta.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildSlotMeta, groupSectionsBySlide } from "../slot-meta";
import { parseTemplateProfile } from "@/lib/pptx-template/template-profile";
import type { BidSection } from "@/lib/types";

const profile = parseTemplateProfile({
  profileVersion: 1,
  templateId: "11111111-1111-1111-1111-111111111111",
  name: "kundmall",
  version: 1,
  slides: [
    {
      source: 2,
      capability: "generic-prose",
      slots: [
        { placeholder: "{Metod}", capability: "generic-prose", format: "prose", intent: "Beskriv metoden", status: "generic", budgetChars: 540 },
        { placeholder: "{Diarienummer}", capability: "generic-prose", format: "prose", intent: "Diarienummer", status: "generic", budgetChars: 40 },
      ],
    },
    {
      source: 5,
      capability: "generic-prose",
      slots: [
        { placeholder: "{Vision}", capability: "generic-prose", format: "prose", intent: "", status: "generic" },
      ],
    },
    { source: 7, capability: "static", slots: [] },
  ],
});

function proseSection(key: string, placeholder: string, text = "x"): BidSection {
  return {
    type: "ai", key, title: key, generatedAt: "2026-07-15T00:00:00Z",
    content: { format: "generic-prose", placeholder, text },
  } as BidSection;
}

describe("buildSlotMeta", () => {
  it("mappar placeholder → slide/shortField/intent/budget", () => {
    const meta = buildSlotMeta(profile);
    expect(meta["{Metod}"]).toEqual({ slide: 2, shortField: false, intent: "Beskriv metoden", budgetChars: 540 });
    expect(meta["{Diarienummer}"].shortField).toBe(true);
    expect(meta["{Vision}"]).toEqual({ slide: 5, shortField: false, intent: "" });
  });
});

describe("groupSectionsBySlide", () => {
  it("grupperar per slide i stigande ordning, döljer kortfält, okänd placeholder → other", () => {
    const sections = [
      proseSection("s-vision", "{Vision}"),
      proseSection("s-metod", "{Metod}"),
      proseSection("s-dnr", "{Diarienummer}"),
      proseSection("s-okand", "{Gammal ruta}"),
    ];
    const grouped = groupSectionsBySlide(sections, buildSlotMeta(profile));
    expect(grouped.slides.map((g) => g.source)).toEqual([2, 5]);
    expect(grouped.slides[0].sections.map((s) => s.key)).toEqual(["s-metod"]);
    expect(grouped.hiddenShortFields).toBe(1);
    expect(grouped.other.map((s) => s.key)).toEqual(["s-okand"]);
  });

  it("icke-generic-format och sektion utan content → other (inget döljs tyst)", () => {
    const weird = { type: "ai", key: "s-x", title: "x", generatedAt: "" } as BidSection;
    const grouped = groupSectionsBySlide([weird], buildSlotMeta(profile));
    expect(grouped.other.map((s) => s.key)).toEqual(["s-x"]);
  });

  it("slide vars enda rutor är kortfält får ingen grupp", () => {
    const grouped = groupSectionsBySlide([proseSection("s-dnr", "{Diarienummer}")], buildSlotMeta(profile));
    expect(grouped.slides).toEqual([]);
    expect(grouped.hiddenShortFields).toBe(1);
  });
});
```

Kör: `npm test -- --run src/lib/bid-editor/__tests__/slot-meta.test.ts`
Förväntat: FAIL — modulen finns inte.

- [ ] **Step 3: Implementera `slot-meta.ts`**

```ts
import type { BidSection } from "@/lib/types";
import type { TemplateProfile } from "@/lib/pptx-template/template-profile";
import { isShortBudget } from "@/lib/bid-generator/short-field";

/**
 * Slot-metadata ur mallprofilen — byggs server-side på bid-sidan, konsumeras av
 * editorn (gruppering per slide, kortfältsfiltrering, intent-etiketter,
 * teckenräknare). Plain object: korsar server→client-propgränsen.
 * Design: notes/2026-07-15-bid-editor-slim-design.md.
 */
export interface SlotMetaEntry {
  slide: number;
  shortField: boolean;
  intent: string;
  budgetChars?: number;
}
export type SlotMeta = Record<string, SlotMetaEntry>;

export function buildSlotMeta(profile: TemplateProfile): SlotMeta {
  const meta: SlotMeta = {};
  for (const slide of profile.slides) {
    for (const slot of slide.slots) {
      if (slot.capability !== "generic-prose") continue;
      meta[slot.placeholder] = {
        slide: slide.source,
        shortField: isShortBudget(slot.budgetChars),
        intent: slot.intent,
        ...(slot.budgetChars !== undefined ? { budgetChars: slot.budgetChars } : {}),
      };
    }
  }
  return meta;
}

export interface SlideGroup {
  source: number;
  sections: BidSection[];
}

export interface GroupedSections {
  slides: SlideGroup[];
  /** Sektioner utan träff i metan (okänd placeholder, oväntat format, saknat
   *  content) — visas synligt sist under "Övriga rutor", döljs ALDRIG tyst. */
  other: BidSection[];
  /** Antal dolda kortfälts-sektioner (kvar i state, sparas och exporteras). */
  hiddenShortFields: number;
}

export function groupSectionsBySlide(
  sections: BidSection[],
  meta: SlotMeta,
): GroupedSections {
  const bySlide = new Map<number, BidSection[]>();
  const other: BidSection[] = [];
  let hiddenShortFields = 0;
  for (const section of sections) {
    const content = section.content;
    if (!content || content.format !== "generic-prose") {
      other.push(section);
      continue;
    }
    const entry = meta[content.placeholder];
    if (!entry) {
      other.push(section);
      continue;
    }
    if (entry.shortField) {
      hiddenShortFields += 1;
      continue;
    }
    const list = bySlide.get(entry.slide) ?? [];
    list.push(section);
    bySlide.set(entry.slide, list);
  }
  const slides = [...bySlide.entries()]
    .sort(([a], [b]) => a - b)
    .map(([source, secs]) => ({ source, sections: secs }));
  return { slides, other, hiddenShortFields };
}
```

- [ ] **Step 4: Kör test — ska passera**

Kör: `npm test -- --run src/lib/bid-editor/__tests__/slot-meta.test.ts` → PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/bid-generator/short-field.ts src/lib/bid-generator/bundles/generic-prose.ts src/lib/bid-editor/slot-meta.ts src/lib/bid-editor/__tests__/slot-meta.test.ts
git commit -m "feat(bid-editor): slot-meta — profile join, short-field filter, slide grouping"
```

---

### Task 6: `SlideNav`

**Files:**
- Create: `src/components/bid-editor/SlideNav.tsx`
- Test: `src/components/bid-editor/__tests__/SlideNav.test.tsx` (create)

**Interfaces:**
- Consumes: `SlideGroup` från Task 5.
- Produces: `<SlideNav groups otherCount activeSlide onSlideClick />` — Task 9 monterar den; `onSlideClick(source: number | "other")`.

- [ ] **Step 1: Skriv failande test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SlideNav } from "../SlideNav";
import type { SlideGroup } from "@/lib/bid-editor/slot-meta";
import type { BidSection } from "@/lib/types";

const section = { type: "ai", key: "k", title: "t", generatedAt: "" } as BidSection;
const groups: SlideGroup[] = [
  { source: 2, sections: [section, section] },
  { source: 5, sections: [section] },
];

describe("SlideNav", () => {
  it("listar slides med rutantal och anropar onSlideClick", () => {
    const onClick = vi.fn();
    render(<SlideNav groups={groups} otherCount={0} activeSlide={null} onSlideClick={onClick} />);
    expect(screen.getByRole("button", { name: /slide 2/i })).toHaveTextContent("2 rutor");
    expect(screen.getByRole("button", { name: /slide 5/i })).toHaveTextContent("1 ruta");
    fireEvent.click(screen.getByRole("button", { name: /slide 5/i }));
    expect(onClick).toHaveBeenCalledWith(5);
  });

  it("visar Övriga rutor bara när de finns", () => {
    const { rerender } = render(<SlideNav groups={groups} otherCount={0} activeSlide={null} onSlideClick={vi.fn()} />);
    expect(screen.queryByText(/övriga rutor/i)).not.toBeInTheDocument();
    rerender(<SlideNav groups={groups} otherCount={3} activeSlide={null} onSlideClick={vi.fn()} />);
    expect(screen.getByText(/övriga rutor/i)).toBeInTheDocument();
  });
});
```

Kör: `npm test -- --run src/components/bid-editor/__tests__/SlideNav.test.tsx` → FAIL (komponenten saknas).

- [ ] **Step 2: Implementera**

`src/components/bid-editor/SlideNav.tsx`:

```tsx
"use client";

import type { SlideGroup } from "@/lib/bid-editor/slot-meta";

/** Slide-navigering för profil-drivna (onboardade) anbud — ersätter SectionNav
 *  där: rutor är platshållar-bundna, så omordning/borttagning finns inte. */
interface SlideNavProps {
  groups: SlideGroup[];
  otherCount: number;
  activeSlide: number | "other" | null;
  onSlideClick: (source: number | "other") => void;
}

function itemClass(active: boolean): string {
  return `w-full text-left flex items-center gap-2 px-3 py-2 text-sm rounded transition-colors ${
    active ? "bg-paper-2 font-medium" : "hover:bg-paper-2"
  }`;
}

export function SlideNav({ groups, otherCount, activeSlide, onSlideClick }: SlideNavProps) {
  return (
    <nav className="space-y-0.5">
      {groups.map((g) => (
        <button key={g.source} type="button" onClick={() => onSlideClick(g.source)}
          className={itemClass(activeSlide === g.source)}>
          <span className="truncate flex-1">Slide {g.source}</span>
          <span className="text-[10px] text-ink-mute">
            {g.sections.length} {g.sections.length === 1 ? "ruta" : "rutor"}
          </span>
        </button>
      ))}
      {otherCount > 0 && (
        <button type="button" onClick={() => onSlideClick("other")}
          className={itemClass(activeSlide === "other")}>
          <span className="truncate flex-1">Övriga rutor</span>
          <span className="text-[10px] text-ink-mute">{otherCount}</span>
        </button>
      )}
    </nav>
  );
}
```

- [ ] **Step 3: Kör test — PASS. Commit**

```powershell
git add src/components/bid-editor/SlideNav.tsx src/components/bid-editor/__tests__/SlideNav.test.tsx
git commit -m "feat(bid-editor): SlideNav — slide-level navigation for profile-driven bids"
```

---

### Task 7: generic-prose-renderern — intent-etikett + teckenräknare

**Files:**
- Modify: `src/components/bid-editor/renderers/index.tsx` (props + `case "generic-prose"`, rad 26–31 och 161–174)
- Test: `src/components/bid-editor/__tests__/generic-prose-meta.test.tsx` (create)

**Interfaces:**
- Consumes: inget nytt.
- Produces: `SectionRenderer` tar ny valfri prop `meta?: { intent: string; budgetChars?: number }` — Task 8 skickar den.

- [ ] **Step 1: Skriv failande test**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionRenderer } from "../renderers";
import type { BidSection, StyleGuide } from "@/lib/types";

const style = { colors: {}, font: "Calibri", logoUrl: "" } as unknown as StyleGuide;

function section(text: string): BidSection {
  return {
    type: "ai", key: "k", title: "t", generatedAt: "",
    content: { format: "generic-prose", placeholder: "{Metod}", text },
  } as BidSection;
}

describe("SectionRenderer generic-prose med meta", () => {
  it("visar intent som etikett och räknare mot budgeten", () => {
    render(
      <SectionRenderer section={section("abc")} style={style}
        meta={{ intent: "Beskriv metoden", budgetChars: 540 }} />,
    );
    expect(screen.getByText("Beskriv metoden")).toBeInTheDocument();
    expect(screen.getByText("3/540")).toBeInTheDocument();
  });

  it("markerar överskriden budget", () => {
    render(
      <SectionRenderer section={section("abcdef")} style={style}
        meta={{ intent: "Kort", budgetChars: 5 }} />,
    );
    expect(screen.getByText("6/5")).toHaveClass("text-red-600");
  });

  it("utan meta: placeholder som etikett, ingen räknare (dagens beteende)", () => {
    render(<SectionRenderer section={section("abc")} style={style} />);
    expect(screen.getByText("{Metod}")).toBeInTheDocument();
    expect(screen.queryByText(/\/\d+$/)).not.toBeInTheDocument();
  });

  it("tom intent faller tillbaka till placeholder", () => {
    render(
      <SectionRenderer section={section("abc")} style={style}
        meta={{ intent: "  " }} />,
    );
    expect(screen.getByText("{Metod}")).toBeInTheDocument();
  });
});
```

Kör: `npm test -- --run src/components/bid-editor/__tests__/generic-prose-meta.test.tsx` → FAIL (meta-prop saknas).

- [ ] **Step 2: Implementera**

I `renderers/index.tsx`:

(a) Utöka props (rad 26–33):

```tsx
interface SectionRendererProps {
  section: BidSection;
  style: StyleGuide;
  onSectionChange?: (updated: BidSection) => void;
  budgets?: FieldBudgets;
  /** Slot-metadata för generic-prose (profil-drivna anbud): intent-etikett +
   *  teckenräknare mot budgetChars. Utan meta = dagens beteende exakt. */
  meta?: { intent: string; budgetChars?: number };
}

export function SectionRenderer({ section, style, onSectionChange, budgets, meta }: SectionRendererProps) {
```

(b) Ersätt `case "generic-prose":`-blocket (rad 161–174):

```tsx
    case "generic-prose": {
      // Fallback prose for a non-specialised slot (template-upload slice 4).
      // With meta (profile-driven bids): intent label + char counter vs budget.
      const label = meta?.intent.trim() ? meta.intent : content.placeholder;
      const over =
        meta?.budgetChars !== undefined && content.text.length > meta.budgetChars;
      return (
        <div className="space-y-1">
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-xs text-neutral-500">{label}</div>
            {meta?.budgetChars !== undefined && (
              <div className={`text-[10px] tabular-nums ${over ? "text-red-600 font-medium" : "text-neutral-400"}`}>
                {content.text.length}/{meta.budgetChars}
              </div>
            )}
          </div>
          <textarea
            className={`w-full min-h-[8rem] rounded border p-2 text-sm ${over ? "border-red-400" : "border-neutral-300"}`}
            value={content.text}
            readOnly={!onSectionChange}
            onChange={onSectionChange ? (e) => updateContent({ text: e.target.value }) : undefined}
          />
        </div>
      );
    }
```

- [ ] **Step 3: Kör test — PASS. Kör även `npx tsc --noEmit` → 0 fel. Commit**

```powershell
git add src/components/bid-editor/renderers/index.tsx src/components/bid-editor/__tests__/generic-prose-meta.test.tsx
git commit -m "feat(bid-editor): intent label + char counter on generic-prose sections"
```

---

### Task 8: `SlideGroupedSections`

**Files:**
- Create: `src/components/bid-editor/SlideGroupedSections.tsx`
- Test: `src/components/bid-editor/__tests__/SlideGroupedSections.test.tsx` (create)

**Interfaces:**
- Consumes: `GroupedSections`, `SlotMeta` (Task 5); `SectionRenderer` med `meta`-prop (Task 7).
- Produces: `<SlideGroupedSections grouped slotMeta style onSectionChange registerSlideRef onActivate />` — Task 9 monterar. `registerSlideRef(source: number | "other", el: HTMLDivElement | null)` speglar BidEditors ref-mönster.

- [ ] **Step 1: Skriv failande test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SlideGroupedSections } from "../SlideGroupedSections";
import { groupSectionsBySlide, type SlotMeta } from "@/lib/bid-editor/slot-meta";
import type { BidSection, StyleGuide } from "@/lib/types";

const style = { colors: {}, font: "Calibri", logoUrl: "" } as unknown as StyleGuide;
const meta: SlotMeta = {
  "{Metod}": { slide: 2, shortField: false, intent: "Beskriv metoden", budgetChars: 540 },
  "{Dnr}": { slide: 2, shortField: true, intent: "Diarienummer", budgetChars: 40 },
};

function proseSection(key: string, placeholder: string): BidSection {
  return {
    type: "ai", key, title: key, generatedAt: "",
    content: { format: "generic-prose", placeholder, text: "x" },
  } as BidSection;
}

describe("SlideGroupedSections", () => {
  it("renderar sliderubrik, döljer kortfält, visar okända under Övriga rutor", () => {
    const sections = [
      proseSection("s-metod", "{Metod}"),
      proseSection("s-dnr", "{Dnr}"),
      proseSection("s-okand", "{Okänd}"),
    ];
    const grouped = groupSectionsBySlide(sections, meta);
    render(
      <SlideGroupedSections grouped={grouped} slotMeta={meta} style={style}
        onSectionChange={vi.fn()} registerSlideRef={vi.fn()} onActivate={vi.fn()} />,
    );
    expect(screen.getByText(/slide 2 · 1 ruta/i)).toBeInTheDocument();
    expect(screen.getByText("Beskriv metoden")).toBeInTheDocument();
    expect(screen.queryByText("Diarienummer")).not.toBeInTheDocument();
    expect(screen.getByText(/övriga rutor · 1/i)).toBeInTheDocument();
    expect(screen.getByText("{Okänd}")).toBeInTheDocument();
  });
});
```

Kör: `npm test -- --run src/components/bid-editor/__tests__/SlideGroupedSections.test.tsx` → FAIL.

- [ ] **Step 2: Implementera**

`src/components/bid-editor/SlideGroupedSections.tsx`:

```tsx
"use client";

import type { BidSection, StyleGuide } from "@/lib/types";
import type { GroupedSections, SlotMeta } from "@/lib/bid-editor/slot-meta";
import { SectionRenderer } from "./renderers";

/** Grupperad huvudvy för profil-drivna anbud: prosa-rutor under sliderubriker i
 *  mallens ordning; kortfält är redan bortfiltrerade (groupSectionsBySlide);
 *  sektioner utan profil-träff visas synligt sist — aldrig tyst dolda. */
interface SlideGroupedSectionsProps {
  grouped: GroupedSections;
  slotMeta: SlotMeta;
  style: StyleGuide;
  onSectionChange: (key: string, updated: BidSection) => void;
  registerSlideRef: (source: number | "other", el: HTMLDivElement | null) => void;
  onActivate: (source: number | "other") => void;
}

function groupHeading(text: string) {
  return (
    <h3 className="text-xs font-mono font-bold uppercase tracking-wide text-ink-mute border-b border-rule pb-1">
      {text}
    </h3>
  );
}

export function SlideGroupedSections({
  grouped, slotMeta, style, onSectionChange, registerSlideRef, onActivate,
}: SlideGroupedSectionsProps) {
  return (
    <>
      {grouped.slides.map((group) => (
        <div key={group.source} ref={(el) => registerSlideRef(group.source, el)}
          className="space-y-4" onClick={() => onActivate(group.source)}>
          {groupHeading(
            `Slide ${group.source} · ${group.sections.length} ${group.sections.length === 1 ? "ruta" : "rutor"}`,
          )}
          {group.sections.map((section) => {
            const m = section.content?.format === "generic-prose"
              ? slotMeta[section.content.placeholder]
              : undefined;
            return (
              <SectionRenderer key={section.key} section={section} style={style}
                meta={m ? { intent: m.intent, budgetChars: m.budgetChars } : undefined}
                onSectionChange={(updated) => onSectionChange(section.key, updated)} />
            );
          })}
        </div>
      ))}
      {grouped.other.length > 0 && (
        <div ref={(el) => registerSlideRef("other", el)} className="space-y-4"
          onClick={() => onActivate("other")}>
          {groupHeading(`Övriga rutor · ${grouped.other.length}`)}
          {grouped.other.map((section) => (
            <SectionRenderer key={section.key} section={section} style={style}
              onSectionChange={(updated) => onSectionChange(section.key, updated)} />
          ))}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 3: Kör test — PASS. Commit**

```powershell
git add src/components/bid-editor/SlideGroupedSections.tsx src/components/bid-editor/__tests__/SlideGroupedSections.test.tsx
git commit -m "feat(bid-editor): slide-grouped section view for profile-driven bids"
```

---

### Task 9: Koppla ihop — `page.tsx` + `BidEditor`

**Files:**
- Modify: `src/app/bids/[id]/page.tsx`
- Modify: `src/components/bid-editor/BidEditor.tsx`

**Interfaces:**
- Consumes: `loadTemplateProfile` (`@/lib/pptx-template/profile-store`), `isAllGenericProfile` (`@/lib/pptx-template/template-profile`), `buildSlotMeta`/`groupSectionsBySlide`/`SlotMeta` (Task 5), `SlideNav` (Task 6), `SlideGroupedSections` (Task 8).
- Produces: `BidEditor` tar ny prop `slotMeta: SlotMeta | null`.

- [ ] **Step 1: `page.tsx` — bygg slotMeta server-side**

Nya imports:

```tsx
import { loadTemplateProfile } from "@/lib/pptx-template/profile-store";
import { isAllGenericProfile } from "@/lib/pptx-template/template-profile";
import { buildSlotMeta, type SlotMeta } from "@/lib/bid-editor/slot-meta";
```

Ersätt raden `const template = await loadTemplateForBid((bid.template_id as string | null) ?? null);` med:

```tsx
  const templateId = (bid.template_id as string | null) ?? null;
  const template = await loadTemplateForBid(templateId);

  // Profil-join för onboardade mallar: editorn får slide/kortfält/intent per
  // placeholder (design 2026-07-15). Saknad/ej-generic profil eller läsfel ⇒
  // null ⇒ dagens platta editor — fallbacken är alltid den synliga vägen.
  let slotMeta: SlotMeta | null = null;
  if (templateId) {
    try {
      const profile = await loadTemplateProfile(templateId);
      if (profile && isAllGenericProfile(profile)) {
        slotMeta = buildSlotMeta(profile);
      }
    } catch (err) {
      console.error("slotMeta: kunde inte läsa mallprofilen", err);
    }
  }
```

och lägg till `slotMeta={slotMeta}` i `<BidEditor ...>`-anropet.

- [ ] **Step 2: `BidEditor.tsx` — grupperad vy**

(a) Imports (lägg till):

```tsx
import { useMemo } from "react"; // utöka befintlig react-import
import { groupSectionsBySlide, type SlotMeta } from "@/lib/bid-editor/slot-meta";
import { SlideNav } from "./SlideNav";
import { SlideGroupedSections } from "./SlideGroupedSections";
```

(b) Props: lägg till i `BidEditorProps` och destruktureringen:

```tsx
  /** Slot-metadata från mallprofilen (onboardade mallar) — null för inbyggda
   *  mallens anbud ⇒ dagens platta sektionsvy. */
  slotMeta: SlotMeta | null;
```

(c) State + gruppering, efter `const [activeSectionKey, ...]`:

```tsx
  const [activeSlide, setActiveSlide] = useState<number | "other" | null>(null);
  const slideRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const grouped = useMemo(
    () => (slotMeta ? groupSectionsBySlide(sections, slotMeta) : null),
    [sections, slotMeta],
  );

  function scrollToSlide(source: number | "other") {
    setActiveSlide(source);
    slideRefs.current[String(source)]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
```

(d) Vänsterpanelen: ersätt `<SectionNav .../>`-blocket med:

```tsx
        {grouped ? (
          <SlideNav
            groups={grouped.slides}
            otherCount={grouped.other.length}
            activeSlide={activeSlide}
            onSlideClick={scrollToSlide}
          />
        ) : (
          <SectionNav
            sections={sections}
            activeSectionKey={activeSectionKey}
            onSectionClick={scrollToSection}
            onReorder={handleReorder}
            onRemoveSection={handleRemoveSection}
          />
        )}
```

och räknar-raden i panelhuvudet: byt `{sections.length}` mot `{grouped ? grouped.slides.length : sections.length}` samt rubriken `Sektioner` mot `{grouped ? "Slides" : "Sektioner"}`.

(e) Huvudvyn: ersätt `{sections.map((section) => (...))}`-blocket med:

```tsx
          {grouped ? (
            <SlideGroupedSections
              grouped={grouped}
              slotMeta={slotMeta!}
              style={styleGuide}
              onSectionChange={handleSectionChange}
              registerSlideRef={(source, el) => { slideRefs.current[String(source)] = el; }}
              onActivate={setActiveSlide}
            />
          ) : (
            sections.map((section) => (
              <div
                key={section.key}
                ref={(el) => { sectionRefs.current[section.key] = el; }}
                className="group relative"
                onClick={() => setActiveSectionKey(section.key)}
              >
                <SectionRenderer
                  section={section}
                  style={styleGuide}
                  onSectionChange={(updated) => handleSectionChange(section.key, updated)}
                  budgets={budgets}
                />
              </div>
            ))
          )}
```

OBS: `slotMeta!` är säker — `grouped` är non-null exakt när `slotMeta` är det; skriv hellre `grouped && slotMeta ? ... : ...` om lint klagar på non-null-assertion.

Allt annat (poll, autosave, shorten, overflow-panelen, footer) lämnas ORÖRT.

- [ ] **Step 3: Verifiera**

Kör: `npx tsc --noEmit` → 0 fel.
Kör: `npm test -- --run` → hela sviten grön.
Kör: `npm run lint` → 0 fel.

- [ ] **Step 4: Commit**

```powershell
git add "src/app/bids/[id]/page.tsx" src/components/bid-editor/BidEditor.tsx
git commit -m "feat(bid-editor): slide-grouped slim view wired for onboarded templates"
```

---

### Task 10: Helhetsverifiering, ROADMAP, PR

**Files:**
- Modify: `notes/ROADMAP.md` (BID-EDITOR-SLIMNING-punkten under 🔜 NÄSTA)

- [ ] **Step 1: Full svit + lint + typecheck — visa output**

Kör i `bidsmith-editorslim`: `npm test -- --run && npm run lint && npx tsc --noEmit`
Förväntat: allt grönt. Visa outputen för Stefan (verifieringsregeln).

- [ ] **Step 2: Visuell verifiering — editorn (ingen API-kostnad)**

Kontrollera att `BIDSMITH_FOREIGN_TEMPLATES=on` finns i `bidsmith-editorslim/.env.local`. Starta dev (`npm run dev`, port enligt output — 3001 om 3000 upptaget). Öppna ett BEFINTLIGT Radrum-anbud i `/bids/[id]` (slimningen är retroaktiv — inga nya genereringar behövs). Ta screenshots (browse-verktyget) på: (1) grupperad vy med sliderubriker + räknare, (2) SlideNav. Rendera till PNG och skicka till Stefan (Remote Control: PNG, inte HTML). Räkna: synliga rutor ska vara prosa-slots, kortfält borta, ev. "Övriga rutor" om profilen om-kalibrerats sedan genereringen.

OBS Turbopack: sällan anropade routes kan ge 404 första gången — ladda om.

- [ ] **Step 3: Visuell verifiering — wizarden (kan kräva Stefans smoke)**

Wizard-knappen kräver en mall i draft-status. Finns ingen sådan i dev-DB:n: verifiera INTE genom att köra ny klassificering på egen hand (kostar API-anrop) — komponenttesterna täcker logiken, och knappen granskas i Stefans kommande smoke (ny onboarding ingår där). Finns en draft-mall: screenshot på knappen + fast-läget, skicka som PNG.

- [ ] **Step 4: Uppdatera ROADMAP**

I `notes/ROADMAP.md`: byt `- [ ] **BID-EDITOR-SLIMNING (Stefan 2026-07-14 — eget spår, brainstormas först):** ...`-punktens checkbox till `[x]` och ersätt punkttexten med:

```
- [x] **BID-EDITOR-SLIMNING — LEVERERAD 2026-07-15:** editorn för onboardade mallar
      visar nu endast prosa-rutor, grupperade per slide med intent-etikett +
      teckenräknare (text/budgetChars, röd vid över); kortfält (≤80) döljs helt
      (genereras/exporteras oförändrat); SlideNav ersätter sektionslistan
      (omordning/borttagning av — platshållar-bundet); okänd placeholder ⇒ synlig
      "Övriga rutor"-fallback. Wizarden: "Markera hela sliden som fast"-knapp
      (bulk-skip, originaltext behålls) + fasta slides i sammanfattningen.
      Design: notes/2026-07-15-bid-editor-slim-design.md, plan: …-plan.md.
```

Uppdatera även "_Senast uppdaterad:_"-raden överst (datum + en mening).

```powershell
git add notes/ROADMAP.md
git commit -m "docs: tick bid-editor slim-down in roadmap"
```

- [ ] **Step 5: Push + PR**

```powershell
git push -u bidsmith feat/bid-editor-slim
gh pr create --repo DaVincisfather/bidsmith --title "Bid editor slim-down: slide grouping, hidden short fields, fixed-slide marking" --body @'
## Vad

Bid-editorn för onboardade (foreign) mallar slimmas till det som faktiskt redigeras:

- **Kortfält (budgetChars ≤ 80) döljs helt** — genereras och exporteras oförändrat, men har ingen UI-yta (Radrum: 137 platta rutor → endast prosa-rutorna).
- **Prosa-rutor grupperas per slide** i mallens ordning, med slotens intent som etikett och **teckenräknare** mot budgetChars (röd vid överskriden budget).
- **SlideNav** ersätter sektionslistan för profil-drivna anbud (omordning/borttagning av — rutorna är platshållar-bundna).
- **Wizarden: "Markera hela sliden som fast"** — bulk-skip av slidens rutor så kundens originaltext behålls i alla anbud; fasta slides listas i sammanfattningen.
- Fallback: sektioner utan profil-träff visas synligt under "Övriga rutor" — inget döljs tyst. Inbyggda mallens editor är orörd; ingen ändring i generering/export/migrationer.

Metadatat kommer från ett server-side join mot mallprofilen (retroaktivt — befintliga anbud får den slimmade vyn direkt).

## Underlag

- Design: `notes/2026-07-15-bid-editor-slim-design.md`
- Plan: `notes/2026-07-15-bid-editor-slim-plan.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
'@
```

**Invänta PR-review-routinens kommentar före squash-merge** (rutinen är aktiv på bidsmith, verifierad på #79/#80). CI (Actions) ska vara grön.

---

## Självgranskning (utförd vid planskrivning)

- Spec-täckning: fast slide-knapp (Task 1–3), summary-rad (Task 4), kortfält dolda + gruppering + intent-etikett + räknare + fallback (Task 5–9), verifiering + ROADMAP (Task 10). Specens "Orört"-lista respekteras — inga tasks rör generering/export/spar.
- Typkonsistens: `SlotMeta`/`SlideGroup`/`GroupedSections` definieras i Task 5 och används med samma namn i 6, 8, 9; `meta`-propen i Task 7 matchar anropet i Task 8; `applySlideDecision`-signaturen i Task 1 matchar routen i Task 2 och klienten i Task 3.
- Kända avvikelser från spec: inga.
