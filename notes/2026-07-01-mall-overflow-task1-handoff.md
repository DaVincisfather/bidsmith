# Mall-overflow — Task 1 handoff (2026-07-01, kväll)

Branch: `feat/mall-overflow-honesty` (från `main` @ `b4addd0`), worktree `~/projects/bidsmith-overflow`.
Plan-källa: `notes/2026-07-01-smoke-test-findings.md` (root cause) + minne `project_bidsmith_fas2.md`.

## Status: Task 1 **Part A KLAR & verifierad**. Part B + grindar väntar Stefan.

Stefan gick och sov mitt i körningen med instruktion: jobba vidare, spara grindar
till imorgon, merga inte kärnlogik utan hans review. Därför är Part A committad +
adversariellt granskad men **INTE mergad** — den väntar hans godkännande av ansatsen
(han ville stämma av efter Task 1).

## Vad Part A gör (commit `48220c9`)

**Korrekthetskärnan:** budgetmotorn binder nu FLERRADIGA `normAutofit`-textboxar
geometriskt (`min(editorialCap, geometrisk kapacitet)`), precis som ej-norm-vägen.
ENRADIGA norm-boxar (namn/period/korta etiketter — geometrisk radräkning ≤ 1,
respekterar `spec.maxLines`) behåller taket oförändrat (de krymper säkert på en rad).
Ej-norm-boxar oförändrade.

Motivering: normAutofit-krympning har ett golv (PowerPoint slutar krympa), så en
liten flerradig prosabox spiller trots normAutofit — taket ensamt ljög. Detta är
exakt smoke-test-fyndet: uppladdade mallar med små boxar fick bundlade tak rakt av.

Filer:
- `src/lib/pptx-template/introspect/compute-budgets.ts` — ny gren i
  `budgetForOccurrence`; extraherade `clampedGeometricBudget` + `geometricLineCount`;
  `boxCapacity` använder nu `geometricLineCount` (refaktor, ej beteendeändring på
  ej-norm-vägen — bevisat via oförändrade synt-test a/b/c).
- 3 nya synt-test (d/e/f) i `compute-budgets.test.ts` (flerradig binder / enradig
  behåller tak / maxLines:1 håller enradig i hög box).
- `templates/anbudsmall-v2.manifest.json` — **omkalibrerad**, endast en rad:
  `activities` 120→115.
- `introspect.test.ts` — parity-förväntan uppdaterad 120→115.

**Kalibrering:** ±10%-testet håller (115 ligger inom ±10% av facit 120). Av de 8
handsatta budgetarna ändras BARA activities (120→115); övriga 7 är byte-identiska.
Detta är den mätta konsekvensen av ärlig geometri på bundlade mallen (aktivitetsboxen
rymmer 465 tecken ÷ 4 aktiviteter = ~116 → 115). Se diagnos i git-historiken.

Verifiering: **hela sviten grön (553 passed, 5 skipped)**, `tsc --noEmit` ren.

## GRINDAR till imorgon (Stefan)

1. **Godkänn ansatsen** (den enda riktiga grinden för Part A): är "geometrisk
   radräkning ≤ 1 ⇒ tak, annars binda" rätt modell? Är `activities` 120→115 OK
   (liten åtstramning, inom tolerans)? Om ja → merga Part A (eller vänta in Part B).
   Två modell-nyanser reviewn lyfte (medvetna approximationer, ej buggar — din syn):
   - **Konservativ approximation:** flerradiga norm-boxar klamras med NOMINELL font
     (den geometriska formeln, kalibrerad på ej-norm-boxar). Faktisk normAutofit
     krymper fonten → verklig kapacitet är HÖGRE. Vi under­skattar alltså → varnar
     TIDIGARE (säker riktning), aldrig för sent. Ingen omkalibrering för norm-läget.
   - **Gränsvärdes-diskontinuitet:** `floor(cy/radhöjd)` gör att en box precis vid en
     radhöjds-multipel hoppar mellan enradig (tak) och flerradig (klamrad). 1 EMU kan
     flippa budgeten. Inneboende i radräkning; ingen bundlad box ligger nära en gräns.
     Om det stör: mjuka modellen (t.ex. modellera krympningsgolvet) — men det är en
     förfining, inte ett fel. Reviewn hittade INGA korrekthetsbuggar i övrigt.

2. **Part B — editorialCap-VÄRDEN (produktbeslut).** Kravmatris & team är PPTX-
   TABELLER (autohöjd-rader) → mallboxens höjd är meningslös där, så geometrisk
   bindning ska INTE gälla dem. De behöver rena editorialCaps. Föreslagen mekanism:
   ny `editorialOnly?: boolean` på `BudgetTokenSpec` som hoppar över geometri.
   Fält + mina REKOMMENDERADE tak (bekräfta/justera):
     - `rows[*].requirement` (Ska-krav 1–6): ~160
     - `rows[*].hurUppfylls` (Hur krav 1–6): ~160
     - `rows[*].referens` (CV/ref 1–6): ~70
     - `members[*].role` (Roll 1–5): ~60
   Taken styr hur aggressivt vi varnar + auto-kortar → din känsla. Understanding-
   prosan (Nuläge/Smärtpunkter/Stycken/Utmaningar/Värden) och QA-prosan har HUGE
   boxar på bundlade mallen (låg overflow-risk där) — budgetera dem också, eller
   vänta tills en uppladdad mall visar behov? Din kallelse.

3. **Reseed-migration (Stefan applicerar manuellt).** Runtime läser manifestet från
   DB (`templates.manifest`, seedat av migration 004), INTE från committad json.
   **VIKTIGT — omfattning:** UPPLADDADE mallar introspekteras färskt vid upload med
   nya koden → de får geometrisk bindning DIREKT (det är smoke-testets faktiska fall:
   "anbud mot uppladdad mall spiller"). Bara BUNDLADE anbudsmall-v2 släpar (använder
   fortfarande 120 i DB tills en reseed-migration skriver om `templates.manifest`).
   Reviewn kallade det "ships dead" — det gäller ENDAST bundlade mallen, inte featuren.
   **Medvetet ej skriven än** — bör skrivas EN gång (`UPDATE templates SET manifest=...`
   för anbudsmall-v2) efter att Part B:s budgetar är låsta (annars två migrationer).
   Disk-json + tester är konsistenta (115); bara DB-seeden släpar, dokumenterat.
   Bieffekt-notering (review-fynd #2): ingen test vaktar DB-seed vs manifest-drift —
   ett eget litet backlog-item (kräver DB-fixture), ej ikväll.

4. **Task 2 & 3** (ärlig overflow-vy + auto-korta per ruta) — väntar på att Task 1
   är helt klart och din avstämning, enligt din ursprungsplan.

## Miljö-gotcha (kostade tid — se minne `reference_bash_sandbox_stale_fs`)

Bash-verktyget är sandboxat med en STALE filsystem-snapshot: det ser INTE
harness-`Edit`-skrivningar till arbetsträdet (ocommittad). PowerShell + Read/Edit/
Write delar riktiga disken. Kör därför **tester/npm/git-commit via PowerShell**;
Bash-`git` ser committat läge korrekt men Bash-`vitest` läser stale arbetsträd.
(Första test-editen hamnade dessutom av misstag i `bidsmith-main` — reverterad.)
