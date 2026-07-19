# Onboarding-mätpasset — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Defektdetektion + budgetkalibrering blir en del av onboardingflödet: ett lokalt mätpass-CLI skriver defektsignaturer + budgetar till profilen, wizarden visar hälsorapport med accept-val, aktivering grindas, deck:scan annoterar kända defekter.

**Architecture:** Allt persisteras i profil-jsonb:n (två nya optionella Zod-fält — ingen migration). Bootstrap-skriptets tomma-mallen-scan generaliseras till `src/lib/pptx-template/measure/`; CLI:t komponerar defektscan + befintliga `calibrateTemplate` till ETT atomiskt `saveTemplateProfile`. Ren logik (merge/accept/annotering/grind) ligger i lib och enhetstestas; routes och CLI är tunna.

**Tech Stack:** TypeScript strict, Next.js 16 App Router, Zod, vitest, Supabase (jsonb-profil), PowerPoint COM via `scripts/measure-overflow.ps1` (endast CLI-sidan).

**Spec:** `notes/2026-07-19-onboarding-measure-design.md` — läs den först.

## Global Constraints

- Kod/kommentarer/commits på ENGELSKA; all UI-text och CLI-utskrift på SVENSKA (ren svenska).
- TypeScript strict — inga `any` utan motiverad kommentar.
- Filer under ~300 rader; bryt ut vid behov.
- INGA DB-migrationer — mätstatus/defekter bor i profil-jsonb (optionella Zod-fält).
- Surgical changes: rör bara det uppgiften kräver; matcha befintlig stil.
- Foreign-ytor grindas med `foreignTemplatesEnabled()` (`src/lib/pptx-template/onboarding/foreign-flag.ts`) — samma mönster som syskonroutes.
- Overflow-evalens filer (`evals/overflow/known-template-defects.json`, `src/lib/overflow-eval/gates.ts` trösklar) är FRYSTA — får inte ändra beteende. Bootstrap-refaktorn i Task 3 måste vara beteendebevarande.
- Per task: `npx vitest run <testfil>` grönt före commit; conventional commits.
- Slutgrind (Task 8): full svit + `npx tsc --noEmit` + `npm run lint` med visad output.

---

### Task 1: Profilschema — `measurement` + `knownDefects`

**Files:**
- Modify: `src/lib/pptx-template/template-profile.ts` (schemat ligger efter `SlotProfileSchema`, före `SlideProfileSchema`; `TemplateProfileSchema` finns vid ~rad 83)
- Test: `src/lib/pptx-template/__tests__/template-profile.test.ts` (finns — följ befintlig stil; skapa filen bara om den saknas, kolla först med Glob)

**Interfaces:**
- Produces (senare tasks förlitar sig på exakt dessa namn):
  - `TemplateDefectSchema` / `type TemplateDefect = z.infer<...>` — `{ slide: number; checkId: string; shape: string; note: string; baselineBoundHeightPt?: number; suggestion: string; status: "open" | "accepted" }`
  - `TemplateMeasurementSchema` / `type TemplateMeasurement` — `{ status: "complete"; measuredAt: string; calibrationRounds: number; unresolved: string[]; slotWarnings: Record<string, string[]> }`
  - `TemplateProfileSchema` utökad med `measurement: TemplateMeasurementSchema.optional()` och `knownDefects: z.array(TemplateDefectSchema).optional()`

- [ ] **Step 1: Write the failing test**

```ts
// I template-profile.test.ts, ny describe:
describe("measurement + knownDefects (onboarding-measure)", () => {
  const base = {
    profileVersion: 1, templateId: "t1", name: "T", version: 1,
    slides: [{ source: 1, slots: [] }],
  };

  it("parses a legacy profile without the new fields unchanged", () => {
    const out = TemplateProfileSchema.parse(base);
    expect(out.measurement).toBeUndefined();
    expect(out.knownDefects).toBeUndefined();
  });

  it("round-trips measurement and knownDefects", () => {
    const out = TemplateProfileSchema.parse({
      ...base,
      measurement: {
        status: "complete", measuredAt: "2026-07-19T10:00:00Z",
        calibrationRounds: 6, unresolved: ["{X}"],
        slotWarnings: { "{Y}": ["overflowed at minimum budget — box likely tiny or decorative"] },
      },
      knownDefects: [{
        slide: 2, checkId: "vertical-overflow", shape: "Text 36",
        note: "tom originalmall", suggestion: "Bredda boxen eller acceptera.",
        status: "accepted", baselineBoundHeightPt: 43.2,
      }],
    });
    expect(out.measurement?.calibrationRounds).toBe(6);
    expect(out.knownDefects?.[0].status).toBe("accepted");
  });

  it("rejects an unknown defect status", () => {
    expect(() => TemplateProfileSchema.parse({
      ...base,
      knownDefects: [{ slide: 1, checkId: "outside-slide", shape: "Text 1", note: "", suggestion: "s", status: "maybe" }],
    })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/lib/pptx-template/__tests__/template-profile.test.ts` → FAIL (fälten okända/strippade).

- [ ] **Step 3: Implement** — i `template-profile.ts`, efter `SlotProfileSchema`:

```ts
/** A template's own defect, found by the empty-substrate measurement scan
 *  (onboarding-measure design 2026-07-19). Signature = slide + checkId + shape
 *  — same identity as the overflow-eval's KnownDefect. checkId is a plain
 *  string (CheckId | "gross-overflow") to keep the profile schema decoupled
 *  from the measure module. */
export const TemplateDefectSchema = z.object({
  slide: z.number().int().positive(),
  checkId: z.string().min(1),
  shape: z.string().min(1),
  note: z.string(),
  baselineBoundHeightPt: z.number().optional(),
  /** Generated operator guidance ("bredda boxen ...") shown in the wizard. */
  suggestion: z.string(),
  /** "open" blocks activation; "accepted" is annotated (not alarmed) in scans. */
  status: z.enum(["open", "accepted"]),
});
export type TemplateDefect = z.infer<typeof TemplateDefectSchema>;

/** Written ONLY on a successful measurement pass (atomic save at the end) —
 *  its presence IS the "measured" state; activation gates on it. */
export const TemplateMeasurementSchema = z.object({
  status: z.literal("complete"),
  measuredAt: z.string().min(1),
  calibrationRounds: z.number().int().nonnegative(),
  /** Tokens that froze on geometry fallback (never measured). */
  unresolved: z.array(z.string()),
  /** token → calibration warnings; informational only, never gates. */
  slotWarnings: z.record(z.string(), z.array(z.string())),
});
export type TemplateMeasurement = z.infer<typeof TemplateMeasurementSchema>;
```

och i `TemplateProfileSchema`-objektet: `measurement: TemplateMeasurementSchema.optional(), knownDefects: z.array(TemplateDefectSchema).optional(),`

- [ ] **Step 4: Run test to verify it passes** — samma kommando → PASS.
- [ ] **Step 5: Commit** — `git add -- src/lib/pptx-template/template-profile.ts src/lib/pptx-template/__tests__/template-profile.test.ts && git commit -m "feat: template profile carries measurement + known defects (no migration)"`

---

### Task 2: Ren defektlogik — `measure/template-defects.ts`

**Files:**
- Create: `src/lib/pptx-template/measure/template-defects.ts`
- Test: `src/lib/pptx-template/measure/__tests__/template-defects.test.ts`

**Interfaces:**
- Consumes: `TemplateDefect`, `TemplateProfile` från `../template-profile` (Task 1); `Finding` från `./types`; `isAllGenericProfile` från `../template-profile`.
- Produces (exakta signaturer — Task 4/5/7 anropar dessa):
  - `defectKey(d: Pick<TemplateDefect, "slide" | "checkId" | "shape">): string`
  - `dedupeDefects<T extends Pick<TemplateDefect, "slide" | "checkId" | "shape">>(defects: T[]): T[]` — first-wins
  - `defectSuggestion(checkId: string, detail: string): string` — svensk åtgärdstext per checkId, inkluderar `detail`
  - `mergeDefectAccepts(previous: TemplateDefect[] | undefined, next: TemplateDefect[]): TemplateDefect[]` — accept överlever på signatur; försvunna faller ur; nya är open
  - `acceptDefect(defects: TemplateDefect[], sig: Pick<TemplateDefect, "slide" | "checkId" | "shape">): { ok: true; defects: TemplateDefect[] } | { ok: false; error: string }`
  - `annotateKnownDefects(findings: Finding[], defects: TemplateDefect[]): Finding[]` — träff mot ACCEPTED signatur ⇒ `severity: "INFO"`, detail prefixas `"känd malldefekt: "`; gross-overflow-defekt matchar även vertical-overflow-fynd på samma slide+shape
  - `activationBlockReason(profile: TemplateProfile): string | null` — null = släpp igenom; annars svensk orsak. Icke-foreign-profiler (`!isAllGenericProfile(profile)`) släpps alltid.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import {
  acceptDefect, activationBlockReason, annotateKnownDefects,
  dedupeDefects, defectSuggestion, mergeDefectAccepts,
} from "../template-defects";
import type { TemplateDefect } from "../../template-profile";
import type { TemplateProfile } from "../../template-profile";
import type { Finding } from "../types";

const defect = (over: Partial<TemplateDefect> = {}): TemplateDefect => ({
  slide: 2, checkId: "vertical-overflow", shape: "Text 36",
  note: "tom originalmall", suggestion: "s", status: "open", ...over,
});

describe("dedupeDefects", () => {
  it("keeps the FIRST entry per slide|checkId|shape", () => {
    const out = dedupeDefects([defect({ note: "a" }), defect({ note: "b" }), defect({ shape: "Text 1" })]);
    expect(out).toHaveLength(2);
    expect(out[0].note).toBe("a");
  });
});

describe("mergeDefectAccepts", () => {
  it("carries accepted status onto matching signatures, drops vanished, keeps new open", () => {
    const prev = [defect({ status: "accepted" }), defect({ shape: "Borta", status: "accepted" })];
    const next = [defect(), defect({ shape: "Ny" })];
    const out = mergeDefectAccepts(prev, next);
    expect(out.find((d) => d.shape === "Text 36")?.status).toBe("accepted");
    expect(out.find((d) => d.shape === "Ny")?.status).toBe("open");
    expect(out.some((d) => d.shape === "Borta")).toBe(false);
  });
  it("treats undefined previous as all-open", () => {
    expect(mergeDefectAccepts(undefined, [defect()])[0].status).toBe("open");
  });
});

describe("acceptDefect", () => {
  it("marks the matching signature accepted, immutably", () => {
    const input = [defect()];
    const res = acceptDefect(input, { slide: 2, checkId: "vertical-overflow", shape: "Text 36" });
    if (!res.ok) throw new Error("expected ok");
    expect(res.defects[0].status).toBe("accepted");
    expect(input[0].status).toBe("open");
  });
  it("errors on an unknown signature", () => {
    const res = acceptDefect([defect()], { slide: 9, checkId: "outside-slide", shape: "X" });
    expect(res.ok).toBe(false);
  });
});

describe("annotateKnownDefects", () => {
  const finding = (over: Partial<Finding> = {}): Finding => ({
    checkId: "vertical-overflow", severity: "WARN", slide: 2, shape: "Text 36", detail: "text 43.2pt > box 26pt", ...over,
  });
  it("downgrades hits on ACCEPTED signatures to INFO with prefix", () => {
    const out = annotateKnownDefects([finding()], [defect({ status: "accepted" })]);
    expect(out[0].severity).toBe("INFO");
    expect(out[0].detail).toContain("känd malldefekt");
  });
  it("leaves open-defect hits and non-matching findings untouched", () => {
    const out = annotateKnownDefects([finding(), finding({ slide: 5 })], [defect({ status: "open" })]);
    expect(out.every((f) => f.severity === "WARN")).toBe(true);
  });
  it("lets a gross-overflow defect annotate a vertical-overflow finding on same slide+shape", () => {
    const out = annotateKnownDefects([finding()], [defect({ checkId: "gross-overflow", status: "accepted" })]);
    expect(out[0].severity).toBe("INFO");
  });
});

describe("activationBlockReason", () => {
  const foreignProfile = (over: Partial<TemplateProfile> = {}): TemplateProfile => ({
    profileVersion: 1, templateId: "t1", name: "T", version: 1,
    slides: [{ source: 1, slots: [{ placeholder: "{A}", capability: "generic-prose", format: "prose", intent: "", status: "generic" }] }],
    ...over,
  });
  it("blocks an unmeasured foreign profile", () => {
    expect(activationBlockReason(foreignProfile())).toMatch(/onboarding:measure/);
  });
  it("blocks when open defects remain, mentioning the count", () => {
    const p = foreignProfile({
      measurement: { status: "complete", measuredAt: "x", calibrationRounds: 1, unresolved: [], slotWarnings: {} },
      knownDefects: [defect(), defect({ shape: "Text 1" })],
    });
    expect(activationBlockReason(p)).toMatch(/2/);
  });
  it("passes measured + fully addressed", () => {
    const p = foreignProfile({
      measurement: { status: "complete", measuredAt: "x", calibrationRounds: 1, unresolved: [], slotWarnings: {} },
      knownDefects: [defect({ status: "accepted" })],
    });
    expect(activationBlockReason(p)).toBeNull();
  });
});

describe("defectSuggestion", () => {
  it("produces Swedish guidance per checkId carrying the measured detail", () => {
    for (const id of ["outside-slide", "vertical-overflow", "gross-overflow", "horizontal-clip"]) {
      const s = defectSuggestion(id, "text 43.2pt > box 26pt");
      expect(s.length).toBeGreaterThan(10);
      expect(s).toContain("text 43.2pt > box 26pt");
    }
  });
});
```

- [ ] **Step 2: Run to verify FAIL** — `npx vitest run src/lib/pptx-template/measure/__tests__/template-defects.test.ts` → modulen saknas.

- [ ] **Step 3: Implement `template-defects.ts`**

```ts
// Pure profile-level defect logic (onboarding-measure design 2026-07-19).
// The overflow-eval keeps its own frozen copy of the signature predicate
// (src/lib/overflow-eval/gates.ts) — eval behavior must not change.
import type { Finding } from "./types";
import { isAllGenericProfile, type TemplateDefect, type TemplateProfile } from "../template-profile";

export function defectKey(d: Pick<TemplateDefect, "slide" | "checkId" | "shape">): string {
  return `${d.slide}|${d.checkId}|${d.shape}`;
}

/** First-wins dedupe on the signature — original-scan entries take precedence
 *  when the instrumented scan re-finds the same shape (bootstrap order). */
export function dedupeDefects<T extends Pick<TemplateDefect, "slide" | "checkId" | "shape">>(defects: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const d of defects) {
    const key = defectKey(d);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}

/** Operator guidance per check class. `detail` is the measured fact
 *  ("text 43.2pt > box 26pt") — always included so the suggestion stays
 *  anchored to data. Swedish: this is wizard/CLI copy. */
export function defectSuggestion(checkId: string, detail: string): string {
  const base: Record<string, string> = {
    "outside-slide": "Boxen går utanför sliden redan i tom mall — flytta upp eller förminska den i mallen",
    "vertical-overflow": "Boxens statiska innehåll ryms inte i boxhöjden — förhöj eller bredda boxen i mallen",
    "gross-overflow": "Boxen overflowar grovt redan utan genererat innehåll — se över boxens storlek i mallen",
    "horizontal-clip": "Text klipps i sidled i tom mall — bredda boxen eller aktivera radbrytning i mallen",
    "single-line-break": "Enradsbox radbryter redan i tom mall — bredda boxen i mallen",
    "autofit-shrink": "Autofit krymper texten kraftigt redan i tom mall — förstora boxen i mallen",
    deadspace: "Stor tom yta i boxen — överväg att förminska den i mallen",
  };
  const advice = base[checkId] ?? "Granska boxen i mallen";
  return `${advice}, eller acceptera defekten (${detail}).`;
}

export function mergeDefectAccepts(
  previous: TemplateDefect[] | undefined,
  next: TemplateDefect[],
): TemplateDefect[] {
  const accepted = new Set((previous ?? []).filter((d) => d.status === "accepted").map(defectKey));
  return next.map((d) => (accepted.has(defectKey(d)) ? { ...d, status: "accepted" as const } : d));
}

export function acceptDefect(
  defects: TemplateDefect[],
  sig: Pick<TemplateDefect, "slide" | "checkId" | "shape">,
): { ok: true; defects: TemplateDefect[] } | { ok: false; error: string } {
  const key = defectKey(sig);
  if (!defects.some((d) => defectKey(d) === key)) {
    return { ok: false, error: `okänd defektsignatur: slide ${sig.slide} ${sig.checkId} ${sig.shape}` };
  }
  return {
    ok: true,
    defects: defects.map((d) => (defectKey(d) === key ? { ...d, status: "accepted" as const } : d)),
  };
}

/** A gross-overflow defect (eval-side geometry predicate) manifests in
 *  deck:scan as a vertical-overflow finding on the same shape. */
function checkMatches(defectCheckId: string, findingCheckId: string): boolean {
  return defectCheckId === findingCheckId
    || (defectCheckId === "gross-overflow" && findingCheckId === "vertical-overflow");
}

export function annotateKnownDefects(findings: Finding[], defects: TemplateDefect[]): Finding[] {
  const accepted = defects.filter((d) => d.status === "accepted");
  return findings.map((f) => {
    const hit = accepted.find(
      (d) => d.slide === f.slide && d.shape === f.shape && checkMatches(d.checkId, f.checkId),
    );
    if (!hit) return f;
    return { ...f, severity: "INFO" as const, detail: `känd malldefekt: ${f.detail}` };
  });
}

/** Activation gate (design: HARD). Non-foreign profiles always pass — the
 *  bundled template never carries measurement. Swedish: operator-facing copy. */
export function activationBlockReason(profile: TemplateProfile): string | null {
  if (!isAllGenericProfile(profile)) return null;
  if (profile.measurement?.status !== "complete") {
    return "mallen är inte mätt — kör npm run onboarding:measure -- <templateId> --write och försök igen";
  }
  const open = (profile.knownDefects ?? []).filter((d) => d.status === "open").length;
  if (open > 0) {
    return `${open} malldefekt(er) väntar på ställningstagande i hälsorapporten — fixa i mallen eller acceptera`;
  }
  return null;
}
```

- [ ] **Step 4: Run to verify PASS.** OBS: verifiera att `isAllGenericProfile` exporteras från `template-profile.ts` (den används redan av `run-bid-generation.ts`) — importera därifrån, definiera INTE en egen.
- [ ] **Step 5: Commit** — `git commit -m "feat: pure template-defect logic (merge, accept, annotate, activation gate)"`

---

### Task 3: Tomma-mallen-scan till lib — `measure/empty-scan.ts` (beteendebevarande bootstrap-refaktor)

**Files:**
- Create: `src/lib/pptx-template/measure/empty-scan.ts`
- Modify: `scripts/overflow-bootstrap.ts` (rader 165–328: `resolveScanTargets`, `dedupeDefects`, `scanEmptyTemplate`, `buildKnownDefects` — flyttas/ersätts)
- Test: `src/lib/pptx-template/measure/__tests__/empty-scan.test.ts`

**Interfaces:**
- Consumes: check-funktionerna + `deadspaceFindings` från `./verdicts`; `grossOverflowShapes` från `@/lib/overflow-eval/gates` (läses, ändras EJ); `prefixKey`/`readFontScalesByPrefix` från `../calibrate/font-scales`; `dedupeDefects` från `./template-defects` (Task 2); `TEMPLATE_BUCKET` från `../template-store`.
- Produces:
  - `interface EmptyScanDefect { slide: number; checkId: string; shape: string; note: string; baselineBoundHeightPt?: number }` (strukturellt = evalens `KnownDefect` — bootstrap fortsätter skriva sin JSON oförändrat)
  - `defectsFromMeasurement(measured: MeasurementFile, scales: Map<string, number>, note: string): EmptyScanDefect[]` — REN (unit-testbar): flyttar fynd-loopen + FAIL-filter + gross-mappningen ur bootstrapens `scanEmptyTemplate` (rader 268–298) oförändrad
  - `scanEmptyTemplateBuffer(buffer: Buffer, note: string): Promise<EmptyScanDefect[]>` — COM-harnessen (mkdtemp, ps1-anrop, cleanup; bootstrap-rader 254–306) som anropar `defectsFromMeasurement`
  - `resolveEmptyScanTargets(supabase: SupabaseClient, templateId: string): Promise<Array<{ storagePath: string; note: string }>>` — bootstrapens `resolveScanTargets` (rader 192–227) med `templateId` som parameter i stället för konstanten; samma valideringar och svenska felsträngar
  - `buildEmptyScanDefects(supabase: SupabaseClient, templateId: string): Promise<EmptyScanDefect[]>` — bootstrapens `buildKnownDefects` (rader 309–328): original först, union, dedupe (nu via Task 2:s `dedupeDefects`), samma sortering

- [ ] **Step 1: Write the failing test** — syntetisk `MeasurementFile` som triggar exakt ett outside-slide-FAIL och ett gross-overflow:

```ts
import { describe, expect, it } from "vitest";
import { defectsFromMeasurement } from "../empty-scan";
import type { MeasurementFile, ShapeMeasurementV2 } from "../types";

const shape = (over: Partial<ShapeMeasurementV2>): ShapeMeasurementV2 => ({
  slide: 1, name: "Text 1", topPt: 100, leftPt: 10, widthPt: 200, heightPt: 50,
  boundHeightPt: 50, boundWidthPt: 200, marginTopPt: 0, marginBottomPt: 0,
  marginLeftPt: 0, marginRightPt: 0, wordWrap: true, autoSize: 0,
  fontSizePt: 12, textPrefix: "x", textLength: 1, ...over,
});

it("maps FAIL findings and gross overflows to defects carrying the note", () => {
  const measured: MeasurementFile = {
    slideCount: 1, slideWidthPt: 960, slideHeightPt: 540,
    shapes: [
      // bottom = topPt + boundHeightPt long past slideHeight ⇒ outside-slide FAIL
      shape({ name: "Utanför", topPt: 520, boundHeightPt: 100 }),
      // boundHeight >> heightPt ⇒ gross overflow per gates-predikatet
      shape({ name: "Grov", slide: 2, heightPt: 20, boundHeightPt: 200 }),
    ],
  };
  const out = defectsFromMeasurement(measured, new Map(), "tom originalmall");
  expect(out.some((d) => d.checkId === "outside-slide" && d.shape === "Utanför")).toBe(true);
  const gross = out.find((d) => d.checkId === "gross-overflow" && d.shape === "Grov");
  expect(gross?.baselineBoundHeightPt).toBe(200);
  expect(out.every((d) => d.note === "tom originalmall")).toBe(true);
});
```

Justera de syntetiska värdena mot `checkOutsideSlide`/`grossOverflowShapes` verkliga trösklar (läs `verdicts.ts` + `gates.ts`) tills testet beskriver ett äkta FAIL/gross — tröskelvärden får INTE ändras.

- [ ] **Step 2: Run to verify FAIL** (modulen saknas).
- [ ] **Step 3: Implement** — flytta koden enligt Interfaces ovan (kommentarer följer med). Refaktorera `scripts/overflow-bootstrap.ts` till att importera `resolveEmptyScanTargets`, `buildEmptyScanDefects` (med `TEMPLATE_ID` som argument) och ta bort de lokala kopiorna; utskrifter och JSON-utdata ska vara identiska (union-loggen kan flytta in i lib-funktionen).
- [ ] **Step 4: Run to verify PASS** + `npx tsc --noEmit` (bootstrap-skriptet måste kompilera).
- [ ] **Step 5: Commit** — `git commit -m "refactor: generalize empty-template defect scan into measure lib (behavior-preserving)"`

---

### Task 4: Mätpass-CLI:t — `scripts/onboarding-measure.ts`

**Files:**
- Create: `scripts/onboarding-measure.ts`
- Create: `src/lib/pptx-template/measure/compose-measured-profile.ts`
- Modify: `package.json` (efter `"calibrate:backfill-single-line"`-raden): `"onboarding:measure": "node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/onboarding-measure.ts",`
- Test: `src/lib/pptx-template/measure/__tests__/compose-measured-profile.test.ts`

**Interfaces:**
- Consumes: `calibrateTemplate` + `applyBudgets` + `CalibrationReport` från `../calibrate/calibrate` (OBS: anropas med `{ write: false }` — CLI:t äger skrivningen); `buildEmptyScanDefects` (Task 3); `mergeDefectAccepts`, `defectSuggestion` (Task 2); `loadTemplateProfile`, `saveTemplateProfile` från `../profile-store`.
- Produces:
  - `composeMeasuredProfile(profile: TemplateProfile, report: CalibrationReport, scanned: EmptyScanDefect[], now: string): TemplateProfile` — REN: `applyBudgets(profile, report.results)` → sätter `measurement` (`calibrationRounds: report.rounds`, `unresolved: report.unresolved`, `slotWarnings` = `{ [r.token]: r.warnings }` för results med varningar, `measuredAt: now`) → `knownDefects = mergeDefectAccepts(profile.knownDefects, scanned.map(s => ({ ...s, suggestion: defectSuggestion(s.checkId, s.note + (s.baselineBoundHeightPt ? \`, baseline ${s.baselineBoundHeightPt} pt\` : "")), status: "open" as const })))`

- [ ] **Step 1: Write the failing test** för `composeMeasuredProfile`: (a) budgetar + singleLine sätts från report-results, (b) measurement-fälten mappas exakt, (c) slotWarnings tar bara tokens MED varningar, (d) accept i befintlig profil överlever på matchande signatur, (e) inputprofilen muteras inte.

```ts
import { describe, expect, it } from "vitest";
import { composeMeasuredProfile } from "../compose-measured-profile";
import type { TemplateProfile } from "../../template-profile";
import type { CalibrationReport } from "../../calibrate/calibrate";

const profile: TemplateProfile = {
  profileVersion: 1, templateId: "t1", name: "T", version: 1,
  slides: [{ source: 1, slots: [
    { placeholder: "{A}", capability: "generic-prose", format: "prose", intent: "", status: "generic" },
  ] }],
  knownDefects: [{ slide: 2, checkId: "vertical-overflow", shape: "Text 36", note: "gammal", suggestion: "s", status: "accepted" }],
};
const report: CalibrationReport = {
  templateId: "t1", rounds: 6, unresolved: ["{U}"],
  results: [{ token: "{A}", budget: 120, rounds: 5, method: "measured", shortField: false, singleLine: true, warnings: ["single-line box — budget capped at one line (130 chars)"], signals: [] }],
};

it("composes budgets, measurement and merged defects without mutating input", () => {
  const out = composeMeasuredProfile(profile, report, [
    { slide: 2, checkId: "vertical-overflow", shape: "Text 36", note: "tom originalmall" },
    { slide: 4, checkId: "gross-overflow", shape: "Text 5", note: "tom originalmall", baselineBoundHeightPt: 82.8 },
  ], "2026-07-19T12:00:00Z");
  expect(out.slides[0].slots[0].budgetChars).toBe(120);
  expect(out.slides[0].slots[0].singleLine).toBe(true);
  expect(out.measurement).toEqual({
    status: "complete", measuredAt: "2026-07-19T12:00:00Z", calibrationRounds: 6,
    unresolved: ["{U}"], slotWarnings: { "{A}": ["single-line box — budget capped at one line (130 chars)"] },
  });
  expect(out.knownDefects?.find((d) => d.shape === "Text 36")?.status).toBe("accepted");
  expect(out.knownDefects?.find((d) => d.shape === "Text 5")?.status).toBe("open");
  expect(out.knownDefects?.every((d) => d.suggestion.length > 10)).toBe(true);
  expect(profile.measurement).toBeUndefined();
});
```

- [ ] **Step 2: Run to verify FAIL.**
- [ ] **Step 3: Implement** `compose-measured-profile.ts` enligt Interfaces (ren funktion, ~30 rader). Sedan CLI:t — mönstret är `scripts/calibrate-budgets.ts` + `scripts/backfill-single-line.ts`:

```ts
// scripts/onboarding-measure.ts
// CLI: npm run onboarding:measure -- <templateId> [--write] [--max-rounds N]
// The onboarding measurement pass (design notes/2026-07-19-onboarding-measure-design.md):
// (1) empty-substrate defect scan (COM), (2) budget calibration (COM),
// (3) ONE atomic profile save. Dry-run by default. Requires PowerPoint CLOSED.
import { createServiceClient } from "../src/lib/supabase";
import { calibrateTemplate } from "../src/lib/pptx-template/calibrate/calibrate";
import { loadTemplateProfile, saveTemplateProfile } from "../src/lib/pptx-template/profile-store";
import { buildEmptyScanDefects } from "../src/lib/pptx-template/measure/empty-scan";
import { composeMeasuredProfile } from "../src/lib/pptx-template/measure/compose-measured-profile";

async function main() {
  const args = process.argv.slice(2);
  const templateId = args.find((a) => !a.startsWith("--"));
  if (!templateId) {
    console.error("Användning: npm run onboarding:measure -- <templateId> [--write] [--max-rounds N]");
    process.exit(1);
  }
  const write = args.includes("--write");
  const mrIdx = args.indexOf("--max-rounds");
  const maxRounds = mrIdx >= 0 ? Number(args[mrIdx + 1]) : undefined;
  if (maxRounds !== undefined && !Number.isFinite(maxRounds)) {
    console.error("--max-rounds kräver ett numeriskt värde");
    process.exit(1);
  }

  const supabase = createServiceClient();
  const profile = await loadTemplateProfile(templateId);
  if (!profile) throw new Error(`mall ${templateId} saknar profil — onboarda den först`);

  console.log("=== Steg 1/2: defektscan på tomma mallen ===");
  const scanned = await buildEmptyScanDefects(supabase, templateId);

  console.log("\n=== Steg 2/2: budgetkalibrering ===");
  const report = await calibrateTemplate(templateId, { write: false, maxRounds });

  const updated = composeMeasuredProfile(profile, report, scanned, new Date().toISOString());

  // Rapport (svenska): budgettabell (samma kolumner som calibrate-budgets) + defektlista.
  console.log(`\nKalibrering: ${report.rounds} varv, ${report.results.length} slots, ${report.unresolved.length} omätta.`);
  const open = (updated.knownDefects ?? []).filter((d) => d.status === "open");
  const accepted = (updated.knownDefects ?? []).filter((d) => d.status === "accepted");
  console.log(`Defekter: ${open.length} öppna, ${accepted.length} accepterade (bevarade).`);
  for (const d of updated.knownDefects ?? []) {
    console.log(`  slide ${String(d.slide).padStart(2)}  ${d.checkId.padEnd(16)} ${d.shape.padEnd(12)} [${d.status}]`);
    console.log(`    → ${d.suggestion}`);
  }

  if (write) {
    await saveTemplateProfile(updated);
    console.log("\nProfil SPARAD (budgetar + mätstatus + defekter).");
  } else {
    console.log("\nDRY-RUN — inget sparat. Kör med --write för att persistera.");
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
```

Verifiera mot verkliga `calibrate-budgets.ts` att budgettabell-utskriften återanvänds i samma stil (kopiera tabell-loopen därifrån om kolumnerna behövs — den ligger i skriptet, inte i lib).

- [ ] **Step 4: Run to verify PASS** (compose-testet) + `npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `git commit -m "feat: onboarding:measure CLI - defect scan + calibration in one atomic profile save"`

---

### Task 5: `deck:scan --profile` — annotera kända defekter

**Files:**
- Modify: `scripts/scan-deck.ts` (argparsning rad 29–43; findings-bygget rad 56–79)

**Interfaces:**
- Consumes: `annotateKnownDefects` (Task 2), `loadTemplateProfile` från `../src/lib/pptx-template/profile-store`.
- Produces: CLI-flaggan `--profile <templateId>`; annoterade fynd blir INFO och räknas därmed inte i FAIL/WARN-summeringen (`buildReport`/`exitCodeFor` är orörda — de grupperar på severity).

- [ ] **Step 1: Wiring (ingen ny logik — logiken testades i Task 2):** i `main()`:

```ts
const profIdx = args.indexOf("--profile");
const profileId = profIdx >= 0 ? args[profIdx + 1] ?? null : null;
if (profIdx >= 0 && !profileId) { console.error("--profile kräver ett templateId"); process.exit(3); }
```

uppdatera positional-sökningen så även `--profile`-värdet exkluderas (samma mönster som `--json`, rad 39: `(profIdx < 0 || i !== profIdx + 1)` läggs till villkoret), och usage-strängen: `"Användning: npm run deck:scan -- <anbud.pptx> [--json ut.json] [--profile <templateId>]"`. Efter att `findings` byggts klart (efter raw-token-loopen, före `buildReport`):

```ts
let reported = findings;
if (profileId) {
  const profile = await loadTemplateProfile(profileId);
  if (!profile) { console.error(`--profile: mall ${profileId} saknar profil`); process.exit(3); }
  reported = annotateKnownDefects(findings, profile.knownDefects ?? []);
  const annotated = reported.filter((f) => f.detail.startsWith("känd malldefekt")).length;
  console.log(`Profil ${profileId}: ${annotated} fynd annoterade som kända malldefekter.`);
}
const report = buildReport(path.basename(pptxPath), measured.slideCount, reported);
```

OBS: `loadTemplateProfile` kräver Supabase-env — deck:scan körs i dag UTAN env-fil (`tsx` direkt, se package.json). `--profile`-flaggan gör env nödvändig: dokumentera i usage-kommentaren högst upp att `--profile` kräver `.env.local` (kör via `node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/scan-deck.ts ...` eller acceptera att flaggan bara funkar i env-laddat skal). Enklast: byt npm-scriptet `"deck:scan"` till env-file-varianten — flaggfritt beteende är oförändrat av env-laddning.

- [ ] **Step 2: Verify** — `npx tsc --noEmit` + kör mot befintligt deck UTAN flagga: `npm run deck:scan -- tmp/smoke4/anbud-32aed5e5.pptx` (om filen finns i worktreen — annars valfritt deck) → identiskt beteende som före ändringen (samma summering).
- [ ] **Step 3: Commit** — `git commit -m "feat: deck:scan --profile annotates accepted template defects as INFO"`

---

### Task 6: Geometri-screen på servern

**Files:**
- Create: `src/lib/pptx-template/onboarding/geometry-screen.ts`
- Modify: `src/app/api/templates/route.ts` (uploadens foreign-gren, där precount beräknas — `candidateSlots(slides).length` vid ~rad 122–126)
- Modify: `src/lib/pptx-template/onboarding/draft.ts` (payload-hanteringen: `extractPrecount` finns; lägg till motsvarande `extractScreen` och låt draft-schemat bära `screen` optional)
- Modify: `src/lib/pptx-template/onboarding/draft-logic.ts` (draft-bygget i propose-flödet ska kopiera in screen-fynden i utkastet — hitta var draften konstrueras och läs befintlig payload)
- Test: `src/lib/pptx-template/onboarding/__tests__/geometry-screen.test.ts`

**Interfaces:**
- Consumes: `SlideShapes` från `../introspect/read-pptx`; `genericGeometricCapacity` från `../introspect/compute-budgets`; shape-identiteten (namn/index) — ÅTERANVÄND samma identitet som draft-slots använder (läs `candidateSlots` i `propose-injection-plan.ts` och `draft-logic.ts` innan du väljer fält; hitta inte på en ny).
- Produces:
  - `interface ScreenFinding { slide: number; shape: string; kind: "static-overflow" | "tight-box"; detail: string }`
  - `screenSlides(slides: SlideShapes[]): ScreenFinding[]`
  - `TIGHT_BOX_MIN_CHARS = 20`
  - Draft-payloaden bär `screen?: ScreenFinding[]`; GET-onboarding-svaret exponerar den (draftPayload släpper igenom den automatiskt när draft-schemat bär fältet).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { screenSlides } from "../geometry-screen";
// Bygg syntetiska SlideShapes enligt read-pptx typerna (läs filen för exakta fält):
// en statisk shape (utan token) vars textlängd överstiger geometrisk kapacitet
// ⇒ static-overflow; en token-lös liten box utan text (kandidat) med kapacitet
// < 20 ⇒ tight-box; en shape MED token ⇒ aldrig flaggad; en shape utan egen
// geometri (capacity null) ⇒ aldrig flaggad.
it("flags static text that cannot fit its box", () => { /* ... */ });
it("flags candidate boxes with capacity under TIGHT_BOX_MIN_CHARS", () => { /* ... */ });
it("never flags token-bearing or geometry-less shapes", () => { /* ... */ });
```

Skriv testerna KOMPLETT mot de verkliga typfälten i `read-pptx.ts` (shape-text, tokens, geometri) — läs filen först; ovan är kravlistan, inte platshållare: alla tre testfall ska ha riktiga shape-literaler när du är klar.

- [ ] **Step 2: Run to verify FAIL.**
- [ ] **Step 3: Implement** `screenSlides` (~30 rader): per slide/shape — hoppa över shapes med tokens; `capacity = genericGeometricCapacity(shape)`; `null` ⇒ hoppa; statisk text längre än capacity ⇒ `static-overflow` med detail `"statisk text ~N tecken, boxen rymmer ~M"`; textlös/kandidat med `capacity < TIGHT_BOX_MIN_CHARS` ⇒ `tight-box` med detail `"boxen rymmer ~M tecken"`. Sedan wiring: upload-routen beräknar `screenSlides(slides)` i samma steg som precount och lagrar `{ precount, screen }`; draft.ts + draft-logic.ts låter fältet följa med in i utkastet (schema-optional ⇒ gamla utkast parsar).
- [ ] **Step 4: Run to verify PASS** + `npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `git commit -m "feat: geometry screen at upload - preliminary tight-box/static-overflow flags"`

---

### Task 7: API-ytor — defekt-accept, GET-join, aktiveringsgrind

**Files:**
- Create: `src/app/api/templates/[id]/defects/route.ts`
- Modify: `src/lib/api-schemas.ts` (ny `DefectAcceptSchema`)
- Modify: `src/app/api/templates/[id]/onboarding/route.ts` (GET, rad 89–94: svaret utökas)
- Modify: `src/app/api/templates/[id]/activate/route.ts` (efter onboarding_status-kollen, rad 34–39)

**Interfaces:**
- Consumes: `acceptDefect`, `activationBlockReason` (Task 2); `loadTemplateProfile`, `saveTemplateProfile`; `foreignTemplatesEnabled`; `requireUser`, `parseUuidParam`, `parseBody` från `@/lib/api-helpers`.
- Produces:
  - `DefectAcceptSchema = z.object({ slide: z.number().int().positive(), checkId: z.string().min(1), shape: z.string().min(1) })`
  - `POST /api/templates/[id]/defects` → 200 `{ knownDefects }` | 404 (flagga av/mall saknas) | 409 (ingen profil/mätning) | 422 (okänd signatur)
  - GET onboarding-svaret får `measurement` + `knownDefects` (null när profil saknas)
  - activate-routen: `activationBlockReason` ≠ null ⇒ 409 med orsaken

- [ ] **Step 1: Implementera defects-routen** (mönstret är onboarding-routens PATCH — auth → flagga → uuid → body):

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser, parseUuidParam, parseBody } from "@/lib/api-helpers";
import { DefectAcceptSchema } from "@/lib/api-schemas";
import { foreignTemplatesEnabled } from "@/lib/pptx-template/onboarding/foreign-flag";
import { loadTemplateProfile, saveTemplateProfile } from "@/lib/pptx-template/profile-store";
import { acceptDefect } from "@/lib/pptx-template/measure/template-defects";

interface RouteContext { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: RouteContext) {
  const authed = await createClient();
  const auth = await requireUser(authed);
  if (!auth.ok) return auth.response;
  if (!foreignTemplatesEnabled()) {
    return NextResponse.json({ error: "onboarding av kundmallar är avstängd" }, { status: 404 });
  }
  const { id: rawId } = await params;
  const idResult = parseUuidParam(rawId, "template id");
  if (!idResult.ok) return idResult.response;
  const parsed = await parseBody(request, DefectAcceptSchema);
  if (!parsed.ok) return parsed.response;

  const profile = await loadTemplateProfile(idResult.data);
  if (!profile) return NextResponse.json({ error: "mallen saknar profil" }, { status: 409 });
  if (profile.measurement?.status !== "complete") {
    return NextResponse.json({ error: "mallen är inte mätt — kör onboarding:measure först" }, { status: 409 });
  }
  const result = acceptDefect(profile.knownDefects ?? [], parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
  await saveTemplateProfile({ ...profile, knownDefects: result.defects });
  return NextResponse.json({ knownDefects: result.defects });
}
```

- [ ] **Step 2: GET-join i onboarding-routen** — efter `loadOnboardingRow`, före `NextResponse.json` (endast när `row.onboarding_status === "onboarded"`): `const profile = await loadTemplateProfile(idResult.data);` och lägg `measurement: profile?.measurement ?? null, knownDefects: profile?.knownDefects ?? null` i svaret. (Andra statusar: utelämna fälten — draften har ingen profil än.)
- [ ] **Step 3: Aktiveringsgrinden** — i activate-routen, efter onboarding_status-kollen:

```ts
  const profile = await loadTemplateProfile(id);
  if (profile) {
    const blocked = activationBlockReason(profile);
    if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });
  }
```

(`profile === null` ⇒ bundlade mallen utan profil-rad — släpp igenom, dagens beteende.)

- [ ] **Step 4: Verify** — `npx tsc --noEmit` + `npx vitest run src/lib/pptx-template/measure/__tests__/template-defects.test.ts` (grind-logiken är redan testad där; routes är tunna och saknar integrationstester i repot — känd backlogpost, bygg inte nya nu).
- [ ] **Step 5: Commit** — `git commit -m "feat: defect-accept endpoint, measurement in onboarding GET, hard activation gate"`

---

### Task 8: Wizard-UI + live-verifiering mot Radrum v4 + ROADMAP + PR

**Files:**
- Create: `src/components/onboarding/MeasurementStep.tsx`
- Create: `src/components/onboarding/HealthReport.tsx`
- Modify: `src/components/onboarding/OnboardingWizard.tsx` (statusgrening + poll; läs komponenten först — följ dess befintliga fetch/poll-mönster från klassificeringssteget)
- Modify: wizardens slide-vy (screen-fynden listas under wireframen; läs `SlideWireframe`/`SlotPanel` och välj minsta ingrepp)
- Modify: `notes/ROADMAP.md` (bocka mätspåret, peka på design/plan-dokumenten)

**Interfaces:**
- Consumes: GET-onboarding-svarets `measurement`/`knownDefects`/`screen` (Task 6/7); `POST /api/templates/[id]/defects`.
- Produces: UI-flöde — status `onboarded` utan `measurement` ⇒ `MeasurementStep` (kommandokort `npm run onboarding:measure -- <templateId> --write` + kopieraknapp + poll var 10:e sekund tills `measurement` finns); `measurement` finns ⇒ `HealthReport` (defektlista: slide/shape/checkId, suggestion, Acceptera-knapp per öppen defekt → POST → uppdatera listan; grön "klar för aktivering"-rad när 0 öppna). All UI-text på svenska.

- [ ] **Step 1: Bygg komponenterna** (MeasurementStep ~60 rader, HealthReport ~80; matcha husets Tailwind-tokens — inga egna designbeslut utöver befintliga mönster, jfr feedback-regeln om designautonomi).
- [ ] **Step 2: Visuell verifiering** — `npm run dev` (med `BIDSMITH_FOREIGN_TEMPLATES=on` i `.env.local`), öppna Radrum-mallens onboarding-sida, screenshotta mätsteget och (efter Step 3) hälsorapporten. UI-ändringar verifieras visuellt, inte genom kodläsning.
- [ ] **Step 3: Live-mätpasset mot Radrum v4** (PowerPoint STÄNGT, meddela Stefan körfönstret):
  1. `npm run onboarding:measure -- 25f9d500-911f-4afb-8fc0-a30f8220c477` (dry-run) → förvänta: defektlistan innehåller Text 36 (slide 2), statboxklassen (slide 4) och slide 9-klassikern; budgetar i samma härad som 2026-07-16-omkalibreringen (summa ~11 400–11 500 — INTE identiskt, COM-brus är normalt); alla suggestions ifyllda.
  2. Samma kommando `--write` → DB-verifiera `measurement` + `knownDefects` i profilen.
  3. Acceptera defekterna via hälsorapporten i UI:t (screenshot).
  4. `npm run deck:scan -- tmp/smoke4/anbud-32aed5e5.pptx --profile 25f9d500-911f-4afb-8fc0-a30f8220c477` (kopiera decket från bidsmith-kicker-worktreen om det saknas) → förvänta: de tre kvarvarande grova (slide 1 Text 0, slide 2 Text 36, slide 4 Text 5) annoteras "känd malldefekt"/INFO ⇒ 0 FAIL och 0 oannoterade grova. OBS: slide 1 Text 0 måste finnas i defektlistan för att annoteras — om tomma-mallen-scannen INTE hittar den (den kan vara innehållsdriven: "Testbolaget" är ifyllt innehåll) är det ett KORREKT utfall; dokumentera i PR:en att den klassen ägs av innehållsstyrning, inte defektlistan. Grindmålet är: inga OANNOTERADE grova som saknar känd ägare.
  5. Aktiveringsgrinden: testa POST activate FÖRE accept (förvänta 409 med svensk orsak) och EFTER (förvänta 200).
- [ ] **Step 4: Slutgrind** — full svit + `npx tsc --noEmit` + `npm run lint`, visa output.
- [ ] **Step 5: ROADMAP-tick + commit + push till remoten `bidsmith` (INTE origin!) + PR** mot `DaVincisfather/bidsmith` main med verifieringssiffrorna; invänta PR-routinens kommentar före squash-merge.

---

## Self-review (utförd vid skrivning)

- **Spec-täckning:** hård grind (T7), rapport+åtgärdsförslag (T2/T8), accept-merge (T2/T4), atomisk skrivning (T4), geometri-screen preliminär (T6), deck:scan-annotering (T2/T5), eval-filer orörda (T3 beteendebevarande), inga migrationer (T1), agent-backup/tabeller utanför scope — täckt.
- **Kända osäkerheter för implementören:** exakta fältnamn i `SlideShapes` (T6) och wizardens interna struktur (T8) läses ur koden på plats — kravlistorna i stegen är kompletta, literalerna skrivs mot verkliga typer.
- **Typkonsekvens:** `EmptyScanDefect` (T3) saknar `suggestion`/`status` — de läggs på i `composeMeasuredProfile` (T4) via `defectSuggestion` + `mergeDefectAccepts`; `TemplateDefect` (T1) är den persisterade formen. Konsekvent genom T2/T4/T5/T7.
