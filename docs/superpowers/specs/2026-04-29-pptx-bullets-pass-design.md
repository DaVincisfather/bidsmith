# PPTX bullets-pass + overflow-skydd — design

**Datum:** 2026-04-29
**Branch:** `feat/pptx-bullets-pass`
**Worktree:** `agentic-dealflow-pptx/`
**Audit-källa:** `notes/2026-04-29-pptx-full-audit-findings.md`

---

## Bakgrund

Full audit av `templates/anbudsmall-v2.pptx` + sample-render genomförd 2026-04-29 (16 av 18 slides täckta; cover + TOC skippade). Findings landar i tre kategorier:

1. **Bullets/bold-pass** (känd backlog) — slide 3, 5, 7, 11.
2. **Text overflow / spillover** — slide 6 (fas-kort + Gantt-span), 7 (syftesbox), 11 (avstämningspunkter), 18 (cert-kort).
3. **Redesign-kandidater** — slide 13 (kravmatris), 14-16 (referenser), 17 (anbudssekretess). **Lyfta ur denna spec** — väntar på Claude Design-output.

PNG-rendering visade sig otillräcklig för overflow-bedömning (PowerPoint COM Export skalar text vid render). Implementation måste verifieras genom att öppna `tmp/sample-bid.pptx` i PowerPoint, inte bara genom PNG-jämförelse.

## Mål

- Bullets/bold/styling-fixar applicerade på mall.
- Overflow-känsliga fält har soft-cap-instrumentering: applikatorerna loggar varning när AI-text > rekommenderad längd.
- Sample-fixturen uppgraderad till stress-fixture för regressionsskydd.
- Inga visuella overflow-buggar synliga i PowerPoint vid stress-fixture-render.

## Icke-mål

- Hard-cap eller text-truncering med ellipsis.
- UI-yta för soft-cap-warnings (bara console).
- Redesign av kravmatris, referenser, anbudssekretess (egna tickets).
- Junto-rebrand-styling (egen branch, egen scope).
- Två separata fixturer (golden + stress) — en mix-fixture räcker.

---

## Arkitektur

Tre lager rörs:

### 1. Mall — `templates/anbudsmall-v2.pptx`
Stefan editerar i PowerPoint. Bullets, bold, textbox-storlekar, autofit-settings sätts här. Ingen kod-styling.

### 2. Applikatorer — `src/lib/pptx-template/applicators/*.ts`
Får ny soft-cap-helper som loggar (inte truncar) när text överskrider rekommenderad längd. Bullets/bold/styling rörs INTE i kod.

### 3. Sample-fixture — `scripts/generate-sample-pptx.ts`
Uppgraderas till mix-fixture: varje overflow-känsligt fält har minst ett kort, ett medellängd och ett stress-exempel.

### Verifierings-pipeline

För varje fix:

1. Edit mall (Stefan) + applikator/test (Claude).
2. `npx tsx scripts/generate-sample-pptx.ts` → producerar `tmp/sample-bid.pptx`.
3. `pwsh scripts/render-and-verify.ps1 -Slides "N"` → PNG för snabb-jämförelse.
4. **Öppna `tmp/sample-bid.pptx` i PowerPoint** — autoritativ overflow-check.
5. `npm test -- pptx-template`.
6. Console: soft-cap-warnings emitteras för stress-fält.
7. Commit → push → PR → vänta in PR-review-routinen → squash-merge.

---

## Mall-ändringar per slide

Stefan editerar i PowerPoint. Beslut "autofit shrink-on-overflow vs bredda box" tas per textbox under implementation (visuellt avgörande).

| Slide | Bullets | Bold | Overflow-fix |
|---|---|---|---|
| 3 — Kunden idag | Section B (smärtpunkter, 4) | Section A: "Organisation" / "System" / "Processer" som rubriker, styckesindelning så texten under varje rubrik på egen rad | — |
| 5 — Vad vi ser | Section A (utmaningar, 4) + B (värden, 4) | — | — |
| 6 — Genomförande översikt | — | — | Fas-kort: textbox för `{Fas N — namn}` (overflow på beskrivning). Gantt-rader: textbox för `{M1–M2}`-spans (wrap upp i raden ovanför). |
| 7 — Fas 1 (clone-mall) | A AKTIVITETER (4) + B LEVERANSER (3) + C BESLUT (3) | — | Syftesbox `{Mål}` (upper-right), spillover ofta. |
| 8-10 — Fas 2/3/4 | _automatiskt via clone_ | _via clone_ | _via clone_ |
| 11 — Kvalitetssäkring | Section A QA-process + Section C Eskalering | Section B: `{Namn, kvalitetsledare}` | Avstämningspunkt-boxar (AP 1-4), extrem spill ofta. |
| 18 — Certifieringar | — | — | Cert-kort (4 st), beskrivnings-text. |

**Princip för overflow-fix per box:**

1. Försök först **autofit "shrink on overflow"** (PowerPoint: textbox properties → autofit).
2. Om autofit ger oacceptabel mikrotext → **bredda boxen** fysiskt.
3. Aldrig hard-cap text i mallen — soft-warning via applikator istället.

**Inte rörda:** slide 1 (Cover), slide 2 (TOC), slide 4 (Uppdragsbeskrivning), slide 12 (Team) — OK enligt audit.

---

## Applikator-ändringar

### Ny helper

Fil: `src/lib/pptx-template/applicators/_soft-cap.ts`

```ts
export function softCap(slide: number, field: string, text: string, threshold: number): void {
  if (text.length > threshold) {
    console.warn(
      `[soft-cap] slide ${slide} field '${field}' length ${text.length} > recommended ${threshold} — overflow likely`
    );
  }
}
```

**Beteende:**
- Loggar varning till `console.warn` när `text.length > threshold`.
- Trunkerar inte. Modifierar inte text.
- Anropas innan textreplacement i applikatorn.

### Initial trösklar

| Slide | Fält | Threshold (chars) |
|---|---|---|
| 6 | `phase.name` (fas-kort) | 40 |
| 6 | `phase.period ?? phase.duration` (Gantt-span placeholder `{M1–M2}`) | 10 |
| 7 (+ kloner) | `phase.objective` (Mål) | 120 |
| 7 (+ kloner) | `phase.activities[i]` | 120 |
| 7 (+ kloner) | `phase.deliverables[i]` | 100 |
| 7 (+ kloner) | `phase.decisions[i]` | 100 |
| 11 | `section.checkpoints[i]` | 80 |
| 18 | `section.certs[i].description` | 80 |

Trösklar är initiala uppskattningar. Kalibreras när stress-fixturen körs och overflow-fixarna är på plats — om en textbox med autofit accepterar 200 chars utan oacceptabel skalning, höj threshold för det fältet.

### Berörda applikatorer

- `src/lib/pptx-template/applicators/phases-overview.ts` — soft-cap för `phase.name`, `phase.ganttSpan`.
- `src/lib/pptx-template/applicators/phase-detail.ts` — soft-cap för `phase.objective`, `phase.activities[]`, `phase.deliverables[]`, `phase.decisions[]`.
- `src/lib/pptx-template/applicators/quality-assurance.ts` — soft-cap för `section.checkpoints[]`.
- `src/lib/pptx-template/applicators/certifications.ts` — soft-cap för `section.certs[i].description`.

Övriga applikatorer rörs inte.

### Tester

- Unit: `src/lib/pptx-template/applicators/__tests__/soft-cap.test.ts` — verifiera warning emitteras vid `length > threshold`, ingen warning vid `length <= threshold`, ingen mutation av text.
- Integration: utöka befintliga applikator-tester (`phases-overview.test.ts`, `phase-detail.test.ts`, `quality-assurance.test.ts`, `certifications.test.ts`) med stress-input som triggrar warning, asserta `console.warn` anropas (vitest spy).

---

## Sample-fixture-uppgradering

Fil: `scripts/generate-sample-pptx.ts`

**Strategi:** mix-fixture — varje overflow-känsligt fält har minst ett kort, ett medellängd, och ett stress-exempel i samma render.

**Konkreta uppgraderingar:**

| Slide | Fält | Idag | Stress-värde |
|---|---|---|---|
| 6 | `phases[0].name` | Kort | "Förankra uppdrag och kartlägg nuläge" (45 chars) |
| 6 | `phases[i].period` (eller fallback `phases[i].duration`) | "M1–M2" | "M1–M2 + 2v" på minst en phase (test wrap) |
| 7 | `phases[0].objective` (Mål) | Saknas / kort | 150-chars sentence |
| 7 | `phases[*].risks` | **Saknas helt** | 2-3 risker per phase, en > 80 chars (verifierar risk-ikon-rendering) |
| 7-10 | `phases[i].activities/deliverables/decisions` | Korta | Mix per kolumn: 1 kort, 1 medel, 1 stress |
| 11 | `section.checkpoints[i]` | Korta | AP 1 kort, AP 2 medel, AP 3-4 stress |
| 18 | `section.certs[i].description` | Korta | ISO 9001 kort; "övrig" cert (ex. PROSCI) med ~100-chars beskrivning **tematiskt korrekt mot cert-namnet** |

Övriga fält (cover, TOC, slide 4, slide 12) lämnas oförändrade.

**Verifiering vid körning:**

1. `npx tsx scripts/generate-sample-pptx.ts` producerar `tmp/sample-bid.pptx`.
2. Console output ska visa soft-cap-warnings för stress-fälten.
3. Öppna pptx i PowerPoint → verifiera att autofit/textbox-fix faktiskt löser overflow.

---

## Implementationsordning

4 phases, 1 PR per phase:

| Phase | Innehåll | Vem | ETA |
|---|---|---|---|
| **P1: Foundation** | `_soft-cap.ts` helper + tester. Stress-fixture-uppgradering i `generate-sample-pptx.ts`. Inga visuella ändringar. Bevis: warnings emitteras vid render. | Claude (kod) | ~1h |
| **P2: Bullets/bold (text-slides)** | Mall-edits för slide 3, 5, 11. Soft-cap-anrop i `quality-assurance.ts` (checkpoints). | Stefan (PowerPoint) + Claude (kod) | ~1-2h |
| **P3: Phase-detail (slide 7 + kloner)** | Mall-edits slide 7 (bullets + syftesbox-fix). Soft-cap-anrop i `phase-detail.ts`. | Stefan + Claude | ~1-2h |
| **P4: Overflow-only** | Mall-edits slide 6 (fas-kort + Gantt) + slide 18 (cert-kort). Soft-cap-anrop i `phases-overview.ts` + `certifications.ts`. | Stefan + Claude | ~1h |

### Acceptance-kriterier per phase

- Inga overflow synliga i PowerPoint vid stress-fixture-render. (Eller: om autofit krymper text, resultatet är läsbart.)
- Soft-cap-warnings emitteras för fält som överskrider threshold.
- Alla `pptx-template`-tester gröna.
- PR mergad efter PR-review-routinen kommenterat (per `project_pr_review_routine.md`).

### Branch-disciplin

Allt arbete på `feat/pptx-bullets-pass` (skapad från master `161251e`). Per phase: commit, push, PR till master. Squash-merge efter routine-godkännande.

---

## Strategi-flaggor — lyfta ur

Egna tickets, väntar på Claude Design-output:

- **Slide 13 (kravmatris):** redesign + lokalisering av tidigare bättre tabell. Stefan-design-input krävs.
- **Slide 14-16 (referenser):** ska bli tomma placeholders, bid-generatorn slutar AI-generera. Konsekvent med `project_reference_bundle_future.md`.
- **Slide 17 (anbudssekretess):** ska bli kund-egen fast slide, AI-genereras inte.

Stefan tar parallellt sample-render + audit-findings till Claude Design för alternativa mockups/stilar. Output återkopplas in i nya specifika tickets för dessa redesign-kandidater.
