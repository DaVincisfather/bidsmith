# Per-slide-generering + label-skydd — Implementation Plan (F1/F2-fix)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Generering mot onboardade kundmallar ska klara en riktig mall (Radrum: 169 bekräftade slots) inom Vercels 300 s — genom att batcha per SLIDE i stället för per slot — och klassificeraren ska sluta förbekräfta etikett-rutor.

**Bakgrund:** Operatörsverifieringen 2026-07-06 (`notes/2026-07-06-onboarding-operator-verification.md`): per-slot-generering (SLOT_CONCURRENCY=4) × 169 slots ≈ 8–10 min → watchdog/maxDuration fäller. Beslut (Stefan 2026-07-06): batcha per slide + label-skydd. Radrum-mallen ligger onboardad i DB (id `406190c3-8f03-466a-9f1b-2596a003d422`) för omtest.

## Global Constraints
- TS strikt utan omotiverad `any`; filer <300 rader; svensk UI-copy, kodkommentarer i filens stil.
- INGA live-AI-anrop i tester — `callClaude` mockas.
- `callClaude()` används för alla anrop (aldrig egen klient); structured outputs via `output_config` från Zod-schema. OBS: olika scheman delar aldrig cache — per-slide-scheman är olika per slide, det är förväntat och OK (12 anrop totalt).
- Modellroll: `MODELS.writingGeneric` (Sonnet 5) — ingen rolländring.
- Nedströms-kontraktet får INTE ändras: `GenerateFromProfileResult { sections: BidSection[], failedSections: FailedSection[] }`, en `BidSection` per slot med `key: "generic-prose:{placeholder}"` och `placeholder` satt — renderaren och bid-editorn läser per slot.

---

### Task 1: Per-slide-batchning i generate-from-profile

**Files:**
- Modify: `src/lib/bid-generator/generate-from-profile.ts`
- Modify: `src/lib/bid-generator/bundles/generic-prose.ts`
- Test: `src/lib/bid-generator/__tests__/generate-from-profile.test.ts` (utöka/skriv om)

**Interfaces:**
- Consumes: `TemplateProfile` (slides→slots), `callClaude`, `MODELS.writingGeneric`, `formatContext`-mönstret som `buildGenericProseSection` redan använder (läs filen — systemblock/context återanvänds oförändrat).
- Produces: `generateSectionsFromProfile(profile, ctx, onSectionComplete?)` — OFÖRÄNDRAD signatur och resultatform. Nytt internt: `buildGenericProseSlideSections(slide, slots, ctx): Promise<BidSection[]>` i generic-prose.ts — ETT callClaude-anrop per slide, dynamiskt Zod-schema `z.object({ [slot.placeholder]: z.string() })` över slidens alla generic-prose-slots, prompt som listar varje slots placeholder + intent (+ budgetChars när satt) och kräver koherent innehåll ÖVER sliden (inte 169 öar). Svar → en BidSection per slot (samma key/title/placeholder-form som idag).

**Steg (TDD):**
1. Skriv failande tester: (a) profil med 2 slides à 3+2 slots → exakt 2 `callClaude`-anrop (mock), schema-nycklar = slidens placeholders; (b) svar mappas till 5 BidSections med rätt `placeholder`/`key`; (c) ETT slide-anrop rejectar → slidens slots hamnar i `failedSections`, ANDRA slidens sections överlever; (d) `onSectionComplete` anropas sekventiellt per section; (e) slide utan generic-prose-slots → inget anrop; (f) saknad nyckel i AI-svaret (schema borde hindra, men trunkering) → den sloten till failedSections, ej hela sliden.
2. Implementera: gruppera targets per `slide.source`; kör sliderna chunkat (`SLIDE_CONCURRENCY = 3`); behåll allSettled-isoleringen per slide.
3. `npx vitest run src/lib/bid-generator && npx tsc --noEmit` + eslint.
4. Commit: `fix(bid-generator): per-slide-batchning i profil-genereringen (169 anrop → ~12)`.

### Task 2: Label-skydd i klassificeraren

**Files:**
- Modify: `src/lib/pptx-template/introspect/classify-slot.ts` (promptet)
- Test: befintliga classify-slot-tester ska förbli gröna (mockade)

**Steg:**
1. Läs promptet. Lägg explicit instruktion: en ruta vars text bara är en kort etikett/rubrik som beskriver en ANNAN rutas innehåll (t.ex. "Diarienummer", "Upphandlande organisation", "Anbudsdag" intill ett värdefält) ska klassas `static` — den är formgivning, inte fyllbar yta. (I2-grinden static→pending gör resten: användaren får ställningstagandet.)
2. `npx vitest run src/lib/pptx-template && npx tsc --noEmit`.
3. Commit: `fix(onboarding): klassificeraren skyddar etikett-rutor (static → pending-grinden)`.

### Task 3: ROADMAP + PR
- ROADMAP: bocka F1/F2 ur operatörsverifierings-fynden, lägg F3 (wireframe-fontskala) + "kostnadstext skalar med precount" i backlog om de inte står där.
- PR mot bidsmith, invänta PR-routinen, åtgärda fynd, merge.

### Task 4 (operatör/betald, efter merge): omtest mot Radrum
Force-omklassificering av Radrum-mallen (label-skyddet ska synas i pending-antalet) → complete → generera anbud → export → PowerPoint-öppning. Förväntan: generering < 3 min, inga överskrivna etiketter bland bekräftade förslag.
