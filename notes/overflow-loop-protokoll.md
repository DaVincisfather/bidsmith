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

- Provkörning styrmodell-fixturen: 3 FAIL (innehållsdrivna, slide 2/4/8 — mallens boxar
  växer under slidekanten med verkligt innehåll), 10 grova overflow post-exklusion,
  2 dubblettpar, 10 243 tecken, $0,53/anbud.
- Malldefekt-listan (29 poster) exkluderar det statiska; slide 2/4/8-FAIL:en är
  loopens att fixa (mindre/tightare text), slide 9 är exkluderad malldefekt.
- Kortfältsregeln + syskon-arbetsdelning finns redan i prompten (loop v1, 2026-07-14) —
  börja inte om från noll, läs prompthistoriken i git.

## Avslut

Slutrapport (hela serien: varv-för-varv-delta, ratt-för-ratt-motivering) + Stefans
visuella dom på konvergens-decken (öppna i PowerPoint, den mänskliga blicken är
slutgiltig — mätningen ser inte allt). Godkänt → PR mot main (routine-granskning som
vanligt). Underkänt → dokumentera fynden, låt branchen stå kvar som underlag.
