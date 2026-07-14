# Mätkärnan (loop v2 + deck-scannern) — design (2026-07-14)

> Uppföljning på budget-kalibreringsloopen (PR #79) och utvärderingen
> (`notes/2026-07-14-budget-calibration-evaluation.md`). Två syften när detta är
> klart (Stefan): (1) läsa av mallens textboxar och estimera char-budget
> (kalibreringen, med v2-fixar för mätluckorna), (2) scanna GENERERADE anbud för
> textoverflow och andra fulheter (ny QA-yta). Vald arkitektur: **gemensam
> mätkärna + två konsumenter**, varje check märkt COM-bunden eller XML-härledbar
> ("CLI nu, app-yta förberedd").

## Problem

Utvärderingen mot Radrum v4 visade tre mätluckor i kalibreringsloopen och ett
saknat QA-lager för färdiga deck:

1. **spAutoFit + slidekant:** boxen växer med texten — BoundHeight ser "ryms"
   men den växta boxen sticker ut under slidekanten (slide 2/9: text utanför sliden).
2. **Enrads-semantik saknas:** budgeten tillåter radbryt i boxar designade för
   en rad (vecka-rutorna slide 6, "Testbolaget"-remsan).
3. **No-wrap-klipp:** enrads-rader klipps horisontellt mot box-/slidekant —
   varken BoundHeight eller fontScale ser det (kickers slide 3/4/7/8/11).
4. Ingen mekanisk scanning av genererade deck — Stefans ögon var enda detektorn
   för ovanstående (+ deadspace, trängsel).

## Arkitektur

```
scripts/measure-overflow.ps1 (berikad, bakåtkompatibel)   ← COM-mätning
        │  JSON per shape + slidemått
        ▼
src/lib/pptx-template/measure/        ← MÄTKÄRNAN (ren TS, enhetstestbar)
  types.ts      ShapeMeasurementV2, slidemått, trösklar
  verdicts.ts   sju domare, rena funktioner, märkta "com" | "xml"
  report.ts     DeckScanReport (schemaVersion: 1) — text + JSON
        │                               │
        ▼                               ▼
  calibrate/ (konsument 1)        scripts/scan-deck.ts (konsument 2)
  budgetbeslut per slot           npm run deck:scan -- <anbud.pptx>
```

Dagens `calibrate/overflow.ts` migrerar in i `measure/` — kalibreringen och
scannern dömer med SAMMA funktioner (ingen mätdrift mellan spåren, lärdomen
från "grönt men fult").

## PS-berikningen (measure-overflow.ps1, bakåtkompatibel)

Per shape tillkommer: `topPt, leftPt, widthPt` (faktisk position/storlek EFTER
COM-layout — en spAutoFit-box rapporterar sin växta höjd), `boundWidthPt`,
`wordWrap` (bool), `autoSize` (0 none / 1 spAuto / 2 norm). Toppnivå:
`slideWidthPt, slideHeightPt`. Befintliga fält orörda; kalibreringen fortsätter
fungera under ombyggnaden.

## Checkarna (verdicts.ts)

| Check-id | Källa | Signal | Ur utvärderingen |
|---|---|---|---|
| `vertical-overflow` | COM | boundHeight > boxhöjd − marginaler + tol (dagens) | katastrofklassen |
| `outside-slide` | COM | box-underkant/högerkant > slidemått + tol | slide 2/9 |
| `horizontal-clip` | COM | wordWrap av && (boundWidth > boxbredd − marg. ‖ left+boundWidth > slidebredd) | kickers 3/4/7/8/11 |
| `single-line-break` | COM exakt / XML-approx | box med ~en radhöjd (geometri+fontPt) men boundHeight > ~1,6 × radhöjd; XML-proxy: textlängd > en rads kapacitet | vecka-rutorna slide 6 |
| `autofit-shrink` | COM (recalc-fontScale) | fontScale < 80 % | font-klickbuggens släkting |
| `deadspace` | COM | fyllnadsgrad boundHeight/boxhöjd per box ≥ minsta storlek; slide-WARN när majoriteten stora boxar < ~35 % | "för mycket deadspace" |
| `raw-token` | XML | {token} kvar i exporterat deck | formaliserar ad hoc-kollen |

Trösklar (tol ~2 pt, 80 %, 35 %, 1,6×) är startvärden — de KALIBRERAS mot
facit-trion (nedan) innan scannern får beslutsvikt, samma policy som
deck:dupes-lärdomen (parafras passerade 0,5-gaten).

XML-märkta checkar (+ XML-approx-varianten av single-line-break och
budget-checkarna nedan) är delmängden en framtida app-yta kan köra på Vercel
utan renderare. JSON-rapporten är app-kontraktet.

## Kalibreringskopplingen (mätluckorna stängs)

- Kalibreringens overflow-verdikt per slot blir: `vertical-overflow` ELLER
  `outside-slide` ELLER `horizontal-clip` ELLER `autofit-shrink` (dagens två
  första signaler + de två nya). spAuto- och no-wrap-boxar börjar därmed
  faktiskt "overflowa" i binärsökningen istället för att aldrig signalera.
- **Enrads-cap:** box vars designhöjd ≈ en radhöjd får budget =
  min(konvergerad budget, en rads geometriska kapacitet) och kortfälts-flagga
  (jfr maxLines-semantiken i compute-budgets för egna mallen).
- Rapporttabellen får en kolumn för vilken signal som fällde avgörandet
  (felsökbarhet inför --write).

## deck:scan (konsument 2)

`npm run deck:scan -- <anbud.pptx> [--json ut.json] [--profile <templateId>]`

- Mäter ALLA textboxar (fulheter kan sitta var som helst — till skillnad från
  kalibreringen som är slot-riktad eftersom budget bara konsumeras av rutor
  som fylls).
- `--profile` (valfri): laddar mallprofilen och lägger till budget-medvetna
  XML-checkar — textlängd ≫ budgetChars (över-budget-varning) och ≪ budget
  (deadspace-proxy).
- Utdata: läsbar tabell per slide + `--json` med `DeckScanReport`
  (`schemaVersion: 1`, per slide: findings `{ checkId, severity, shape, detail }`,
  summering). Exit-koder: 0 rent / 1 WARN / 2 FAIL — grindbar bredvid
  `inspect-pptx` + `deck:dupes`.
- Severity-mappning v1: outside-slide, vertical-overflow, raw-token = FAIL;
  horizontal-clip, single-line-break, autofit-shrink = WARN; deadspace = INFO
  (WARN på slide-aggregat). Justeras vid facit-kalibreringen.

## Ribban — facit-trion

Scannern valideras mot tre deck med känt facit INNAN den får beslutsvikt:

1. **anbud-c993fa7a** (utvärderingsdecket): ska flagga exakt Stefans fynd —
   outside-slide på slide 2/9, horizontal-clip på kickers 3/4/7/8/11,
   single-line-break på slide 6, trängseln på slide 8. Missade fynd = trösklar fel.
2. **anbud-378c78a5** (katastrofdecket): massiva vertical-overflows.
3. **Tomma Radrum-mallen**: i princip rent — designerns layout är baslinjen;
   flaggar scannern den, är trösklarna för aggressiva.

Därefter: **om-kalibrering av Radrum v4** med v2-domarna (förväntat: lägre
kicker-budgetar, enrads-cap på vecka-rutorna, slide 2/9-boxar slutar godkänna
utanför-slide-text) → ny generering (~$1–2) → Stefans dom igen.

## Testning

- Domarna: enhetstester med syntetiska mätvärden per check (ren TS, ingen COM).
- PS-berikningen: manuell verifiering mot anbudsmall-v2 (mönster: kalibrerings-
  Task 4) + fältparitet mot gamla formatet.
- Facit-trion är integrationsgrinden; kalibrerings-regressionen = om-kalibrera
  Radrum v4 och jämför rapporten mot 2026-07-14-körningen (137/137 mätta ska bestå).
- Före "klart": lint + test + tsc med output.

## Avgränsningar

- Ingen server-rendering nu — app-ytan får XML-delmängden senare (eget spår).
- Bid-editor-slimningen är NÄSTA spår (brainstormas separat); scannerns
  JSON-rapport och kortfälts-/static-klassningen är dess byggstenar.
- Radrum-mallfixarna (boxgeometri, fonter) är mall-arbete, inte kod — ligger
  kvar på ROADMAP.

## Kostnad

Bygget: $0 (all mätning lokal). Om-kalibrering: $0. Ny generering för Stefans
dom: ~$1–2. Väggklocka: ~en session.
