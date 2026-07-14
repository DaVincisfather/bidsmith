# Budget-kalibreringsloop — design (2026-07-14)

> Utfall av vägbeslutsdiskussionen (revert/env-flagga/räddning för wizard-onboardingen,
> ROADMAP 2026-07-07). Stefans idé: istället för att välja nu, utvärdera en
> screenshot-korrigeringsloop som kalibrerar längdstyrningen EN GÅNG per mall vid
> onboarding. Lyckas den → räddning. Misslyckas den → env-flagga/revert med gott
> samvete. Godkänd design: hybrid (alternativ C) — mekanisk mätning gör grovjobbet,
> Claude-vision dömer slutresultatet.

## Problemet (uppmätt, bid 378c78a5)

Foreign-mall-genereringen saknar längdstyrning: 45 789 tecken prosa över 11 slides
(designerns avsedda täthet: ~6 500), 0 budgetChars satta, nio dubblett-"Om oss" på
en slide, ursäktsprosa i kortfält ({Diarienummer 2}: 130 tecken "Inget diarienummer
har angivits…"). Tre rotorsaker (TILLÄGG 3 i
`notes/2026-07-06-onboarding-operator-verification.md`):

1. **Ingen längdbudget** — förslags-lagret sätter aldrig budgetChars; generic-prose
   har ingen cap.
2. **Fältkaraktär ignoreras** — en-radsfält får meningar istället för värden.
3. **Ingen syskon-arbetsdelning** — same-slide-slots med överlappande intents
   upprepar varandra.

Nyckelfakta som gör räddningen billig: `generate-from-profile.ts` skickar REDAN
budgetChars till prompten när det är satt, geometri→tecken-matten finns i
`introspect/compute-budgets.ts`, och profilen persisteras i `template_profiles`
(fältet finns i schemat — ingen migration behövs).

## Designbeslut: kalibrering vid onboarding, inte korrigering vid generering

Loopen körs EN gång per mall (dyr/långsam är acceptabelt där), skriver kalibrerade
budgetar till profilen, och varje senare bid-generering blir billig och preventiv —
budgeten flödar in i prompten som redan i dag. Detta istället för en reaktiv
korrigeringsloop per genererat anbud (dyr per körning, kan inte köras på Vercel —
PowerPoint COM finns bara lokalt).

Först byggs den som lokalt skript (utvärdering + operatörsverktyg). Produktifiering
= flytta samma steg in i onboarding-flödet som eget senare spår; ingen del av
designen låser fast oss i COM (den mekaniska delen är portabel, vision-passet är
ETT anrop).

## Komponent 1: kalibreringsskriptet

`scripts/calibrate-budgets.ts` + COM-mätdel i PowerShell. Körs efter
onboarding-complete mot mallens instrumenterade kopia + sparade profil.

Dataflöde per iteration:

1. **Fyll** — syntetiska sektioner med deterministisk svensk testprosa i exakt
   kandidatlängd per ruta (ingen AI), genom befintliga `renderFromProfile`-vägen så
   fyllningen beter sig som produktion. Startgissning: `compute-budgets`-matten.
2. **Mät** — PowerPoint COM öppnar decket och jämför per shape textens faktiska
   höjd (`TextFrame2.TextRange.BoundHeight`) mot rutans höjd. Ingen PNG-export i
   mätvarven. Autofit-rutor krymper istället för att svämma över — signalen där är
   fontskala < 100 %.
3. **Justera** — binärsökning per ruta (overflow → sänk mot undre gräns; ryms →
   höj mot övre). Alla rutor justeras i samma varv — en render mäter hela decket —
   så kalibreringen konvergerar på ~5–6 renderingar ≈ ett par minuter. $0.
4. **Slutpass (vision)** — `inspect-pptx.ps1` → composite-PNG; Claude granskar och
   flaggar visuell trängsel/konstiga radbrytningar som måtten missat → manuell
   nedjustering av flaggade rutor → profilen skrivs till `template_profiles`.

**Kortfält på köpet:** ruta med uppmätt budget < ~80 tecken markeras som kortfält
i profilen och får värde-behandling i prompten.

**Felhantering:** COM-fel eller shape som inte hittas → rutan behåller
geometri-gissningen och flaggas i rapporten. Profilen skrivs FÖRST när allt
konvergerat — loopen lämnar aldrig halvskriven state. Text i tabeller
(`a:tbl`/graphicFrame) deltar inte — slice 6-begränsningen oförändrad.

## Komponent 2: promptändringar i generic-prose

Bägge i `src/lib/bid-generator/bundles/generic-prose.ts`:

- **Syskon-arbetsdelning:** i dag är syskon passiv kontext utan krav. Nytt: vid
  överlappande intents på samma slide ska prompten kräva (a) egen namngiven vinkel
  per ruta (t.ex. "Om oss" → historik/metod/värdegrund), (b) ingen mening upprepas
  mellan syskon. Mekanisk verifiering: parvis likhetskoll på same-slide-sektioner.
  Testfixtur: nio-dubbla "Om oss" (slide 4, bid 378c78a5).
- **Kortfältsregel:** kortfält får instruktionen "skriv VÄRDET eller lämna tomt;
  aldrig meningar, aldrig förklaringar om att uppgift saknas". Testfixtur:
  {Diarienummer 2}-fallet. OBS: tomt kortfält är RÄTT svar — re-ask-vågen (F6) ska
  inte jaga tomma kortfält; re-asken lär sig skilja kortfält från prosafält.

## Utvärderingskörningen (matar vägbeslutet)

Mot befintlig Radrum v4-onboarding — ingen ny klassificering:

1. Kalibreringsloopen → profilen får budgetar (~$0, minuter)
2. Om-generera anbudet med kalibrerad profil + nya prompter (~$1–2)
3. **Gate (mekanisk):** `inspect-pptx.ps1` → 0 FAIL-slides, totalvolym ≤ ~13k
   tecken (2× designertäthet 6,5k), dubblettkoll grön, kortfält har värden.
   Baslinje: katastrofdecket 378c78a5 (45,8k, 8 FAIL).
4. **Stefans dom** på composite: "skulle kunna skickas till kund efter lätt
   redigering."

Utfall → vägbeslut: godkänt = räddning (foreign-vägen behålls; produktifiering av
loopen blir eget spår). Underkänt = env-flagga/revert — då vet vi att även
kalibrerad budget inte räcker (tabelltunga slides är slice 6-terräng oavsett).

## Testning

- Binärsöknings- och testfyllnadslogik: enhetstester (ren TS, ingen COM).
- COM-mätningen: manuell verifiering mot slide med känt overflow (mönster: #51).
- Promptändringarna: fixturtester på dubblett- och kortfältsfallen.
- Före "klart": lint + test + tsc med output (global regel).

## Kostnad & omfattning

~$1–2 API totalt (om-genereringen), väggklocka ~en session. Branch:
`feat/budget-calibration-loop` (worktree `~/projects/bidsmith-budgetloop`).
