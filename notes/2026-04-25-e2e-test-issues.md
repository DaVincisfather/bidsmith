# 2026-04-25 — E2E-test issues

Observerade buggar/UX-problem under end-to-end-körning av management-batch-2-data (10 CV + 2 RFP, post PR #20/#21-merge).

## Issue 1: Bid-planner föreslår byten med 0 % delta

**Vad:** "Förbättringsförslag" visar förslag som agenten själv argumenterar emot.

**Exempel:** "Byt Maria Bergström → Jonas Eriksson +0%. Jonas Eriksson täcker bör-kravet om facklig involvering, men hans profil saknar referensuppdrag inom organisationsöversyner på regional/kommunal nivå och han riskerar att försvaga leverantörens totala referensuppdragsstock. Maria Bergström bidrar dessutom med juridisk kompetens (kommunallag) som är ett bör-krav. Bytet ger ingen nettopositiv effekt."

**Förväntat:** Förslag med delta ≤ 0 ska suppress:as innan rendering — eller agenten ska prompt:as att inte producera dem.

**Trolig location:** `src/lib/bid-generator/` eller `bid-planner.ts`. Kolla om scoring-logiken har en filter på post-suggestion-deltat, eller om prompten tvingar fram förslag oavsett.

**Reproduktion:** RFP-1 (Organisationsöversyn av regional förvaltning), bid-flow med blandad konsultpool (batch 1 + batch 2).

**Severity:** Låg — kosmetiskt + förvirrande, ej blockerande.

## Issue 2: Analyssammanfattning poppar inte ut visuellt

**Vad:** Sammanfattningen längst ner i analysvyn är den mest värdefulla output:en (syntes av alla delar) men har för låg visuell vikt — användaren riskerar att gå vidare utan att läsa den.

**Exempel-text:** "Teamet uppfyller samtliga ska-krav... De tre tyngsta utvärderingskriterierna — metodbeskrivning (30 %), referensuppdrag (20 %) och nyckelkompetenser (15 %) — är väl täckta. Det enda substantiella gapet är avsaknaden av stark facklig involvering-profil... Trots identifierade red flags kring ofullständig RFP och prisosäkerhet rekommenderas go, men med skarp intern kalibrering av prisstrategin och en tydlig kapacitetssäkringsplan för sommarmånaderna."

**Förväntat:** Sammanfattningen ska visuellt sticka ut — Stefan styr designen, dokumentera bara observationen här.

**Trolig location:** `src/app/analysis/[id]/page.tsx` eller motsvarande summary-component.

**Severity:** Låg-medel — påverkar beslutskvalitet (användaren missar syntes).

## Feature-idé: prisoptimerings-rådgivare (kopplad till win-probability)

**Observation från E2E:** Anbudet visade en uppskattad vinstchans på 68 %. Det går idag inte att se hur timpris/prisstrategi påverkar den siffran, och systemet ger inget aktivt råd om vilket timpris-spann som är rimligt.

**Stefans tes:** Starkt team + bra sammansättning bör motivera högre timpris. Omvänt: ett svagare team bör pressa priset nedåt för att hålla vinstchansen uppe. Systemet borde göra den kopplingen explicit och föreslå ett prisintervall.

**Möjlig koppling till befintliga delar:**
- Outcome-logging finns redan (PR #6/#7) → grundval för data-flywheel, dvs. firmans egna historik kan kalibrera modellen.
- Win-probability-score finns (Go/No-Go-agenten).
- Bid-planner kan utökas med en pris-dimension som är scoringen-aware.

**Möjlig feature-form:**
- Slider i RFP/anbudsvy: "drag timpris" → live-uppdaterad win-probability.
- Initial rekommendation: "Givet teamets matchning föreslås X-Y kr/h. Branschmedian Z."
- Dashboard-vy: pris × win-prob × marginal i en pipeline-tabell.

**Storlek:** Inte trivialt — ny modul, kalibrering mot historik, UX-design. Kräver brainstorming + writing-plans-skill innan impl.

## Issue 4: BidEditor kraschar på sections utan content (FIX:AT)

**Symptom:** Regenerera-knappen klickbar inte + texten ej redigerbar i anbudseditorn.

**Root cause:** `BidEditor.tsx:132-135` gjorde `s.content.format === "team-pricing"` utan null-check. När någon section saknade `content` (eller `members`) kraschade hela komponenten, vilket dödade både hover-toolbar för Regenerera och `contentEditable`.

**Fix:** Optional chaining på `s.content?.format` och `s.content.members?.some(...)`. Minsta möjliga patch.

**Återstår att utreda:** Varför kan content vara undefined? Möjliga spår:
- Race i bid-generator där section skapas innan content fylls
- DB-rad med null content från en avbruten generation
- En section-type som legitimt inte har content
Lägg till en guard längre upp om det händer ofta.

**Fångad av:** Live-monitor på dev-server-loggen (uncaughtError från React).

## Issue 3: Onödigt mellansteg i go-no-go → anbud-flödet

**Vad:** När användaren klickar "Gå vidare till anbud" tuggar systemet en stund och visar sedan en ny knapp "Öppna anbudsgenererare" som måste klickas för att fortsätta.

**Förväntat:** Direkt redirect till anbudsgenereraren när loading-call:en är klar — ingen mellanknapp.

**Trolig location:** `src/app/analysis/[id]/page.tsx` eller motsvarande go-no-go-resultatkomponent. Sök efter "Öppna anbudsgenererare" eller liknande string.

**Severity:** Låg-medel — extra klick utan värde.

## Övrigt observerat

- React key-prop-warning på `RequirementMatrixV2Renderer` — FIX:AT. `<>` Fragment shorthand i `.map()` saknade `key`. Bytt till `<Fragment key={i}>` och städat redundanta inre keys.
- RFP-1 var trunkerad mid-section 8 vid genereringen (max_tokens 3500 var för lågt) — fix:at i `scripts/generate-rfps.ts` (höjt till 6000).
- Markitdown parsade alla 10 CV-docx + 2 RFP-docx utan fel (Ffmpeg-warnings är benign — ingen audio i dokumenten).
