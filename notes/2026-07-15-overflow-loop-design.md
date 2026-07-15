# Overflow-loopen — autoresearch mot 0 layoutfel — design

_2026-07-15. Brainstormad med Stefan efter smoke 2 (alla vägval nedan är hans).
Implementationsplan skrivs separat efter spec-godkännande._

## Bakgrund

Smoke 2 (2026-07-15, anbud a400c2ca vs 14/7-baslinjen c993fa7a, samma grindar):
FAIL 5→3, WARN 48→42, volym 12 705→11 804. Stefans dom "nästan samtliga fel kvar,
marginellt bättre" — bekräftad. Volymkriget är vunnet (46k→12k), layoutkriget återstår.
Kvarvarande fel i tre högar: (1) malldefekter (3 outside-slide-FAIL, slide 2/4/8),
(2) grova overflow (budgetar är rådgivande — `softCap` i renderaren är warn-only vid
1,3×, ingen mekanisk enforcement finns), (3) små WARN (kicker/radbryt-mätbegränsning).

Stefans idé: en autoresearch-loop som matar in olika anbud och itererar tills det
binära målet nås — inga text-overflows, inga trasiga radbryt, ingen visuell död yta.

## Beslut (brainstorm 2026-07-15)

1. **Autoresearch-loopen byggs FÖRST** — före reparationsverktyg per anbud och före
   produktions-enforcement. (De två andra kan bli *resultat* av forskningen.)
2. **Rattar loopen får vrida på:** generic-prose-prompterna (system + re-ask +
   kortfältsregeln), generella budgetregler/-faktorer (t.ex. be om 0,85× budget,
   enrads-hantering, MAX-slot-behandling), mekaniska regler (soft-cap-tröskel,
   tvingande re-ask av budgetbrytare, kapning vid meningsgräns).
   **Fredat:** mallprofilernas uppmätta budgetChars, mätkoden/gates, `models.ts`.
3. **Drivning: autonom agent-loop** — lokal Claude-session (COM-kravet gör moln
   omöjligt) som kör varv utan mänsklig grind per varv. **Stefan får rapporten efter
   VARJE varv** (skickas proaktivt), men loopen väntar inte på svar.
4. **Varv = 5 unika RFP:er** (en generering per RFP, ~$5–7/varv).
5. **Kostnadstak $50.** Stopp: målet nått två varv i rad (konvergens), ingen
   förbättring tre varv i rad, eller taket nått.
6. **Slutkandidaten kräver Stefans visuella dom före merge** — loopen levererar
   branch + rapportserie, aldrig direkt till main.

## Mål (fitness v1 — FRYST under körningen, ändras aldrig av loopen)

Per genererat anbud, allt måste hålla:

- **0 FAIL** (outside-slide, rå token) — EXKLUSIVE känd-defekt-listan (nedan).
- **0 grova vertical-overflow:** textHöjd > 1,25 × boxHöjd ELLER överskott > 30 pt.
  (Under det = observations-WARN, räknas inte mot målet — kicker/radbryt-artefakter
  ligger där tills per-rad-geometri finns, v3.)
- **0 parvisa trigram-dubbletter ≥ 0,3** (ärliga jämföraren — deck:dupes egna
  trösklar är belagt för slappa för LLM-parafras).
- **Goodhart-vakten — min-fyllnad:** prosa-rutor (budget > 80) ska ha ≥ 50 % av
  budgetChars, och deckets totalvolym ska ligga i korridoren 8 000–14 000 tecken.
  Loopen får inte "lösa" overflow genom att svälta texten.
- **Deadspace och radbryt: observationsmått i v1**, inte mål. Varvens 5 deck/varv är
  samtidigt kalibreringsdata; måtten fasas in som mål när de bär (egen beslutsgrind
  med Stefan — inte loopens beslut).

**Konvergens = alla 5 anbud klarar allt, två varv i rad.**

### Känd-defekt-listan

`evals/overflow/known-template-defects.json`: signaturer (slide + shape + felklass)
för Radrum-mallens egna defekter (statiska boxar med botten 817–839 pt på slide
2/4/8/9). Exkluderas ur målräkningen — inga prompter kan fixa dem; de ägs av
mallfix-punkten i ROADMAP. Listan uppdateras ENDAST av människa, aldrig av loopen.

## Arkitektur

### Del 1 — Harnessen: `npm run overflow:eval` (fitness-funktionen som artefakt)

Ett skript (`scripts/overflow-eval.ts`) som kör ETT varv deterministiskt:

1. **Fixturer:** `evals/overflow/fixtures.json` — de 5 analys-id:na (styrmodell
   /RetailTech, bemanning/Göteborg, dataplattform/Sörmland, strategi/NIC,
   organisationsöversyn/Mellansvenska) + templateId (Radrum v4). Fryst under körningen.
2. **Generering:** direkt via bid-generator-lib:en (ingen dev-server/inloggning),
   ett anbud per fixtur mot den onboardade profilen. `ai_call_logs`-label:
   `overflow-eval varv N` → kostnad per varv är query-bar.
3. **Export:** renderTemplate → pptx-fil per anbud.
4. **Mätning:** measure-core programmatiskt (samma kod som deck:scan) + parvisa
   trigram-dubbletter + volym/fyllnad per ruta (mot profilens budgetar).
5. **Rapport:** `evals/overflow/runs/varv-NN/` — rapport.json (maskinläsbar:
   per-anbud gates, per-fynd detaljer, delta mot föregående varv, ackumulerad
   kostnad) + rapport.md (läsbar sammanfattning) + pptx:er + rå scan-json.
6. **Städning:** varvets bid-rader raderas ur DB efter mätning (dashboarden ska inte
   förorenas av eval-anbud) — artefakterna på disk är arkivet.

Harnessens aggregering/gate-räkning/delta enhetstestas mot fixtur-scan-json — inga
live-anrop i sviten.

### Del 2 — Forskaren: autonom lokal drivarsession

Protokoll (dokumenteras i specen + efterlevs av sessionen som kör):

```
per varv:
  1. kör npm run overflow:eval          (kräver: PowerPoint stängt, Supabase vaken)
  2. läs rapport.md + rapport.json
  3. analysera: vilka gates faller, var, varför (koppla fynd → ratt)
  4. ändra EN sak i taget i whitelistade rattfiler
  5. full svit + tsc + lint — grönt krav före nästa varv
  6. commit: "loop(varv N): <ändring> — FAIL a→b, grova WARN c→d, dupes e→f, $X ack."
  7. skicka rapport.md till Stefan (proaktivt; vänta INTE på svar)
  8. stoppvillkor? → slutrapport; annars nästa varv
```

- **Branch:** `feat/overflow-loop`, egen worktree. Varje varv = en commit med
  mätdeltat i meddelandet — hela forskningsserien är granskningsbar och backningsbar.
- **Whitelistade rattfiler:** `src/lib/bid-generator/bundles/generic-prose.ts`
  (prompterna), NY modul `src/lib/bid-generator/budget-rules.ts` (regler/faktorer,
  enhetstestbar), samt mekanisk enforcement i `generate-from-profile.ts` om loopen
  motiverar den. ALLT annat är fryst (mätkod, gates, models.ts, profiler, fixturer).
- **Felhantering:** API-/transportfel avbryter varvet utan att räknas som "ingen
  förbättring"; Supabase-pausen pollas före varv; COM kräver ostörd maskin —
  körfönster meddelas Stefan innan start.
- **Avslut:** slutrapport (hela serien, ratt för ratt) + Stefans visuella dom på
  konvergens-decken. Godkänt → PR mot main (vanlig routine-granskning). Underkänt →
  fynden dokumenteras, branchen ligger kvar som underlag.

## Utanför scope (medvetet)

- Radrum-mallfixarna (egen ROADMAP-punkt — de 3 kända FAIL:en).
- Ändringar i mallprofilers uppmätta budgetar.
- Reparationsloop per anbud och produktions-enforcement som feature — kan bli
  spinoffs av forskningens resultat, beslutas separat.
- Radbryt-/deadspace-gates (fasas in när mätningen kalibrerats, egen grind).
- Fler mallar än Radrum (generaliseringen testas när nästa mall onboardas).

## Öppna risker (accepterade)

- **Overfitting mot Radrum-geometrin:** rattarna är generella till formen, men bevisas
  bara mot en mall. Hanteras vid nästa onboardade mall.
- **LLM-varians:** ett varvs förbättring kan vara slump — därav konvergenskravet
  (två varv i rad) i stället för dubbelkörningar per varv.
- **Judge-fritt:** loopen har ingen LLM-domare (stilbias-lärdomen från fas 1) — alla
  mått är mekaniska; text-KVALITET vaktas bara av min-fyllnad + dubblettgrinden +
  Stefans slutdom.
