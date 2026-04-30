# PPTX bullets-pass — P1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Etablera soft-cap-instrumentering (helper + tester) och uppgradera sample-fixturen till en stress-fixture, så att P2-P4 har mätinstrument och regressionsskydd när de börjar fixar bullets/bold/overflow.

**Architecture:** En ren helper-modul `_soft-cap.ts` som exporterar `softCap(slide, field, text, threshold)` — loggar `console.warn` när text > threshold, mutterar inte. Anropas inte av applikatorer i P1; integration sker i P2-P4. Sample-fixturen uppgraderas med stress-värden för fält som mappas i specens threshold-tabell, så när P2 börjar integrera helpern produceras observerbara warnings vid render.

**Tech Stack:** TypeScript, Vitest, tsx (för fixture-script).

**Spec:** `docs/superpowers/specs/2026-04-29-pptx-bullets-pass-design.md`

---

## File Structure

- **Create:** `src/lib/pptx-template/applicators/_soft-cap.ts` — soft-cap-helper
- **Create:** `src/lib/pptx-template/applicators/__tests__/soft-cap.test.ts` — unit-tester
- **Modify:** `scripts/generate-sample-pptx.ts` — uppgradera fixture-värden enligt spec

Inga applikatorer rörs i P1.

---

## Task 1: Soft-cap helper med unit-tester

**Files:**
- Create: `src/lib/pptx-template/applicators/_soft-cap.ts`
- Create: `src/lib/pptx-template/applicators/__tests__/soft-cap.test.ts`

- [ ] **Step 1: Write the failing test**

Skriv `src/lib/pptx-template/applicators/__tests__/soft-cap.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { softCap } from "../_soft-cap";

describe("softCap", () => {
  it("emits a console.warn when text length exceeds threshold", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    softCap(7, "phase.objective", "x".repeat(121), 120);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("slide 7");
    expect(warn.mock.calls[0][0]).toContain("phase.objective");
    expect(warn.mock.calls[0][0]).toContain("121");
    expect(warn.mock.calls[0][0]).toContain("120");
    warn.mockRestore();
  });

  it("does not warn when text length equals threshold", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    softCap(7, "phase.objective", "x".repeat(120), 120);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("does not warn when text length is below threshold", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    softCap(11, "section.checkpoints[0]", "kort text", 80);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("does not mutate or return the input text", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const input = "x".repeat(200);
    const result = softCap(6, "phase.name", input, 40);
    expect(result).toBeUndefined();
    expect(input.length).toBe(200);
    warn.mockRestore();
  });

  it("handles empty string without warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    softCap(7, "phase.objective", "", 120);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- soft-cap
```

Expected: FAIL — `Cannot find module '../_soft-cap'` (modulen finns inte än).

- [ ] **Step 3: Write minimal implementation**

Skriv `src/lib/pptx-template/applicators/_soft-cap.ts`:

```ts
/**
 * Soft-cap warning helper for PPTX-template applicators.
 *
 * Loggar en varning till `console.warn` när `text.length` överskrider
 * `threshold`. Modifierar inte text. Anropas innan textreplacement i
 * applikatorn för fält där overflow är känt risk i mall-textboxen.
 *
 * Tröskelvärden är design-tider uppskattningar (se spec
 * 2026-04-29-pptx-bullets-pass-design.md). De kalibreras när stress-fixturen
 * körs och overflow-fixarna är på plats per slide.
 */
export function softCap(
  slide: number,
  field: string,
  text: string,
  threshold: number,
): void {
  if (text.length > threshold) {
    console.warn(
      `[soft-cap] slide ${slide} field '${field}' length ${text.length} > recommended ${threshold} — overflow likely`,
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- soft-cap
```

Expected: PASS — alla 5 tester gröna.

- [ ] **Step 5: Run typecheck to ensure no type errors**

```bash
npx tsc --noEmit
```

Expected: PASS — inga fel.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pptx-template/applicators/_soft-cap.ts src/lib/pptx-template/applicators/__tests__/soft-cap.test.ts
git commit -m "feat(pptx): add soft-cap warning helper for overflow-risk fields"
```

---

## Task 2: Stress-fixture-uppgradering

**Files:**
- Modify: `scripts/generate-sample-pptx.ts`

Uppgradera fixture-värden enligt spec-tabellen. **Inga andra ändringar** — vi rör bara strängvärden i fixture, inte typer eller import.

Per slide-fält (referera spec:ens tabell "Sample-fixture-uppgradering"):

| Slide | Fält | Stress-värde |
|---|---|---|
| 6 | `phases[0].name` | "Förankra uppdrag och kartlägg nuläge" (45 chars > threshold 40) |
| 6 | `phases[i].period` (eller `duration` om period saknas) | minst en phase: "M1–M2 + 2v" (10 chars > threshold 10 = test edge) |
| 7 | `phases[0].objective` | 150-chars sentence (> threshold 120) |
| 7-10 | `phases[*].risks` | 2-3 risker per phase, en > 80 chars |
| 7-10 | `phases[i].activities` | mix per kolumn: 1 kort, 1 medel, 1 stress (> 120 chars) |
| 7-10 | `phases[i].deliverables` | mix: 1 kort, 1 medel, 1 stress (> 100 chars) |
| 7-10 | `phases[i].decisions` | mix: 1 kort, 1 medel, 1 stress (> 100 chars) |
| 11 | `section.checkpoints` | AP 1 kort, AP 2 medel, AP 3-4 stress (> 80 chars) |
| 18 | `section.certs[3].description` (övrig cert) | 100-chars beskrivning (> threshold 80) |

- [ ] **Step 1: Read current fixture-värden**

Läs `scripts/generate-sample-pptx.ts` för att veta exakt struktur per section. Identifiera vilka object-literaler som motsvarar phases, checkpoints, certs.

- [ ] **Step 2: Modify slide 6 + 7-10 phases — name, period, objective, risks, activities, deliverables, decisions**

I `sections` arrayens phases-section, ändra `phases[0]` (Fas 1) så att:

```ts
{
  name: "Förankra uppdrag och kartlägg nuläge",  // 45 chars
  objective:
    "Etablera gemensam målbild med politisk styrgrupp och förvaltningsledning, validera nuläge mot dokumentation och säkra ledningsförankring för fortsatt arbete.", // 150 chars
  period: "M1–M2",
  duration: "4 v",
  risks: [
    "Politisk osäkerhet kring prioriteringar",
    "Begränsad tillgänglighet hos nyckelpersoner i styrgrupp och förvaltningsledning under sommarperioden — kan försena målbildsworkshop", // > 80 chars stress
  ],
  activities: [
    "Workshop med styrgrupp",  // kort
    "Genomgång av befintlig dokumentation och systeminventering", // medel
    "Djupintervjuer med nyckelpersoner i samtliga förvaltningar för att kartlägga arbetssätt, smärtpunkter och förbättringsmöjligheter inom respektive verksamhetsområde", // stress > 120 chars
  ],
  deliverables: [
    "Workshop-protokoll",  // kort
    "Nulägesrapport med systeminventering", // medel
    "Konsoliderad analys av smärtpunkter, identifierade utmaningar och prioriterade förbättringsområden för transformation, presenterad i styrgrupp", // stress > 100 chars
  ],
  decisions: [
    "Prioritering",  // kort
    "Godkännande av nulägesanalys", // medel
    "Beslut om scope och avgränsningar för nästa fas inklusive resursallokering, prioritering av arbetsspår och målbild för transformation", // stress > 100 chars
  ],
}
```

För `phases[1]` (Fas 2): sätt `period: "M1–M2 + 2v"` (10 chars edge — testar wrap-buggen Stefan flaggade på Gantt-spans). Behåll övriga fält men addera 1-2 risker.

För `phases[2]` (Fas 3) och `phases[3]` (Fas 4): addera 1-2 risker i varje (för att alla phase-detail-slides exercise:ar risker).

- [ ] **Step 3: Modify slide 11 quality-assurance section — checkpoints**

I quality-assurance-sektionen (`section.checkpoints`), sätt:

```ts
checkpoints: [
  "Veckovis avstämning",  // AP 1 kort
  "Månadsvis status med styrgrupp",  // AP 2 medel
  "Kvartalsvis djupgranskning av framdrift, kvalitet och nyttorealisering med styrkommitté",  // AP 3 stress > 80 chars
  "Halvårsvis benchmarking mot jämförbara regioner och uppdatering av roadmap baserat på lärdomar och förändrade förutsättningar",  // AP 4 stress > 80 chars
],
```

- [ ] **Step 4: Modify slide 18 certifications section — övrig cert description**

I certifications-sektionen, sätt `certs[3].description` (övrig cert) till:

```ts
description: "Ledningssystem för informationssäkerhet enligt branschstandard, ackrediterat av tredjeparts-certifieringsorgan",  // 100 chars
```

- [ ] **Step 5: Verifiera att fixture-scriptet fortfarande kör**

```bash
npx tsx scripts/generate-sample-pptx.ts
```

Expected: `Wrote NNN bytes to C:\Users\...\tmp\sample-bid.pptx`. Inga TypeScript-fel.

- [ ] **Step 6: Verifiera renderar grönt**

```bash
pwsh -File scripts/render-and-verify.ps1
```

Expected: alla 18 slides renderade utan fel. Visuella overflow-buggar förväntas — det är poängen med stress-fixturen, fixar kommer i P2-P4.

- [ ] **Step 7: Verifiera att alla pptx-template-tester fortfarande är gröna**

```bash
npm test -- pptx-template
```

Expected: alla tester gröna. Stress-fixturen ändrar bara fixture-script, inte applikator-tester.

- [ ] **Step 8: Commit**

```bash
git add scripts/generate-sample-pptx.ts
git commit -m "test(pptx): upgrade sample-pptx to stress-fixture for overflow audit"
```

---

## Task 3: Push branch + öppna PR

- [ ] **Step 1: Push branch**

```bash
git push -u origin feat/pptx-bullets-pass
```

- [ ] **Step 2: Skapa PR via gh**

```bash
gh pr create --title "P1: pptx soft-cap helper + stress-fixture (foundation)" --body "$(cat <<'EOF'
## Summary
- Soft-cap warning helper (`_soft-cap.ts`) — loggar console.warn när text överskrider rekommenderad längd för overflow-känsliga PPTX-textboxar. Modifierar inte text.
- Sample-fixture uppgraderad till stress-fixture: mix av korta/medel/stress-värden för fält som mappas i spec-tabellen.

P1 av 4 i bullets-pass-arbetet. Inga applikator-integrationer än — det kommer i P2-P4.

Spec: `docs/superpowers/specs/2026-04-29-pptx-bullets-pass-design.md`
Audit-källa: `notes/2026-04-29-pptx-full-audit-findings.md`

## Test plan
- [x] Unit-tester för `softCap` (5 tester gröna)
- [x] `npx tsc --noEmit` rent
- [x] `npx tsx scripts/generate-sample-pptx.ts` kör utan fel
- [x] `pwsh scripts/render-and-verify.ps1` renderar alla 18 slides
- [x] `npm test -- pptx-template` grönt

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Vänta in PR-review-routinen**

Per `project_pr_review_routine.md` — routine kommenterar automatiskt på agentic-dealflow PRs. Vänta in routinens kommentar innan squash-merge.

- [ ] **Step 4: Squash-merge när routine OK**

Manuellt via GitHub UI eller:

```bash
gh pr merge --squash --delete-branch
```

---

## Self-review

### Spec coverage

- ✅ Soft-cap helper (`_soft-cap.ts`) — Task 1
- ✅ Unit-tester för helpern — Task 1 step 1
- ✅ Stress-fixture med mix kort/medel/stress — Task 2
- ✅ Risker exercise:as på phases (Stefans flagga) — Task 2 step 2
- ✅ Verifierings-steg (typecheck, render, test) — Task 2 step 5-7
- ✅ Branch-disciplin (feat/pptx-bullets-pass från master) — redan satt, P1 startar från `bfdf790`
- ✅ PR-routine vänta-strategi — Task 3 step 3
- ⚠️ **Inte i P1:** Applikator-anrop till softCap — kommer i P2-P4. Mätinstrument är på plats men inte använda än.

### Placeholder scan

Inga TBD/TODO/"implement later". Alla code-blocks innehåller faktisk implementation.

### Type consistency

- `softCap(slide, field, text, threshold)` — signatur identisk i deklaration, tester, och spec.
- Threshold-värden (40/10/120/100/80) konsekventa med spec-tabellen.
- Fixture-fältnamn (`phases[i].name/objective/period/duration/risks/activities/deliverables/decisions`, `section.checkpoints`, `section.certs[i].description`) matchar `ExecutionPhase`-interface i `src/lib/types.ts:150` och övriga BidSectionContent-formats.
