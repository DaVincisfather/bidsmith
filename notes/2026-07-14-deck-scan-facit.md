# deck:scan — facit-validering mot tre kända deck (2026-07-14)

> Task 7 i `notes/2026-07-14-measure-core-plan.md`. Scannern valideras mot tre
> deck med känt facit INNAN den får beslutsvikt (deck:dupes-lärdomen). Ground
> truth: Stefans per-slide-dom i `notes/2026-07-14-budget-calibration-evaluation.md`.

## Tuning-varvet (commit e0e603e)

Första körningen avslöjade två strukturella fel — inte trösklar:

1. **outside-slide mätte BOXEN, inte texten.** Radrums kicker-/footerboxar
   sträcker sig ~50pt utanför slidekanten by design (bleed) → 22 falska FAIL på
   tomma mallen, och om-kalibreringen hade krossat kicker-budgetar mot golvet.
   Fix: text-position (top + marginTop + boundHeight mot slidehöjd; text-höger
   endast för no-wrap-boxar — centrerad/wrappad text överskattas av
   left+boundWidth, dokumenterad v1-begränsning).
2. **Vertical-overflow inom box är ofta avsiktlig design** (PowerPoint klipper
   inte; 47 etikettboxar i tomma mallen flödar benignt). Scanner-severity
   nedgraderad till WARN. Kalibreringens verdikt orört (kontrollerade fyllningar
   = äkta budgetsignal där).

## Resultat efter tuning

| Deck | FAIL (exkl raw-token) | WARN | Kommentar |
|---|---|---|---|
| anbud-c993fa7a (eval) | **5 outside-slide** | 48 | se träffbild nedan |
| anbud-378c78a5 (katastrof) | **35 outside-slide** | 135 | skalar 7× värre än eval ✓ |
| tomma Radrum-mallen (baslinje) | **1 outside-slide** | 47 | den enda FAIL:en är en ÄKTA malldefekt |

raw-token: 137 på baslinjen (förväntat — instrumenterad mall är full av {tokens};
ignoreras i baslinjejämförelsen). deadspace: 17 INFO på baslinjen (meningslöst på
tom mall; ignoreras). Exit-koder: eval 2, katastrof 2, baslinje 2 (raw-token) —
för GENERERADE deck är kontraktet rent: FAIL ⇔ text utanför slide / ofylld token.

## Träffbild mot Stefans dom (c993fa7a)

| Stefans fynd | Scannern |
|---|---|
| slide 2: text UTANFÖR sliden | ✅ FAIL outside-slide (text bottom 989pt) |
| slide 9: mycket overflow, "yta finns ju" | ✅ FAIL ×2 (831/830pt) |
| slide 7: Karl Svensson-boxen overflow | ✅ FAIL (861pt) |
| slide 8: "usel", massa overflow | ✅ FAIL (839pt) + flest WARN (8) |
| slide 3: overflow box 1+3 | ✅ WARN vertical-overflow ×6 |
| slide 6: radbryt i vecka-rutorna | ✅ WARN (som vertical-overflow — boxarna är inte spAuto, så single-line-break-checken träffar inte; radbrytet syns som 2-radstext i 1-radsbox) |
| kickers klippta (3/4/7/8/11) | ⚠️ WARN som vertical-overflow (wordWrap=på → texten radbryter i stället för att klippas; text-höger-checken gäller bara no-wrap). Känd v1-begränsning. |
| slide 4: statboxar konstiga | ✅ WARN ×5 |

**Bonusfynd:** baslinjens enda FAIL (slide 9, statisk text 817pt > 810) är en
designdefekt i SJÄLVA mallen — förklarar delvis varför slide 9 såg trång ut även
i genererade deck. Läggs på Radrum-mallfix-punkten i ROADMAP.

## Kvarvarande begränsningar (v1, dokumenterade)

- Kickers med wordWrap=på detekteras som radbryt (WARN), inte som horisontellt
  klipp — text-höger-mätning för wrappad/centrerad text kräver per-rad-geometri
  (v2-kandidat).
- single-line-break träffar bara spAuto-boxar; icke-växande enradsboxar syns som
  vertical-overflow WARN (samma fenomen, annan etikett).
- deadspace är okalibrerad mot "för tomt"-dom (inga INFO på eval-decket; tomma
  mallen är fel referens). Kalibreras mot nästa riktiga generering.
- Scannerns FAIL-klass är avsiktligt smal (text-utanför-slide + raw-token) —
  hellre få säkra FAIL än varnings-brus; WARN-mängden är granskningslista, inte grind.
