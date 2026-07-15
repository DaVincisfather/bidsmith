# Overflow-loopens forskarprotokoll

_Körregler för den autonoma drivarsessionen. Design: `notes/2026-07-15-overflow-loop-design.md`
(mål, rattar, skyddsräcken beslutade av Stefan 2026-07-15). Detta dokument är kondensatet
sessionen faktiskt följer — avvikelser från designen är inte tillåtna._

## Förkrav per varv

- PowerPoint STÄNGT, maskinen ostörd under mätsteget (COM). Meddela Stefan körfönstret.
- Supabase vaken (skriptet fail-fastar annars).
- Egen worktree på branch `feat/overflow-loop` (skapas från main när harnessen är mergad).
- Full svit + `npx tsc --noEmit` + `npm run lint` GRÖNA innan varvet körs (varvets
  rattändring får aldrig knäcka bygget).

## Varvet

```
1. npm run overflow:eval -- --varv N          (5 fixturer, ~$2,50–7 per varv)
2. Läs evals/overflow/runs/varv-NN/rapport.md + rapport.json
3. Analysera: vilka gates faller, var, varför — koppla fynd → ratt
4. Ändra EN sak i taget, ENDAST i whitelistade rattfiler
5. Svit + tsc + lint → grönt
6. Committa: "loop(varv N): <ändring> — FAIL a→b, grova c→d, dupes e→f, $X ack."
7. Skicka rapport.md till Stefan (proaktivt — vänta INTE på svar)
8. Stoppvillkorskoll → nästa varv eller slutrapport
```

## Rattarna (whitelistade filer — ALLT annat är fryst)

- `src/lib/bid-generator/bundles/generic-prose.ts` — prompterna (system, re-ask, kortfältsregeln)
- `src/lib/bid-generator/budget-rules.ts` — generella budgetregler/-faktorer (`effectiveBudget`)
- `src/lib/bid-generator/generate-from-profile.ts` — ENDAST om en mekanisk
  enforcement-regel motiveras av mätdata (t.ex. tvingande re-ask av budgetbrytare)

**OBS (känd interaktion, Goodhart-vakten):** `effectiveBudget`-faktor <1 kan flippa slots
över kortfältsgränsen (80 tecken, `short-field.ts`) i PROMPTEN (`isShortBudget` körs på
den justerade budgeten i `generic-prose.ts`) medan gates (`collectFill`, `text-metrics.ts`)
mäter fyllnadsgrad mot mallprofilens RÅA, ojusterade budgetar — en ratt-ändring kan alltså
tysta ett fält i prompten (kortfält, inga prosaförväntningar) men gates ändå fäller
min-fill-grinden på det gamla (högre) taket. Håll koll på detta om `effectiveBudget`
skalas ned.

**Fryst (får aldrig röras av loopen):** `src/lib/overflow-eval/**` (gates/trösklar),
`src/lib/pptx-template/measure/**`, `evals/overflow/fixtures.json`,
`evals/overflow/known-template-defects.json`, `src/lib/models.ts`, mallprofiler i DB,
`scripts/overflow-eval.ts`. Ändringsbehov i frysta ytor ⇒ stoppa och eskalera till Stefan.

## Stoppvillkor (första som slår gäller)

1. **Konvergens:** alla 5 anbud passerar alla gates TVÅ varv i rad → slutrapport + Stefans dom.
2. **Stagnation:** ingen förbättring (aggregerat FAIL + grova + dupes) tre varv i rad →
   stanna, rapportera, föreslå nästa drag.
3. **Budget:** ackumulerad kostnad ≥ $50 (rapportens ack.-rad) → stanna oavsett läge.
4. API-/transportfel fäller varvet utan att räknas som stagnation — rapportera och kör om.

## Kända fakta vid start (varv 0-baslinje, 2026-07-15)

- Provkörning styrmodell-fixturen (körd med `--only`, se `rapport.partial.json` —
  räknas INTE som ett fullt varv, ger ingen delta-baslinje): 3 FAIL (innehållsdrivna,
  **slide 2/8/10, shapes Text 34/16/21** — mallens boxar växer under slidekanten med
  verkligt innehåll), 10 grova overflow post-exklusion, 2 dubblettpar, 10 243 tecken,
  $0,53/anbud.
  **OBS (gammal exkluderingsregel):** de "10 grova overflow post-exklusion" mättes
  under den DÅVARANDE ovillkorliga malldefekt-exkluderingen, innan magnitude-caket
  (`758d2a1`). Med magnitude-caket räknas samma deck till **~15 grova** — Text
  8/11/13/16/21 på slide 8/10 passerar nu inte längre exkluderingen (de växer förbi
  sin baseline-tolerans). Varv 1:s startsiffror kommer alltså se "sämre" ut än
  provkörningens 10 — det är väntat, INTE en regression.
- Malldefekt-listan (29 poster) exkluderar det statiska; slide 2/8/10-FAIL:en (Text
  34/16/21) är loopens att fixa (mindre/tightare text), slide 9 är exkluderad malldefekt.
- Kortfältsregeln + syskon-arbetsdelning finns redan i prompten (loop v1, 2026-07-14) —
  börja inte om från noll, läs prompthistoriken i git.
- **Kostnadsbokföring efter städning:** `bids`-raderna raderas efter varje varv (om
  inte `--keep-bids`), och `ai_call_logs.bid_id` nollas då av FK:n (`on delete set
  null`, migration 003) — per-varvskostnaden går alltså inte att räkna fram i
  efterhand ur `ai_call_logs`. Den finns bara i `rapport.json` (`costUsdRun`) för
  fullbordade varv, respektive `abort-cost.json` för varv som avbröts innan en
  rapport kunde byggas (summerat FÖRE städningen raderar bud-raderna).
- **`--only`-körningars kostnad bokförs inte automatiskt:** en lyckad `--only`-körning
  skriver `rapport.partial.json`, som `accumulatedCostBefore` medvetet INTE läser
  (den får varken seeda delta-baslinjen eller dubbelräknas mot en senare fullständig
  `rapport.json` för samma varv) — kostnaden syns alltså ingenstans i
  `costUsdAccumulated`. Blir debug-körningar med `--only` många, bokför deras
  kostnad manuellt mot $50-taket.

## Avslut

Slutrapport (hela serien: varv-för-varv-delta, ratt-för-ratt-motivering) + Stefans
visuella dom på konvergens-decken (öppna i PowerPoint, den mänskliga blicken är
slutgiltig — mätningen ser inte allt). Godkänt → PR mot main (routine-granskning som
vanligt). Underkänt → dokumentera fynden, låt branchen stå kvar som underlag.
