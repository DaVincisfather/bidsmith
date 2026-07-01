# Fas 2 eval-grind — BESLUT A (2026-07-01)

> Stänger utredningen som pausade fas 2C den 2026-06-15. Full bakgrund i den
> tidigare handoff-noten (`2026-06-15-fas2-eval-calibration-pause.md`, låg på
> branch `eval-coverage-reference-fix` — den branchen slängd, se nedan).

## Beslutet

**A: `coverage.recall` är en informationssignal, inte en merge-grind.** Grinden för
bid-generatorn = `structure.pass` + `overflow.pass` (deterministiska, båda gröna i
körningen 2026-06-15, inkl. fas 2C:s profil-injektion). `coverage.recall` fortsätter
mätas och rapporteras, men märks `informational: true` i `thresholds.yaml` och skrivs
ut som `INFO` — den lyser aldrig rött `FAIL` och ska inte återutlösa samma utredning.

## Varför (kort — utredningen från 2026-06-15)

`coverage.recall` 0.12–0.18 mot tröskeln 0.90 var en **ärlig mätning**, inte ett
judge-fel. Judgarna är deterministiska (`JUDGE_TEMPERATURE = 0`); variansen kom från
generatorn (Opus-skrivbundles). Av 14 missade Chalmers-krav:

- **~7 krav:** konsulterna saknar genuint kompetensen (syntetpoolen = generiska
  affärsutvecklare; Chalmers vill ha disputerad biomedicin, cancerforskning, ML i
  biomed). Fixture-miss, inte generator-fel.
- **~4 krav:** företags-/kvalificeringskrav generatorn **strukturellt inte kan
  producera** (F-skatt, Creditsafe-rating, miljöpolicy) — bifogade intygsdokument,
  inte AI-text ur CV:n.
- **1 krav:** referensbevisat (deferred per design).

Kravmatrisen har 6 slottar mot 17 krav → 0.90 är onåbar av strukturella skäl. Detta är
INTE judge-kalibrering utan en fråga om vad coverage borde mäta + fixture-kvalitet.

## Motbevisad fix — slängd

Commit `a6bfe19` ("treat deferred-empty references as deferred") på branch
`eval-coverage-reference-fix` byggde på hypotesen att tomma referens-platshållare sänkte
coverage. **Motbevisad av isoleringstest** (samma anbud, gammal vs ny flatten → räddade
0/14 krav, coverage 0.18→0.12). Branchen + worktreen `bidsmith-calib` slängda 2026-07-01.

## Framtida spår (ej nu — dokumenterade, inte aktiva)

- **B:** klassificera krav i golden (generator-adresserbar / intygsdok / referens),
  låt coverage bara mäta adresserbara krav, omkalibrera tröskel. Kräver Stefans
  taxonomi-signoff.
- **C:** para matchande konsulter mot varje RFP-fixture (adresserar fixture-miss).

## Separat, INTE en del av detta beslut

`hallucination.pass` "flippade" i samma körning (klassen "försköning av konsultmeriter",
4 fångade i fas 1). Det är ett **eget backlog-item** (runtime-hallucinationsgrind), inte
infört av fas 2C och inte reklassificerat här — det är fortsatt en riktig grind.
