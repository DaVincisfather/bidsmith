# Overflow-loopens harness — implementationsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bygg `npm run overflow:eval` — ett deterministiskt mät-varv (generera 5 anbud → exportera → COM-mät → gates → rapport → städa) plus forskarprotokollet för den autonoma loopen.

**Architecture:** Rena, enhetstestade moduler i `src/lib/overflow-eval/` (gates, textmått, rapport) + en tunn orkestrator i `scripts/overflow-eval.ts` som återanvänder befintliga byggstenar: `runBidGeneration` (generering), `renderFromProfile` + `buildMasterContext` (export), `measure-overflow.ps1` + `measure/verdicts` (COM-mätning), `duplicatePairs` (dubbletter), `buildSlotMeta` (fyllnad mot budgetar). Spec: `notes/2026-07-15-overflow-loop-design.md` — läs den först; fitness-trösklarna där är FRYSTA.

**Tech Stack:** TypeScript strikt, tsx-skript med `.env.local`, vitest, PowerShell/COM (mätsteget), Supabase service client.

## Global Constraints

- Worktree: `C:\Users\stefa\projects\bidsmith-overflow`, branch `feat/overflow-harness`. ALLA kommandon via PowerShell (bash-sandboxen ser inte färska filändringar).
- TypeScript strikt — inga `any`. Filer < ~300 rader. Conventional commits, en commit per task.
- Fitness-trösklar EXAKT ur specen: grov overflow = `boundHeightPt > 1,25 × heightPt` ELLER `boundHeightPt − heightPt > 30`; dubbletter = parvis trigram ≥ 0,3 (min 120 tecken, samma slide); min-fyllnad = prosa-rutor (budget > 80) ≥ 50 % av budgetChars; volymkorridor 8 000–14 000 tecken/deck.
- Mätkoden i `src/lib/pptx-template/measure/` får INTE ändras — harnessen konsumerar den.
- Genereringen/rendering får INTE ändras i denna plan (rattarna vrids av forskarloopen SENARE, på egen branch). Enda undantaget: Task 1:s beteendeneutrala seam.
- Testkommandon: `npm test -- --run <fil>`, `npx tsc --noEmit`, `npm run lint`.
- Inga live-API-anrop i tester. Orkestratorns provkörning (Task 6) kostar ~$1,5 och kräver PowerPoint stängt + Supabase vaken.

## Filkarta

| Fil | Ansvar | Task |
|---|---|---|
| `src/lib/bid-generator/budget-rules.ts` (create) | Rattens säte: `effectiveBudget()` — identitet idag, forskarloopens vridpunkt | 1 |
| `src/lib/bid-generator/generate-from-profile.ts` (modify, 2 rader) | budgetChars slussas genom `effectiveBudget` | 1 |
| `src/lib/overflow-eval/types.ts` (create) | Datamodell: fixturer, mått, gate-resultat, varvrapport | 2 |
| `src/lib/overflow-eval/gates.ts` (create) | Fitness v1 — de fem grindarna + känd-defekt-filtret | 2 |
| `src/lib/overflow-eval/text-metrics.ts` (create) | Dubblett-par ≥0,3, fyllnad, volym ur sektioner+profil | 3 |
| `src/lib/overflow-eval/report.ts` (create) | rapport.json + rapport.md + delta mot föregående varv | 4 |
| `evals/overflow/fixtures.json` (create, FRYST) | 5 fixturer: analysisId + teamConsultantIds + templateId | 5 |
| `evals/overflow/known-template-defects.json` (create, FRYST) | Malldefekt-signaturer ur TOMMA mallens scan | 5 |
| `scripts/overflow-bootstrap.ts` (create) | Engångs: föreslå fixturer + härled defektlistan | 5 |
| `scripts/overflow-eval.ts` (create) | Orkestratorn — ETT varv | 6 |
| `package.json` (modify) | `"overflow:eval"`, `"overflow:bootstrap"` | 5–6 |
| `notes/overflow-loop-protokoll.md` (create) | Forskarprotokollet (Del 2) | 7 |
| `notes/ROADMAP.md` (modify) | Bocka av harness-bygget | 7 |

Tester bredvid respektive modul i `src/lib/overflow-eval/__tests__/` samt `src/lib/bid-generator/__tests__/budget-rules.test.ts`.

---

### Task 1: Rattens säte — `budget-rules.ts` (beteendeneutral seam)

**Files:**
- Create: `src/lib/bid-generator/budget-rules.ts`
- Modify: `src/lib/bid-generator/generate-from-profile.ts` (slot-mappningen, ~rad 123–127)
- Test: `src/lib/bid-generator/__tests__/budget-rules.test.ts` (create)

**Interfaces:**
- Produces: `effectiveBudget(budgetChars: number | undefined): number | undefined` — forskarloopens whitelistade ratt. Identitet idag.

- [ ] **Step 1: Failande test**

```ts
import { describe, it, expect } from "vitest";
import { effectiveBudget } from "../budget-rules";

describe("effectiveBudget", () => {
  it("är identitet i basläget (inga regler aktiva)", () => {
    expect(effectiveBudget(540)).toBe(540);
    expect(effectiveBudget(80)).toBe(80);
    expect(effectiveBudget(undefined)).toBeUndefined();
  });
});
```

Kör: `npm test -- --run src/lib/bid-generator/__tests__/budget-rules.test.ts` → FAIL (modul saknas).

- [ ] **Step 2: Implementera**

`src/lib/bid-generator/budget-rules.ts`:

```ts
/**
 * Budgetregler — overflow-loopens whitelistade ratt (design
 * notes/2026-07-15-overflow-loop-design.md). Generella regler ovanpå profilens
 * uppmätta budgetChars (säkerhetsfaktor, enrads-hantering, MAX-slot-behandling).
 * BASLÄGE: identitet — harness-bygget ändrar inget beteende; forskarloopen
 * vrider här, aldrig i profilens uppmätta värden.
 */
export function effectiveBudget(
  budgetChars: number | undefined,
): number | undefined {
  return budgetChars;
}
```

I `generate-from-profile.ts`: importera `effectiveBudget` och ändra slot-mappningen
(raden `...(slot.budgetChars !== undefined ? { budgetChars: slot.budgetChars } : {})`) till:

```ts
      const budget = effectiveBudget(slot.budgetChars);
      slots.push({
        placeholder: slot.placeholder,
        intent: slot.intent,
        ...(budget !== undefined ? { budgetChars: budget } : {}),
      });
```

(Anchor: `if (slot.capability !== "generic-prose") continue;`-loopen. Rör inget annat.)

- [ ] **Step 3: Verifiera + committa**

Kör: `npm test -- --run src/lib/bid-generator` → PASS (alla), `npx tsc --noEmit` → 0 fel.

```powershell
git add src/lib/bid-generator/budget-rules.ts src/lib/bid-generator/generate-from-profile.ts src/lib/bid-generator/__tests__/budget-rules.test.ts
git commit -m "feat(overflow-eval): budget-rules seam — identity today, research knob later"
```

---

### Task 2: Fitness-grindarna

**Files:**
- Create: `src/lib/overflow-eval/types.ts`
- Create: `src/lib/overflow-eval/gates.ts`
- Test: `src/lib/overflow-eval/__tests__/gates.test.ts` (create)

**Interfaces:**
- Consumes: `MeasurementFile`, `ShapeMeasurementV2`, `Finding` från `@/lib/pptx-template/measure/types` (fält: `boundHeightPt`, `heightPt`, `slide`, `shape`/`name`, `checkId`, `severity`).
- Produces:

```ts
// types.ts
export interface OverflowFixture { id: string; label: string; analysisId: string; teamConsultantIds: string[] }
export interface FixturesFile { templateId: string; fixtures: OverflowFixture[] }
export interface KnownDefect { slide: number; checkId: string; shape: string; note: string }
export interface DuplicatePair { a: string; b: string; slide: number; similarity: number }
export interface FillEntry { placeholder: string; budgetChars: number; textChars: number; ratio: number }
export interface BidMeasurement {
  fixtureId: string; label: string; bidId: string;
  findings: Finding[]; measurement: MeasurementFile;
  duplicates: DuplicatePair[]; fill: FillEntry[]; totalChars: number;
}
export type GateId = "fail-findings" | "gross-overflow" | "duplicates" | "min-fill" | "volume-corridor";
export interface GateBreach { gate: GateId; detail: string }
export interface GateResult { fixtureId: string; label: string; pass: boolean; breaches: GateBreach[]; excludedDefects: Finding[] }
// gates.ts
export const GROSS_OVERFLOW_RATIO = 1.25;
export const GROSS_OVERFLOW_ABS_PT = 30;
export const DUP_PAIR_THRESHOLD = 0.3;
export const MIN_FILL_RATIO = 0.5;
export const VOLUME_MIN = 8000;
export const VOLUME_MAX = 14000;
export function applyGates(bid: BidMeasurement, knownDefects: KnownDefect[]): GateResult;
```

- [ ] **Step 1: Failande tester** (`gates.test.ts` — bygg minimala fixturer inline)

```ts
import { describe, it, expect } from "vitest";
import { applyGates } from "../gates";
import type { BidMeasurement, KnownDefect } from "../types";
import type { Finding, ShapeMeasurementV2 } from "@/lib/pptx-template/measure/types";

function shape(over: Partial<ShapeMeasurementV2>): ShapeMeasurementV2 {
  return {
    slide: 1, name: "Text 1", topPt: 0, leftPt: 0, widthPt: 100, heightPt: 100,
    boundHeightPt: 100, boundWidthPt: 100, marginTopPt: 0, marginBottomPt: 0,
    marginLeftPt: 0, marginRightPt: 0, wordWrap: true, autoSize: 0,
    fontSizePt: 12, textPrefix: "x", textLength: 100, ...over,
  };
}
function fail(slide: number, shapeName: string): Finding {
  return { checkId: "outside-slide", severity: "FAIL", slide, shape: shapeName, detail: "d" };
}
function bid(over: Partial<BidMeasurement>): BidMeasurement {
  return {
    fixtureId: "f1", label: "test", bidId: "b1", findings: [],
    measurement: { slideCount: 1, slideWidthPt: 1440, slideHeightPt: 810, shapes: [] },
    duplicates: [], fill: [], totalChars: 10000, ...over,
  };
}

describe("applyGates", () => {
  it("passerar ett rent anbud", () => {
    const r = applyGates(bid({}), []);
    expect(r.pass).toBe(true);
    expect(r.breaches).toEqual([]);
  });

  it("FAIL-fynd fäller — utom känd-defekt-träffar (exkluderas + rapporteras)", () => {
    const defects: KnownDefect[] = [{ slide: 9, checkId: "outside-slide", shape: "Text 5", note: "statisk" }];
    const r = applyGates(bid({ findings: [fail(9, "Text 5"), fail(4, "Text 21")] }), defects);
    expect(r.pass).toBe(false);
    expect(r.breaches.map((b) => b.gate)).toEqual(["fail-findings"]);
    expect(r.excludedDefects).toHaveLength(1);
  });

  it("grov overflow: kvot > 1,25 fäller, 1,17 gör inte det", () => {
    const grov = shape({ heightPt: 26, boundHeightPt: 216 });
    const kicker = shape({ heightPt: 47, boundHeightPt: 54.81 });
    const r1 = applyGates(bid({ measurement: { slideCount: 1, slideWidthPt: 1440, slideHeightPt: 810, shapes: [grov] } }), []);
    const r2 = applyGates(bid({ measurement: { slideCount: 1, slideWidthPt: 1440, slideHeightPt: 810, shapes: [kicker] } }), []);
    expect(r1.breaches.map((b) => b.gate)).toContain("gross-overflow");
    expect(r2.pass).toBe(true);
  });

  it("absolut överskott > 30pt fäller även under kvoten", () => {
    const s = shape({ heightPt: 392, boundHeightPt: 447.92 }); // 1,14× men +55,9pt
    const r = applyGates(bid({ measurement: { slideCount: 1, slideWidthPt: 1440, slideHeightPt: 810, shapes: [s] } }), []);
    expect(r.breaches.map((b) => b.gate)).toContain("gross-overflow");
  });

  it("dubblettpar, undermålig fyllnad och volym utanför korridoren fäller", () => {
    const r = applyGates(
      bid({
        duplicates: [{ a: "x", b: "y", slide: 3, similarity: 0.42 }],
        fill: [{ placeholder: "{Metod}", budgetChars: 540, textChars: 100, ratio: 0.19 }],
        totalChars: 4000,
      }),
      [],
    );
    expect(r.breaches.map((b) => b.gate).sort()).toEqual(["duplicates", "min-fill", "volume-corridor"]);
  });
});
```

Kör: `npm test -- --run src/lib/overflow-eval/__tests__/gates.test.ts` → FAIL (modul saknas).

- [ ] **Step 2: Implementera** `types.ts` (exakt Produces-blocket ovan, med imports från measure/types) och `gates.ts`:

```ts
import type { Finding } from "@/lib/pptx-template/measure/types";
import type { BidMeasurement, GateBreach, GateResult, KnownDefect } from "./types";

/** Fitness v1 — FRYST under en forskningskörning (design 2026-07-15).
 *  Trösklarna ändras av människa via PR, aldrig av loopen. */
export const GROSS_OVERFLOW_RATIO = 1.25;
export const GROSS_OVERFLOW_ABS_PT = 30;
export const DUP_PAIR_THRESHOLD = 0.3;
export const MIN_FILL_RATIO = 0.5;
export const VOLUME_MIN = 8000;
export const VOLUME_MAX = 14000;

function isKnownDefect(f: Finding, defects: KnownDefect[]): boolean {
  return defects.some((d) => d.slide === f.slide && d.checkId === f.checkId && d.shape === f.shape);
}

export function applyGates(bid: BidMeasurement, knownDefects: KnownDefect[]): GateResult {
  const breaches: GateBreach[] = [];
  const excludedDefects = bid.findings.filter((f) => f.severity === "FAIL" && isKnownDefect(f, knownDefects));
  const realFails = bid.findings.filter((f) => f.severity === "FAIL" && !isKnownDefect(f, knownDefects));
  if (realFails.length > 0) {
    breaches.push({ gate: "fail-findings", detail: realFails.map((f) => `slide ${f.slide} ${f.shape}: ${f.detail}`).join("; ") });
  }
  const gross = bid.measurement.shapes.filter((s) => {
    const over = s.boundHeightPt - s.heightPt;
    return s.boundHeightPt > GROSS_OVERFLOW_RATIO * s.heightPt || over > GROSS_OVERFLOW_ABS_PT;
  });
  if (gross.length > 0) {
    breaches.push({ gate: "gross-overflow", detail: gross.map((s) => `slide ${s.slide} ${s.name}: ${s.boundHeightPt}pt i ${s.heightPt}pt-box`).join("; ") });
  }
  const dups = bid.duplicates.filter((d) => d.similarity >= DUP_PAIR_THRESHOLD);
  if (dups.length > 0) {
    breaches.push({ gate: "duplicates", detail: dups.map((d) => `slide ${d.slide}: ${d.similarity.toFixed(2)}`).join("; ") });
  }
  const thin = bid.fill.filter((f) => f.ratio < MIN_FILL_RATIO);
  if (thin.length > 0) {
    breaches.push({ gate: "min-fill", detail: thin.map((f) => `${f.placeholder}: ${f.textChars}/${f.budgetChars}`).join("; ") });
  }
  if (bid.totalChars < VOLUME_MIN || bid.totalChars > VOLUME_MAX) {
    breaches.push({ gate: "volume-corridor", detail: `${bid.totalChars} tecken (korridor ${VOLUME_MIN}–${VOLUME_MAX})` });
  }
  return { fixtureId: bid.fixtureId, label: bid.label, pass: breaches.length === 0, breaches, excludedDefects };
}
```

OBS: kolla `checkVerticalOverflow` i `measure/verdicts.ts` innan du låser overflow-matten — om den räknar marginaler in i inre höjden ska grov-overflow använda SAMMA inre höjd (heightPt − marginTopPt − marginBottomPt). Testvärdena ovan har marginal 0 så de gäller oavsett.

- [ ] **Step 3: Kör test → PASS. `npx tsc --noEmit` → 0 fel. Commit**

```powershell
git add src/lib/overflow-eval/types.ts src/lib/overflow-eval/gates.ts src/lib/overflow-eval/__tests__/gates.test.ts
git commit -m "feat(overflow-eval): fitness v1 gates with known-defect exclusion"
```

---

### Task 3: Textmåtten — dubbletter, fyllnad, volym

**Files:**
- Create: `src/lib/overflow-eval/text-metrics.ts`
- Test: `src/lib/overflow-eval/__tests__/text-metrics.test.ts` (create)

**Interfaces:**
- Consumes: `duplicatePairs` från `@/lib/text-similarity` (samma funktion som deck:dupes; kolla exakt signatur i filen — den tar slide-grupperade texter och returnerar par med `similarity`), `buildSlotMeta` från `@/lib/bid-editor/slot-meta`, `TemplateProfile`, `BidSection`.
- Produces:

```ts
export function collectDuplicates(sections: BidSection[], meta: SlotMeta): DuplicatePair[]; // par ≥ 0,3, ≥120 tecken, samma slide (slide ur meta)
export function collectFill(sections: BidSection[], meta: SlotMeta): FillEntry[];           // prosa-rutor: budget > 80
export function totalProseChars(sections: BidSection[]): number;
```

- [ ] **Step 1: Failande tester**

```ts
import { describe, it, expect } from "vitest";
import { collectDuplicates, collectFill, totalProseChars } from "../text-metrics";
import type { SlotMeta } from "@/lib/bid-editor/slot-meta";
import type { BidSection } from "@/lib/types";

const meta: SlotMeta = {
  "{A}": { slide: 3, shortField: false, intent: "a", budgetChars: 540 },
  "{B}": { slide: 3, shortField: false, intent: "b", budgetChars: 540 },
  "{C}": { slide: 5, shortField: false, intent: "c", budgetChars: 400 },
  "{Dnr}": { slide: 3, shortField: true, intent: "dnr", budgetChars: 40 },
};
function sec(placeholder: string, text: string): BidSection {
  return { type: "ai", key: placeholder, title: placeholder, generatedAt: "", content: { format: "generic-prose", placeholder, text } } as BidSection;
}
const långText = "Vi kartlägger styrmodellen i fyra steg med intervjuer och workshops. ".repeat(3);

describe("text-metrics", () => {
  it("hittar par ≥0,3 på samma slide, ignorerar olika slides och korta texter", () => {
    const d = collectDuplicates(
      [sec("{A}", långText), sec("{B}", långText), sec("{C}", långText), sec("{Dnr}", "123")],
      meta,
    );
    expect(d).toHaveLength(1);
    expect(d[0].slide).toBe(3);
    expect(d[0].similarity).toBeGreaterThan(0.9);
  });

  it("fyllnad räknas bara på prosa-rutor (budget > 80)", () => {
    const f = collectFill([sec("{A}", "kort"), sec("{Dnr}", "123")], meta);
    expect(f).toHaveLength(1);
    expect(f[0].placeholder).toBe("{A}");
    expect(f[0].ratio).toBeCloseTo(4 / 540, 3);
  });

  it("totalvolym summerar generic-prose-text", () => {
    expect(totalProseChars([sec("{A}", "abc"), sec("{C}", "de")])).toBe(5);
  });
});
```

Kör → FAIL (modul saknas).

- [ ] **Step 2: Implementera** — gruppera sektionstexter per slide via meta; anropa `duplicatePairs` per slide-grupp med min-längd 120 (samma konstant som deck:dupes — importera/duplicera medvetet med kommentar); fyllnad = `text.length / budgetChars` för `!shortField && budgetChars > 80`; volym = summa `content.text.length` över generic-prose. Läs `src/lib/text-similarity.ts` för exakt `duplicatePairs`-signatur och anpassa anropet — behåll tröskeln 0,3 i FILTRERINGEN (gates-konstanten), inte i mätaren (rapportera alla par ≥ 0,3).

- [ ] **Step 3: Kör test → PASS. tsc → 0 fel. Commit**

```powershell
git add src/lib/overflow-eval/text-metrics.ts src/lib/overflow-eval/__tests__/text-metrics.test.ts
git commit -m "feat(overflow-eval): text metrics — duplicate pairs, fill ratio, volume"
```

---

### Task 4: Varvrapporten

**Files:**
- Create: `src/lib/overflow-eval/report.ts`
- Test: `src/lib/overflow-eval/__tests__/report.test.ts` (create)

**Interfaces:**
- Consumes: `GateResult`, `BidMeasurement` (Task 2).
- Produces:

```ts
export interface RunReport {
  varv: number; timestamp: string; branchCommit: string;
  bids: { fixtureId: string; label: string; bidId: string; gate: GateResult;
          failCount: number; grossOverflowCount: number; dupCount: number; totalChars: number }[];
  aggregate: { passed: number; total: number; failFindings: number; grossOverflows: number; dupPairs: number };
  delta: { failFindings: number; grossOverflows: number; dupPairs: number; passed: number } | null;
  costUsdRun: number; costUsdAccumulated: number;
}
export function buildRunReport(input: { varv: number; branchCommit: string; results: { bid: BidMeasurement; gate: GateResult }[]; previous: RunReport | null; costUsdRun: number; costUsdAccumulated: number }): RunReport;
export function renderMarkdown(report: RunReport): string;
```

- [ ] **Step 1: Failande tester** — bygg två `RunReport`-ingångar (varv 1 utan previous → `delta: null`; varv 2 med previous → korrekta deltan, t.ex. failFindings 5→3 ⇒ delta −2). Assertera aggregat-räkningen (passed/total, summerade fynd), delta-tecknet, och att `renderMarkdown` innehåller: rubrik med varv + pass-kvot (`3/5 PASS`), en rad per anbud med breaches, delta-sektion, kostnadsrad, samt listan över exkluderade malldefekter. Skriv testerna konkret (exakta förväntade strängfragment via `toContain`).

- [ ] **Step 2: Implementera** `buildRunReport` (ren aggregering + delta = previous.aggregate − current.aggregate per mått, tecknat så att förbättring är negativ) och `renderMarkdown` (kompakt md: tabell per anbud, delta-rader med ▲/▼, kostnad ack./tak $50).

- [ ] **Step 3: Kör test → PASS. tsc → 0 fel. Commit**

```powershell
git add src/lib/overflow-eval/report.ts src/lib/overflow-eval/__tests__/report.test.ts
git commit -m "feat(overflow-eval): run report — aggregate, delta, markdown"
```

---

### Task 5: Fixturer + känd-defekt-listan (bootstrap)

**Files:**
- Create: `scripts/overflow-bootstrap.ts`
- Create (genererade + frysta): `evals/overflow/fixtures.json`, `evals/overflow/known-template-defects.json`
- Modify: `package.json` (script `"overflow:bootstrap": "tsx scripts/overflow-bootstrap.ts"`)

**Interfaces:**
- Consumes: Supabase service client (mönster: `scripts/calibrate-budgets.ts` — kolla dess env-bootstrap och kopiera), `readPptxSlides`/measure-flödet ur `scripts/scan-deck.ts`.
- Produces: de två frysta JSON-filerna enligt `FixturesFile`/`KnownDefect[]`-typerna.

- [ ] **Step 1: Skriv bootstrap-skriptet** med två delar:

(a) **Fixturer:** för de fem analys-id:na (hårdkoda listan — verifierad i dev-DB 2026-07-15):
`930bc471-...` (styrmodell/RetailTech — hämta FULLT id via query på created_at, skriptet listar `analyses` och matchar på titel), bemanning/Göteborg, dataplattform/Sörmland, strategi/NIC (senaste varianten), organisationsöversyn/Mellansvenska. Team per fixtur: senaste `bids.team_consultant_ids` för analysen om ett anbud finns, annars top-3 `consultantId` ur senaste `matches.team_proposal`. `templateId`: `25f9d500-911f-4afb-8fc0-a30f8220c477` (Radrum v4). Skriv `evals/overflow/fixtures.json` och LOGGA valen läsbart.

(b) **Känd-defekt-listan:** ladda TOMMA Radrum-mallen (templates-radens `storage_path` för v4 — originalfilen, inte den instrumenterade; verifiera vilken fil som är ointrumenterad via template-store) → kör measure-flödet (samma som scan-deck.ts: `measure-overflow.ps1` → verdicts-checkarna) → alla FAIL-fynd blir `KnownDefect`-poster (`slide`, `checkId`, `shape`, `note: "tom mall — statisk defekt"`). Grov-overflow ur tomma mallen tas OCKSÅ med som defekter (statiska boxar som redan overflowar). Skriv `evals/overflow/known-template-defects.json`.

- [ ] **Step 2: Kör bootstrap** (kräver PowerPoint stängt + Supabase vaken):

Kör: `npm run overflow:bootstrap`
Förväntat: båda JSON-filerna skrivna; fixturer = 5 poster med team-id:n; defektlistan innehåller minst slide 9-signaturen (känd sedan facit-valideringen).

- [ ] **Step 3: Granska + frys + committa**

Läs igenom båda filerna (rimliga team? defekter bara statiska?).

```powershell
git add scripts/overflow-bootstrap.ts evals/overflow/fixtures.json evals/overflow/known-template-defects.json package.json
git commit -m "feat(overflow-eval): frozen fixtures + template-defect exclusion list (bootstrap)"
```

---

### Task 6: Orkestratorn — `npm run overflow:eval`

**Files:**
- Create: `scripts/overflow-eval.ts`
- Modify: `package.json` (script `"overflow:eval": "tsx scripts/overflow-eval.ts"`)

**Interfaces:**
- Consumes: allt ovan + `runBidGeneration` (`@/lib/bid-generator/run-bid-generation`), `fetchConsultantsByIds`/`EMPTY_GO_NO_GO` (`@/lib/supabase`), `loadTemplate` (`@/lib/pptx-template/template-store`), `loadActiveProfile` (`@/lib/org-profile`), `renderFromProfile`, `loadTemplateProfile`, `buildMasterContext` (`src/app/api/bids/[id]/export/build-master-context`), `buildSlotMeta`.

- [ ] **Step 1: Skriv orkestratorn** — flödet per varv (flaggor: `--varv N` obligatorisk, `--only <fixtureId>` för billig provkörning, `--keep-bids` för felsökning):

```
1. Ladda fixtures.json + known-template-defects.json + ev. föregående runs-katalogs rapport.json
2. Polla Supabase (enkel select) — fail fast med tydligt fel om pausad
3. Per fixtur (sekventiellt — API-vänligt):
   a. hämta analysis-raden, team via fetchConsultantsByIds, scoredConsultants ur senaste matches.team_proposal
   b. insert bids-rad (status 'generating', template_id ur fixtures, team_consultant_ids)
   c. ctx = { analysis, teamConsultants, scoredConsultants, goNoGoResult: EMPTY_GO_NO_GO, userId: null, bidId, profile: await loadActiveProfile() }
   d. await runBidGeneration(supabase, bidId, ctx, { id: templateId, manifest: template.manifest })  // direkt, INTE after()
   e. läs tillbaka bids-raden: status 'draft' krävs (failed → varvet avbryts med rapporterat fel, INTE "ingen förbättring")
   f. rendera: storedProfile = await loadTemplateProfile(templateId); buffer = await renderFromProfile(template, storedProfile, sections, buildMasterContext({ analysis, now: new Date(), companyName: profile?.companyName }))
   g. skriv evals/overflow/runs/varv-NN/<fixtureId>.pptx
   h. mät: measure-overflow.ps1 → MeasurementFile + font-scales → verdicts-checkarna (kopiera scan-deck.ts-flödet exakt, inkl. deadspaceFindings som observationsdata)
   i. textmått: buildSlotMeta(storedProfile) → collectDuplicates/collectFill/totalProseChars på sections
   j. applyGates(...)
4. Kostnad: sum(ai_call_logs.cost_usd) where bid_id in varvets bid-ids; ackumulerat = summa över alla runs-katalogers rapport.json + denna
5. buildRunReport + renderMarkdown → evals/overflow/runs/varv-NN/rapport.{json,md}; skriv även scan-rådata per anbud
6. Städa: delete bids-raderna (om inte --keep-bids)
7. Exit 0 om alla PASS, 1 annars (loop-drivaren läser exit-koden)
```

`template` hämtas en gång via `loadTemplate(fixtures.templateId)`. Env-bootstrap: samma mönster som `scripts/calibrate-budgets.ts`.

- [ ] **Step 2: Typecheck + svit** — `npx tsc --noEmit` → 0 fel; `npm test -- --run` → grönt (orkestratorn har inga egna enhetstester — den är tunn komposition över testade moduler; verifieringen är provkörningen).

- [ ] **Step 3: Provkörning (≈$1,5; PowerPoint stängt, Supabase vaken)**

Kör: `npm run overflow:eval -- --varv 0 --only <styrmodell-fixtureId>`
Förväntat: `evals/overflow/runs/varv-00/` med pptx + rapport.json + rapport.md; rapporten visar rimliga siffror (jämför mot dagens smoke: FAIL ~0–3 efter defekt-exkludering, grova overflow > 0); bids-raden städad ur DB.

- [ ] **Step 4: Commit**

```powershell
git add scripts/overflow-eval.ts package.json
git commit -m "feat(overflow-eval): orchestrator — one full measurement round"
```

(runs-katalogen gitignoras INTE — varvens rapporter är forskningsserien. Lägg dock `*.pptx` under `evals/overflow/runs/` i `.gitignore`; decken är stora och återskapbara.)

---

### Task 7: Forskarprotokollet + ROADMAP + PR

**Files:**
- Create: `notes/overflow-loop-protokoll.md`
- Modify: `notes/ROADMAP.md` (OVERFLOW-LOOP-punkten)
- Modify: `.gitignore` (pptx-raden från Task 6)

- [ ] **Step 1: Skriv protokollet** — kondensera Del 2 ur designen till körbara regler för drivarsessionen: varvsflödet (kör → analysera → EN ändring → svit+tsc+lint → commit `loop(varv N): <ändring> — FAIL a→b, grova c→d, dupes e→f, $X ack.` → skicka rapport.md till Stefan proaktivt → stoppvillkorskoll), whitelistade filer (`bundles/generic-prose.ts`, `budget-rules.ts`, ev. enforcement i `generate-from-profile.ts`), frysta ytor (mätkod, gates, models.ts, profiler, fixturer, defektlista), stoppvillkor (konvergens 2 varv i rad / ingen förbättring 3 varv / $50), förkrav per varv (PowerPoint stängt, Supabase vaken, maskinen ostörd), avslut (slutrapport + Stefans visuella dom → PR).

- [ ] **Step 2: ROADMAP** — uppdatera OVERFLOW-LOOP-punkten: harness levererad (denna PR), forskningskörningen är nästa steg (körs på `feat/overflow-loop` enligt protokollet).

- [ ] **Step 3: Commit + PR**

```powershell
git add notes/overflow-loop-protokoll.md notes/ROADMAP.md .gitignore
git commit -m "docs: overflow research protocol + roadmap tick for harness"
git push -u bidsmith feat/overflow-harness
gh pr create --repo DaVincisfather/bidsmith --title "Overflow-eval harness: measurement round, fitness gates, frozen fixtures" --body @'
## Vad

Mät-varvet för overflow-loopen (design: `notes/2026-07-15-overflow-loop-design.md`):

- `npm run overflow:eval -- --varv N` — genererar 5 anbud mot frysta fixturer (Radrum v4), exporterar, COM-mäter (measure-core), applicerar fitness v1-gates (0 FAIL exkl. malldefekter, grov overflow >1,25×/+30pt, parvisa dubbletter ≥0,3, min-fyllnad 50 %, volymkorridor 8–14k) och skriver varvrapport (json+md, delta, kostnad ur ai_call_logs). Eval-anbuden städas ur DB.
- `npm run overflow:bootstrap` — engångs: fryser fixturer + härleder känd-defekt-listan ur TOMMA mallens scan.
- `budget-rules.ts` — beteendeneutral seam (identitet) som blir forskarloopens whitelistade ratt.
- `notes/overflow-loop-protokoll.md` — den autonoma drivarsessionens regler (skyddsräcken, stoppvillkor, rapport till Stefan per varv).

Ingen beteendeändring i generering/rendering; mätkoden orörd.

## Underlag

- Design: `notes/2026-07-15-overflow-loop-design.md`
- Plan: `notes/2026-07-15-overflow-loop-plan.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01VHQKrbKWQMz852FrLb9cNH
'@
```

**Invänta PR-review-routinens kommentar + grön CI före squash-merge.** Forskningskörningen startar EFTER merge, på egen branch `feat/overflow-loop` enligt protokollet.

---

## Självgranskning (utförd vid planskrivning)

- Spec-täckning: harness-flödets 6 steg (Task 5–6), fitness v1 komplett med alla fem grindar + defekt-exkludering (Task 2–3), rapport/delta/kostnad (Task 4), ratt-seamen (Task 1), protokollet Del 2 (Task 7). Deadspace följer med som observationsdata via deadspaceFindings (Task 6 h).
- Typkonsistens: `BidMeasurement`/`GateResult`/`KnownDefect`/`DuplicatePair`/`FillEntry` definieras i Task 2 och konsumeras med samma namn i Task 3–4 och 6; `effectiveBudget`-signaturen i Task 1 matchar anropet; gates-konstanterna matchar specens frysta trösklar.
- Medvetna avsteg från specen: känd-defekt-listan härleds mekaniskt ur TOMMA mallens scan (i stället för handplockade slide 2/4/8/9-signaturer) — ärligare: innehållsdrivna FAIL på slide 2/4/8 STANNAR i målet eftersom mindre text kan fixa dem. Specens princip ("listan uppdateras endast av människa") består.
