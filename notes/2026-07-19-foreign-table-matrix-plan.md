# Kravmatris i främmande tabeller — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Äkta `a:tbl`-tabeller i främmande mallar kan mappas till kravmatris-roller vid onboarding och fyllas med EN rad per ska-krav (formulaiska svar), paginerat via slide-kloning ur kundens egen geometri.

**Architecture:** Additiv tabell-läsning i introspektionen (`SlideShapes.tables[]` — `shapes[]`/`shapeIndex` orörda), `tableMap` på slide-profilen (Zod, ingen migration), routing-predikatet `isForeignProfile`, återanvänd `requirementMatrixBundle` för genereringen, och en ny direktskrivande applikator som klonar mall-`a:tr` per krav och sliden per sida via befintlig cloneItems-mekanik. Ingen cell-tokenisering; instrumenteringen rörs inte.

**Tech Stack:** TypeScript strict, Next.js 16, Zod, vitest, pptx-automizer, @xmldom (befintlig), PowerShell COM (endast mätgrenen).

**Spec:** `notes/2026-07-19-foreign-table-matrix-design.md` — läs den först. Kodkarta med file:line-referenser finns i spec-sessionens Explore-rapport; nyckelfakta upprepas per task nedan.

## Global Constraints

- Kod/kommentarer/commits ENGELSKA; UI/CLI-text SVENSKA (ren svenska). TS strict, inga omotiverade `any`. Filer < ~300 rader. Surgical. ALDRIG package-lock.json i en commit.
- `shapes[]`/`shapeIndex`-adresseringen får INTE ändras — tabeller är ett additivt fält.
- Instrumenteringen (`instrument-template.ts`) rörs INTE.
- Vår egen malls rendering får inte ändras: golden-bitparitet (`golden-render-profile.test.ts`) ska vara grön efter varje task.
- Formulaiska celler (Stefans medskick): uppfyllnad = `Ja — se {referens}` / `Delvis — se {referens}` / `Nej` (utan referens: bara statusordet); status-kolumn = `JA`/`DELVIS`/`NEJ` ren text. Ingen fri prosa i celler.
- Paginering: sidor = ⌈N krav / radersPerSida⌉ ur KUNDENS geometri (mallradens `a:tr@h`, kolumnbredder ur `a:gridCol@w`) — inga hårdkodade radhöjder/teckenkonstanter från vår mall.
- Per task: fokuserade tester gröna + `npx tsc --noEmit` rent före commit; full svit i T8.

---

### Task 1: Tabell-läsning i introspektionen

**Files:** Modify `src/lib/pptx-template/introspect/read-pptx.ts` (extractShapes-grannskapet; `SlideShapes` ~rad 34-43). Test: `src/lib/pptx-template/introspect/__tests__/read-pptx.test.ts` (finns — läs fixture-stilen först; bygg synthetic slide-XML med `<p:graphicFrame><a:graphic><a:graphicData><a:tbl>`).

**Interfaces (Produces — exakta namn, senare tasks konsumerar):**
```ts
export interface TableCell { text: string }
export interface TableRow { heightEmu: number; cells: TableCell[] }
export interface TableShape {
  /** Index among the slide's graphicFrames, document order. */
  frameIndex: number;
  /** Frame geometry from <p:xfrm> (EMU); null when inherited. */
  geometry: { xEmu: number; yEmu: number; cxEmu: number; cyEmu: number } | null;
  gridColsEmu: number[];   // <a:gridCol w=...>
  rows: TableRow[];        // <a:tr h=...> → <a:tc><a:txBody> text (paragraphs joined "\n")
}
// SlideShapes += tables: TableShape[]
```

- [ ] Step 1: failing test — synthetic slide med 1 tabell (2 kolumner, 1 rubrikrad + 1 mallrad med celltext) ⇒ `tables[0]` med rätt gridColsEmu/heightEmu/celltexter; slide utan tabell ⇒ `tables: []`; befintliga shapes-tester ORÖRDA gröna (adresseringen stabil).
- [ ] Step 2: FAIL → implementera (återanvänd befintlig paragraf/`<a:t>`-läsning för cellens txBody; graphicFrame-geometri ur `<p:graphicFrame><p:xfrm>` — OBS annan förälder än sp:s `<p:spPr><a:xfrm>`). → PASS + tsc.
- [ ] Step 3: Commit `feat: read a:tbl tables into SlideShapes.tables (additive)`.

### Task 2: Profil-schema `tableMap` + routing-predikatet `isForeignProfile`

**Files:** Modify `src/lib/pptx-template/template-profile.ts`; sweep av `isAllGenericProfile`-anropsställen (Grep — kända: `run-bid-generation.ts:67`, export-routen, bid-sidans editor-join, `measure/template-defects.ts` activationBlockReason, onboarding-GET). Test: template-profile.test.ts + template-defects.test.ts.

**Interfaces (Produces):**
```ts
export const TABLE_COLUMN_ROLES = ["krav", "uppfyllnad", "referens", "status", "ignorera"] as const;
export const TableMapSchema = z.object({
  frameIndex: z.number().int().nonnegative(),
  headerRows: z.number().int().nonnegative(),
  templateRowIndex: z.number().int().nonnegative(),
  columns: z.array(z.enum(TABLE_COLUMN_ROLES)).min(1),
});
export type TableMap = z.infer<typeof TableMapSchema>;
// SlideProfileSchema += tableMap: TableMapSchema.optional()
export function isForeignProfile(profile: TemplateProfile): boolean;
// = varje SLOT är generic-prose OCH varje slide är generic-prose/static ELLER
//   (capability "requirement-matrix" MED tableMap satt). Ren funktion, testad.
```

- [ ] Step 1: failing tests — tableMap-roundtrip + legacy-parse; `isForeignProfile`: ren generic ⇒ true; generic + matris-tabellslide MED tableMap ⇒ true; matris-slide UTAN tableMap (vår mall) ⇒ false; blandad specialiserad ⇒ false.
- [ ] Step 2: Implementera; byt VARJE anropsställe medvetet: routing/export/editor/aktiverings-grind ska behandla "generic + mappad tabell" som foreign (samma beteende som i dag för rena generic-profiler — befintliga tester får inte ändras i sak). `isAllGenericProfile` behålls (används av isForeignProfile internt).
- [ ] Step 3: PASS + tsc + `npx vitest run src/lib/pptx-template/ src/lib/bid-generator/__tests__/run-bid-generation-routing.test.ts`. Commit `feat: tableMap on slide profile + isForeignProfile routing predicate`.

### Task 3: Äkta a:tbl-testmall (fixture)

**Files:** Create `scripts/generate-table-sample.ts` (mönster: `scripts/generate-sample-pptx.ts` — läs den först) + committad fixture `src/lib/pptx-template/__tests__/fixtures/table-sample.pptx` (kolla var befintliga pptx-fixturer bor — Glob `**/*.pptx` under src/ — och följ konventionen).

**Fixturens innehåll:** 1 prosa-slide (1 textbox med text) + 1 tabellslide med äkta `a:tbl`: 4 kolumner (avsedda: krav/uppfyllnad/referens/status), 1 rubrikrad ("Krav | Uppfyllnad | Referens | Status"), 1 mallrad med exempeltext, kända gridCol-bredder (krav-kolumnen bredast) och `a:tr@h`. Byggd med pptx-automizer eller rå XML-zip (välj det generate-sample-pptx redan gör).

- [ ] Step 1: skriv skriptet, generera fixturen, verifiera med Task 1:s `readPptxSlides` (test: fixturen parsas → 1 tabell, 4 kolumner, 2 rader, rätt texter).
- [ ] Step 2: Commit `test: real a:tbl sample template fixture + generator script`.

### Task 4: Onboarding — tabellsteg i wizard + tableMap till profilen

**Files:** Modify `src/lib/pptx-template/onboarding/draft.ts` (draft-schema += `tables`-beslut, optionalt — gamla utkast parsar), `draft-logic.ts` (`buildDraft` exponerar tabellerna ur `SlideShapes.tables`; `buildFinalProfile` emitterar `capability: "requirement-matrix"` + `tableMap` för bekräftade tabeller — annars static som i dag), `src/app/api/templates/[id]/onboarding/route.ts` PATCH-schema (nytt beslut `{ table: { source, frameIndex, headerRows, templateRowIndex, columns[] } }` i `api-schemas.ts`), wizard-UI: ny `src/components/onboarding/TablePanel.tsx` + wireframe ritar tabellram. Tests: draft-logic-testerna (finns) + ny TablePanel-logik via draft-logic (UI tunn).

**Valideringsregel (bekräftelse):** exakt EN `krav`-kolumn och minst en av `uppfyllnad`/`status`; `templateRowIndex >= headerRows`; `columns.length === gridColsEmu.length`. Ogiltigt ⇒ 422 med svensk orsak; obekräftad tabell ⇒ sliden förblir static (dagens beteende).

- [ ] Step 1: failing draft-logic-tester (tabell i draft; beslut → final profile med tableMap; ogiltiga kartor rejectas; slide utan bekräftelse → static).
- [ ] Step 2: Implementera lib-delen → PASS; sedan UI (dropdown per kolumn med de svenska rolletiketterna Krav/Uppfyllnad/Referens/Status/Ignorera, rubrikradsantal, mallradsval, förhandsvisning av första radernas celltext; husets mönster — inga egna designbeslut).
- [ ] Step 3: tsc + onboarding-sviten grön. Commit `feat: table mapping step in onboarding wizard, tableMap into final profile`.

### Task 5: Generering — matris-bundeln för foreign-profiler med mappad tabell

**Files:** Modify `src/lib/bid-generator/run-bid-generation.ts` (routing: foreign-grenen kör `generateSectionsFromProfile` OCH, när `hasMappedTable(profile)`, även requirement-matrix-bundeln — läs hur `generateAllSections`/bundlarna anropar `requirementMatrixBundle` i `src/lib/bid-generator/bundles/requirement-matrix.ts` och återanvänd EXAKT samma anrop/inputs/persistens). Ny helper `hasMappedTable(profile)` i template-profile.ts. Test: `run-bid-generation-routing.test.ts` (mockmönstret finns).

- [ ] Step 1: failing routing-tester — foreign utan tabell ⇒ enbart profilvägen (dagens beteende, befintligt test orört); foreign MED tableMap ⇒ båda körs och sektionerna slås ihop; bundelns fel fäller inte prosa-sektionerna (samma allSettled-anda som resten — läs hur generateAllSections hanterar bundelfel och följ det).
- [ ] Step 2: Implementera → PASS + tsc. Commit `feat: run requirement-matrix bundle for foreign profiles with a mapped table`.

### Task 6: Radmotorn — foreign-table-applikatorn + paginering

**Files:** Create `src/lib/pptx-template/applicators/foreign-table.ts` + `src/lib/pptx-template/foreign-table-pagination.ts` (ren mattemodul). Modify `render-from-profile.ts` (cloneItemsFor-gren för tableMap-slides + dispatch till nya applikatorn när `slide.tableMap` finns — vår malls `requirement-matrix` utan tableMap går ORÖRD till `requirementMatrixApplicator`). Tests: pagineringen rent (fixture-geometri), applikatorn mot Task 3-fixturen (rendera → läs tillbaka med readPptxSlides → assert).

**Interfaces (Produces):**
```ts
// foreign-table-pagination.ts (RENT — ingen XML):
export interface TablePageParams {
  slideHeightEmu: number; tableTopEmu: number;
  headerHeightsEmu: number[]; templateRowHeightEmu: number;
  kravColWidthEmu: number; fontSizePt: number | null;  // ur mallradens krav-cell
  bottomMarginEmu: number;  // konstant BOTTOM_MARGIN_EMU, exporterad
}
export function rowsPerPage(p: TablePageParams): number;      // ≥1; radhöjd skalas med radbrytnings-estimat för GENOMSNITTLIG kravlängd? NEJ — se nedan
export function paginateRows<T>(rows: T[], perPage: number): T[][];  // ⌈N/perPage⌉ sidor
```
**Radhöjds-estimat:** mallradens `a:tr@h` är minimum; kravtexten är enda radbrytaren
(formulaiska svar enradiga). Estimera per krav: rader = ceil(kravtextLängd /
teckenPerRad(kravColWidthEmu, fontSizePt)) via samma tecken-matte som
`compute-budgets.ts` (återanvänd/exportera dess breddfunktion — läs filen; hitta inte
på nya konstanter). `rowsPerPage` blir då per-sida-packning: greedy som
`paginateMatrixRows` men med kundens mått → signaturen ovan justeras till
`packRows(rows: {kravText: string}[], p: TablePageParams): number[][]` (index-chunks).
Skriv testerna mot packningen: korta krav ⇒ fler per sida; långa ⇒ färre; alltid ⌈N⌉
täckning, aldrig 0 rader på en sida.

```ts
// applicators/foreign-table.ts:
export function foreignTableApplicator(ctx: ApplicatorContext, slide: SlideProfile): (s: ISlide) => void;
export function formulaicAnswer(row: { referens?: string }, status: "JA" | "DELVIS" | "NEJ"): string;
// "Ja — se {referens}" / "Delvis — se {referens}" / "Nej"; utan referens: bara ordet.
```
Applikatorn: hämtar `requirement-matrix-v2`-sektionen ur ctx.sections, sin sidas
rad-chunk via `ctx.cloneIndex`, klonar mall-`a:tr` per rad (importNode + insert före
mallraden), skriver celler per roll (`krav` = row.requirement; `uppfyllnad` =
`formulaicAnswer` med `rowStatus`-roll-upen — importera `rowStatus` från
requirement-matrix-applikatorn eller flytta den till delad modul; `referens` =
row.referens; `status` = statusordet; `ignorera` = mallradens innehåll kvar), tar bort
mallraden, låter rubrikrader vara. Cellskrivning: ersätt cellens `<a:t>`-innehåll med
bevarad första-runs formatering (injectToken-mönstret på cellens txBody).

**render-from-profile-integrationen:** när profilen har någon tableMap-slide läser
renderaren mallens tabeller EN gång (`readPptxSlides(await readFile(tpl.templateFile))`)
och `cloneItemsFor` returnerar rad-chunksen för den sliden (pages). Dispatch:
`slide.capability === "requirement-matrix" && slide.tableMap` ⇒ `foreignTableApplicator`.

- [ ] Step 1: failing pagineringstester (rena) → implementera → PASS.
- [ ] Step 2: failing applikatortest mot fixturen: 7 krav, mallrad + rubrikrad ⇒ rätt antal sidor enligt packningen; varje sida: rubrikrad kvar, mallraden borta, N rader med rätt cellinnehåll (formulaiska svar verifieras strängexakt); `ignorera`-kolumnens celler = mallradens text. Läs tillbaka med readPptxSlides och assert:a på `tables[]`.
- [ ] Step 3: `golden-render-profile.test.ts` GRÖN (vår mall opåverkad) + tsc. Commit `feat: foreign table row engine - clone rows per requirement, paginate by customer geometry`.

### Task 7: Mätgrenen — HasTable i measure-overflow.ps1

**Files:** Modify `scripts/measure-overflow.ps1` (`Get-TextShapes`, rad ~33-40: lägg gren för `$s.HasTable` (msoTable, Type 19) — emittera tabellRAMEN som en mätpost: namn, top/left/width/height ur shape; boundHeight = summan av `$s.Table.Rows.Item(i).Height`; textPrefix = första cellens text (för markörmatchning irrelevant — tabeller kalibreras inte), textLength = total celltextlängd, wordWrap $true, autoSize 0, fontSize $null, marginaler 0). Ingen cellnivå (v2).

- [ ] Step 1: Implementera grenen (PowerShell; följ filens befintliga stil/felhantering).
- [ ] Step 2: Verifiera lokalt mot Task 3-fixturen: `pwsh -File scripts/measure-overflow.ps1 -Pptx <fixture> -OutJson tmp/t.json -RecalcOut tmp/t.pptx` (PowerPoint STÄNGT) → JSON innehåller tabellposten med rimliga mått; kör även mot ett BEFINTLIGT icke-tabell-deck och diffa att inga poster ändrats (beteendebevarande för allt annat).
- [ ] Step 3: Commit `feat: measure table frames in COM measurement (HasTable branch)`.

### Task 8: Live-verifiering + ROADMAP + PR (controllern äger steg 2–5)

- [ ] Step 1 (implementer om UI-rest finns, annars controller): inget — buffert.
- [ ] Step 2: Onboarda Task 3-testmallen via appen (upload → wizard → mappa kolumner i TablePanel → complete → mätpass? OBS: aktiveringsgrinden kräver mätpass — kör `onboarding:measure --write` på testmallen, acceptera ev. defekter) → aktivera.
- [ ] Step 3: Generera anbud mot befintlig analys (930bc471, ~$1); exportera; verifiera: alla ska-krav i tabellen över ⌈N/perSida⌉ sidor, formulaiska svar, rubrikrad per sida, inga rader utanför slidekanten (deck-rutinen: inspect-pptx + deck:dupes + deck:scan --profile).
- [ ] Step 4: Full svit + tsc + lint med output; screenshots av TablePanel + genererade tabellsidor till Stefan.
- [ ] Step 5: ROADMAP-tick (slice 6 tabelldelen; kvarvarande: bullets, pris-/bemanningsroller, cellnivå-mätning som v2-poster) + push till remoten `bidsmith` (INTE origin) + PR + invänta routinen före squash-merge; därefter Stefans visuella dom på det genererade decket.

---

## Self-review (utförd vid skrivning)

- Spec-täckning: alla sex designsektioner har tasks (datamodell T2, introspektion+wizard T1/T4, generering T5, radmotor T6, mätning T7, verifiering T8); medskicket (formulaiska svar, sidor mot kravantal, fasta kolumner) är bindande i Global Constraints + T6.
- Kända osäkerheter delegerade med strikta kontrakt: fixture-konvention (T3), bundel-anropets exakta inputs (T5 — "läs och återanvänd exakt"), compute-budgets breddfunktion (T6).
- Typkonsekvens: TableShape (T1) konsumeras av T3-test/T4-wizard/T6-render; TableMap (T2) av T4/T5/T6; formulaicAnswer-strängformatet är låst i Global Constraints.
