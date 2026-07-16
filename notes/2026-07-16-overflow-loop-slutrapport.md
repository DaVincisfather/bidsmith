# Overflow-loopen — slutrapport (varv 1–4, 2026-07-16)

_Autonom forskarsession per protokollet i `notes/overflow-loop-protokoll.md`
(design: `notes/2026-07-15-overflow-loop-design.md`). Branch `feat/overflow-loop`,
en commit per varv med mätdelta. Total kostnad: **$12,00 av $50-taket**._

## Serien

| Varv | Ratt | PASS | FAIL | Grova | Dupes | Volym/anbud | $ ack. |
|---|---|---|---|---|---|---|---|
| 1 | — (baslinje) | 0/5 | 12 | 78 | 7 | 9 982–10 335 | 3,92 |
| 2 | Enstyckes-regeln (generic-prose) | 0/5 | 9 | 84¹ | 3 | 9 423–10 488 | 6,49 |
| 3 | Budgetfaktor 0,85 (budget-rules) | 0/5 | 9 | 64 | 2 | 8 447–9 473 | 9,21 |
| 4 | — (bekräftelsevarv) | 0/5 | 9 | 60 | 1 | 8 747–9 369 | 12,00 |

¹ Ökningen varv 2 är brus i chip-klassen (se nedan), inte regression: monstret
föll 597–748 pt → borta/485–523 pt samma varv.

## Rattarna som bet (rekommenderas behållas → PR mot main)

1. **Enstyckes-regeln** (`generic-prose.ts`, varv 2): prompten bjöd själv in
   `\n\n`-styckebrytningar som kalibreringen aldrig mätt (budgetarna binärsöktes
   med löpande text). Hård regel i PROSE_VOICE + tre JSON-exempel omskrivna.
   Effekt: monster-rutan `{Läsanvisning 2}` (600 tecken budget, värsta fyndet i
   varje varv-1-anbud, upp till 1,66× boxhöjd) i praktiken släckt; dubbletter
   7→3 som bieffekt (färre parafraserande stycken).
2. **Prosa-säkerhetsfaktor 0,85** (`budget-rules.ts`, varv 3): modellen
   levererar ~1,1–1,25× den mjuka "ca X tecken"-begäran, och budgetarna är
   box-exakta — varje överdrag blev overflow. Faktorn skalar bara prosa-slots
   (>80), avrundar till jämna 10, golvas vid kortfältströskeln+1 (ingen
   klassflipp). Effekt: grova 84→64→60; monstret OK i 5/5 (varv 4);
   dataplattform första 0-FAIL-anbudet (varv 3). Volymkostnad: ~−1 000
   tecken/anbud (8,4–9,5k — inom korridoren, men mer nedskalning är INTE
   säker: en undervikt `{Läsanvisning 2}` 283/600 sågs i varv 3 = variansen
   nuddar redan min-fill-golvet åt andra hållet).

## Strukturfynden (utanför rattarnas räckvidd — dina beslut)

### A. Kalibreringsgolvet ljuger om smala chips → 100 % av kvarvarande FAIL

`MIN_BUDGET = 30` (`calibrate/binary-search.ts`) + `Math.max(30, …)` på
enrads-cap-vägen (`calibrate/calibrate.ts:84–88`) golvar varje budget till 30 —
även för etikett-chips vars rad rymmer ~3 tecken (riskmatrisens nummerkolumn
m.fl.). Modellen skriver lydigt 24–28 tecken ("Otydlig scope styrmodell") som
vertikalstaplas bokstavsvis genom slidekanten. Visuellt verifierat:
`tmp/inspect/varv02-styrmodell/slide-08.png`. **85 av 137 slots ligger på
golvvärdet 30.** Samtliga 9+9 FAIL i varv 3+4 har denna signatur (slide
3/5/6/8/10, text bottom 817–882 pt); vilka chips som faller varierar
stokastiskt mellan varv, klassen aldrig.

**Rekommendation:** låt enrads-cappen skriva ÄRLIG kapacitet (t.ex. 3) i stället
för golvet; kortfältsprompten hanterar redan små budgetar ("max N tecken: skriv
ENDAST värdet"). Omkalibrera Radrum v4 därefter (~6 varv COM som förra gången).
Loopen kan aldrig nå 0 FAIL innan detta är gjort.

### B. `{Sektionsnummer 3}` — intent-vs-gate-mismatch (min-fill 4–5/5 per varv)

Slotens egen intent säger "Lämnas tom …", men den är prosa-klassad (budget 110)
och min-fill-vakten kräver ≥50 %. Att prompt-tvinga text dit vore att Goodharta
vakten baklänges — avstod medvetet. **Rekommendation:** undanta
intent-sanktionerat-tomma slots från min-fill (gate-ändring = din), eller
omklassa sloten vid omkalibreringen.

### C. Kvarvarande grova (~60) är chip/kicker-dominerade

Efter A återstår sannolikt en liten svans prosa-varians (±1 slot per varv nuddar
tröskeln, t.ex. monstret +33 pt i 1/5 i varv 3). Bedömning: enforcement-spinoffen
(scan-driven reparationsvända per anbud) är rätt verktyg för svansen — build-beslut
efter A, inte fler promptvarv nu.

## Stoppmotivering

FAIL-aggregatet var flat (9) tre varv i rad med hela mängden i en klass som
whitelistade rattar bevisligen inte når (två oberoende bekräftelsevarv).
Fler varv utan nya hypoteser hade bara bränt budget mot stagnationsvillkoret.

## Nästa steg

1. **Din visuella dom** på varv 4-decken (`evals/overflow/runs/varv-04/*.pptx`,
   öppna i PowerPoint) — godkänt ⇒ PR av rattändringarna mot main
   (routine-granskning som vanligt).
2. Beslut A (omkalibreringsgolvet) och B (min-fill-undantaget).
3. Efter A: nytt kort loop-pass (2–3 varv) för att verifiera 0-FAIL-räckvidd;
   $38 kvar av budgeten.
