# Noll-hallucinationsloop — evidens-förankrad extraktion

_Datum: 2026-07-03 · Beslut: Stefan_

## Pivotbeslutet

Matchningskvalitet är vallgraven. En konsultfirma litar på Bidsmith bara om
kravanalysen och matchningen är korrekta — ett enda uppdiktat "ska-krav" som
firman inte uppfyller kan sänka ett anbud eller få dem att avstå fel upphandling.
Därför prioriteras **noll hallucinationer i extraktionen** över allt annat.

PPT-exportens sista-milen-perfektion (slot-overflow, font-substitution, mall-UI)
**nedprioriteras** medvetet — den kalibreras mot riktiga case senare. Det är
polish; extraktionens sanningshalt är correctness.

## Span-grounding: mekanismen

Varje extraherat krav tvingas bära ett **ordagrant källcitat** (`evidence`):

1. **Schema-tvång.** `RfpRequirementSchema.evidence = z.string().min(1)` — modellens
   output valideras i `callClaude`; ett krav utan citat får inte passera. (Läs-typen
   `RfpRequirement.evidence` är valfri så analyser lagrade före fältet fortsatt parsar.)
2. **Prompt-tvång.** Systemprompten i `rfp-analyzer.ts` säger, i samma anda som den
   befintliga källmaterialstroheten: citatet ska vara kopierat tecken för tecken ur
   underlaget (max ~50 ord), ingen parafras; kan ett krav inte citeras ordagrant får
   det inte tas med.
3. **Mekanisk verifiering.** `src/lib/verify-evidence.ts` sträng-matchar
   citatet mot källdokumentet efter normalisering (se nedan). Träff = förankrat.
   Miss = utelämnat (`missing`) eller uppdiktat (`not-found`).

### Varför ingen LLM-domare = inget kalibreringsproblem

En sträng-containment är **deterministisk**. Inga gränsfall som flippar mellan
körningar, ingen modell-stilbias (jämför fas 1: judgen sa Fable 50–1, människan
7–1 för Opus — belagd stilbias). En LLM-domare hade återinfört exakt det
kalibreringsproblem som pausade fas 2. Här finns inget att kalibrera: citatet
finns i källan, eller så finns det inte.

### Normalisering (tolerant på form, strikt på innehåll)

`normalizeForEvidence` gör, i BÅDE citat och källa:
- **Mjuka bindestreck bort (U+00AD)** — PDF-avstavning stoppar in dem mitt i ord.
- **Typografi → ASCII** — Word ger kröktacitat (' ' " ") och tankstreck (– —);
  modellen återger ofta raka varianter. Glyfvalet ska inte fälla en innehållsträff.
- **Whitespace-körningar → ett mellanslag** — PDF bryter meningar mitt itu; ett
  citat har mellanslag där källan har radbrytning.

Efter normalisering: **case-känslig** substring-containment. Skiftläge är en
innehållsskillnad som en ordagrann-regel ska fånga.

## Ärlig kvarvarande risk

Den mekaniska kontrollen dödar HELA klassen **fabricerade citat** — ett citat
som inte finns i källan fångas alltid. Den fångar INTE att modellen citerar
**äkta men irrelevant** text (rätt ord, fel krav). Den relevansen **spot-checkas
av människa** på den gröna slutkörningen — men först när loopen är grön är den
mänskliga granskningen billig (all bulk är redan bevisligen källförankrad).

## Loop-protokoll

```
kör (evals/scripts/zero-hallucination-loop.ts)
  → för varje miss: klassa problemet
      · prompt-problem   → modellen parafraserar/hittar på → skärp prompten
      · schema-problem   → fältet accepterar för mycket → skärp schemat
      · fixture-problem  → rfp_text saknar/har trasig text → laga fixturen
  → justera
  → kör om
  → 0 missar över ALLA fixtures
  → lås som API-nyckel-gatad regressionsgrind (skipIf(!ANTHROPIC_API_KEY))
```

Rapporten (`evals/results/<timestamp>-zero-hallucination-loop.md`) ger per fixture:
kravantal, evidens-coverage, och varje miss med reason + de felande strängarna —
så operatören kan diagnosticera prompt vs schema vs fixture.

## Kostnadsstyrning

- **Hård tak:** `BIDSMITH_LOOP_BUDGET_USD` (default $20).
- **Bokföring:** loopens anrop får etiketten `eval:zero-halluc`; kostnaden landar i
  `ai_call_logs.cost_usd` via `callClaude`s `label` (samma väg som all annan spend).
- **Grind FÖRST:** den kumulativa (all-time) summan för etiketten läses INNAN ett
  enda betalt anrop görs; överskrider den taket avbryts loopen (exit ≠ 0). Kvarvarande
  budget skrivs ut vid slutet.
- **Estimat:** ~$1–2/varv (4 fixtures, Sonnet 5-extraktion, ~200k tecken i den
  största FFU:n). $20-taket räcker till ~10–15 varv.
- Skriptet vägrar köra utan `ANTHROPIC_API_KEY`.

## Fas B — CV-extraktion (input-grounding) — BYGGD 2026-07-03 (operatörsvalidering kvar)

Samma mekanism på konsult-CV:n: varje extraherad **kompetens** och **referens** bär
ett ordagrant citat ur CV-texten. En hallucinerad kompetens är den DIREKTA falsk-
match-vägen i matchern — produktens kärnvärde — så det är rätt claim att grunda.

### Scope-beslut

- **Evidens krävs på kompetenser + referenser** (matchnings-kritiska claims).
  `level`/`yearsExperience`/`summary` förblir **sanktionerade bedömningar** — promptens
  "rimlig bedömning"-regel är NARROWAD till att gälla ENDAST dem. Kompetenser/
  referenser får KÄLLCITAT-hårdregeln (ordagrant ≤~50 ord, sammanhängande, tecken för
  tecken, aldrig sammansmält). Ett kompetens-NAMN får normaliseras ("React",
  "Svenska (modersmål)") men dess `evidence` måste vara ett ordagrant CV-citat som
  nämner kompetensen; en claim som inte kan citeras får inte emitteras.
- **Schema:** `evidence: z.string().min(1)` på varje kompetens + referens;
  `competencies` får `.min(1)` (ett CV utan en enda kompetens = degenererat svar,
  samma rationale som `requirements.min(1)`); `references` får vara tom (junior utan
  listade uppdrag är legitimt). Läs-typerna (`ConsultantCompetency/Reference.evidence`)
  är valfria — lagrade konsulter parsar oförändrat.
- **Vaktpolicy:** identisk med RFP — behåll + flagga (`evidence: undefined`).

### Guarden utfaktoriserad

Vakt-mekaniken är flyttad ur `rfp-analyzer.ts` till en generisk helper
`src/lib/evidence-guard.ts` (`runEvidenceGuard`): verifiera alla → 0 missar ⇒
returnera befintliga citat, noll API-anrop → annars ETT batchat re-citat (numrerade
missade poster + full källa i `<underlag>`, `itemNoun` interpolerad i prompten) →
re-verifiera → adoptera/strip → fel ⇒ `console.warn` + undefined. `rfp-analyzer.ts`
och `consultant-extractor.ts` anropar båda helpern; RFP-vaktens observerbara beteende
är oförändrat (befintliga guard-tester gröna efter refaktorn). `extractConsultant` kör
guarden EN gång över konkatenationen kompetenser + referenser (kompetens → `text`:
namn; referens → `text`: `titel: beskrivning`), så en enda re-citat-omgång täcker
båda kinds — därav `itemNoun = "kompetenser och referensuppdrag"`.

### CV-loop + fixtures

`npm run eval:zero-halluc -- --target=cv` kör `extractConsultant` över
`evals/fixtures/cv/*.yaml` (`CvFixtureSchema`: `{ id, cv_text, golden:
{ competency_count } }`) och verifierar kompetens- + referenscitaten mot `cv_text`.
Rapporten visar extraherat-vs-golden kompetens-antal (coverage-ögonmått) och
verifierade par på grönt. `extractConsultant` fick en `label`-param (default
`consultant-extraction`; loopen skickar `eval:zero-halluc-cv`), samma mönster som
`analyzeRfp`. Här behövs INTE realistiska CV:n för mekaniken, men fixturerna görs ändå
realistiska så extraktionen blir icke-trivial: `evals/scripts/generate-cv-fixtures.ts`
(operatörskörd, BETALD, `MODELS.writingSupport`, label `eval:cv-fixture-gen`) renderar
identiteterna i `synthetic-pool.yaml` till löptext-CV:n (rubriker, punktlistor,
anställningshistorik) med `golden.competency_count` = poolprofilens kompetens-antal.
**Fixturerna är syntetiska — ingen PII.**

### Budget-gate-bugg funnen + fixad

Loopens kostnadsfråga använde `.eq("label", LOOP_LABEL)` — men re-citat-anropen loggas
under `<label>:requote` och FÅNGADES ALDRIG av grinden (verklig underskattning idag).
Fixad: `.like("label", "eval:zero-halluc%")` (paginering behållen). Mönstret täcker nu
rfp, cv OCH båda requote-etiketterna — budgetgrinden summerar bådas kostnad före ett
enda betalt anrop. Cost-helpern är utbruten till `evals/harness/core/loop-budget.ts`,
rapport-renderingen till `evals/harness/core/loop-report.ts` (loop-skriptet < 300 rader).

## Fas C — matchningsmotiveringar

Matchningens motiveringar ("varför denna konsult") måste citera CV-förankrade
fakta, inte generisk beröm. Samma verifierare, källa = konsultens CV-text.

## Produktuppsida

`evidence` är inte bara en eval-mekanism — det är en **förtroende-feature**. I UI:t
surfas citatet per krav som "källa: …", så firman ser exakt var i underlaget varje
krav kommer ifrån. Sanningshalten blir synlig för användaren, inte bara för grinden.

## Motvikten: coverage mot goldens

0 hallucinationer är trivialt uppnåeligt genom att extrahera ingenting — en modell som
blir för konservativ av citat-tvånget "vinner" loopen genom att tappa äkta krav. Därför
är loopen INTE ensam grind: efter grön loop körs analyzer-evalens coverage mot samma
fixtures människo-verifierade goldens (fastställda 2026-06-11). Grön = 0 overifierbara
påståenden OCH bibehållen coverage. Faller coverage är citat-regeln för hård — justera
prompten, inte målet.

## Varv 1-fynd (2026-07-03, $0.33)

95.5% verifierat direkt (63/66). ALLA tre missar var källartefakter, inte
hallucinationer — modellen citerade den logiska texten korrekt:
sidbrytnings-skräp mitt i meningen, PDF-tappat "- " ("kundoch"), versaliserad
citatstart. → Verifierare v2: första-tecken-tolerans + skarv-tolerant
tvåhalvsmatchning (halvor ≥25 tecken, i ordning, ≤400 tecken gap — omöjligt att
utnyttja för fabricerade citat).

**Viktigare fynd: run-varians.** Samma 54k-token-dokument (orebro) gav 0 krav
(235 output-tokens) i loopkörningen och 20 krav (4876 tokens) i sonden direkt
efter. Sonnet 5 saknar temperature-styrning → extraktionen är inte längre
deterministisk; degenererade nästan-tomma svar förekommer. Åtgärd i PRODUKTEN:
`RfpAnalysisSchema.requirements.min(1)` — en RFP utan krav existerar inte, så
det degenererade svaret blir ResponseFormatError och callClaudes format-retry
re-promptar. Loopen dubblar därmed som flakiness-detektor.

## Varv 2–5-fynd + slutsats (2026-07-03, totalt $3.22 av $20)

- **Varv 2:** orebro löst av min(1)-vakten; 3 nya missar = bullet-glyf-klassen
  (list-markup klistrad mot ord / utelämnad i flerpunktscitat) → normalisering.
- **Varv 3: GRÖN** — 0 overifierbara över alla 4 RFP:er (78 krav), frisk coverage.
- **Varv 4 (stabilitet): loopens första ÄKTA fångst** — modellen smälte samman
  "samverkansprocesser" till "samverkans- och utvecklingsprocesser" mitt i ett
  annars ordagrant citat. Gap-matchen släppte korrekt inte igenom (36 fabricerade
  tecken >> 3-teckens skarv-slack). Prompt skärpt (sammanhängande avsnitt).
- **Varv 5:** 1 ny miss, samma klass (formulärfråga omskriven till påstående).

**Slutsats: ~1 miss/varv (~1,3 % av kraven), stokastiskt, olika fixture varje
gång — prompten är vid sin asymptot. Utan temperature-styrning (Sonnet 5) kan
prompt-tuning inte nå STABIL nolla. Den ärliga garantin är RUNTIME-verifiering:
kör verifyEvidence (gratis string-matching) i analyzeRfp på varje extraktion —
"inget overifierat påstående passerar", oavsett modellens dagsform.**

Öppet produktbeslut (Stefan): vad gör runtime-vakten med ett overifierat krav?
(a) släng kravet (risk: tappar äkta krav vars citat blev omskrivet — farligt för
kravmatrisen), (b) behåll kravet men flagga citatet som overifierat (ingen
"källa"-badge i UI, kravet syns), (c) targeted re-prompt av bara det kravet.
Loopen förblir kalibrerings- och regressionsverktyget; runtime-vakten blir
garantin.

## Beslut & leverans (2026-07-03, Stefan): re-prompt SEDAN flagga

Beslutet är **(c) följt av (b)**: verifiera → ETT batchat riktat re-citat-anrop
för de krav vars citat inte gick att verifiera → fortfarande overifierbart ⇒
strippa citatet (`evidence: undefined`, flaggat), behåll kravet. Aldrig (a) —
inget äkta krav tappas.

**Shippat:** vakten sitter i `analyzeRfp` (`src/lib/rfp-analyzer.ts`), och
verifieraren är flyttad till produktkod (`src/lib/verify-evidence.ts`, delad av
vakt + loop). Mekaniken:

1. `verifyEvidence("runtime", …)` på extraktionens krav — gratis. 0 missar
   (vanligast) → returnera direkt, noll extra anrop.
2. Missar → ETT batchat re-citat-anrop (aldrig per krav; dokumentet dominerar
   input-tokens och skickas en gång). Etikett `${label}:requote` → loopens budget
   summerar båda anropen. Schema tillåter `evidence: null` så modellen ärligt kan
   koncedera i st.f. att tvingas fabricera.
3. Re-verifiera varje returnerat citat. Verifierar → ersätt. Null/saknat/
   fortfarande overifierbart → `evidence: undefined`.
4. Re-citat-anropet är try/catch:at — ett fel STRIPPAR de missade citaten och
   returnerar analysen. Vakt-degradering ≠ analysfel; användaren blockeras aldrig.

### Ny loop-semantik (viktig för diagnos)

Loopen mäter nu **POST-vakt**-kvalitet. Därför skiftar miss-klassernas betydelse:

- En **`missing`**-miss betyder nu "**overifierbar ÄVEN EFTER ett reparations-
  försök**" — dvs. vaktens flaggade krav (citatet strippades). Det är förväntat,
  inte ett fel: residualen (~1,3 %) landar här som flaggade krav utan källa-badge.
- En **`not-found`**-miss ska vara **OMÖJLIG post-vakt** — vakten strippar varje
  citat som inte verifierar, så ett citat som finns men inte matchar kan inte nå
  loopens verifiering. Dyker en `not-found` ändå upp indikerar det en **bugg i
  vakten** (t.ex. att den inte kördes, eller att strip-vägen missade ett index),
  inte en modell-hallucination. Behandla den som en regression, inte fixturbrus.
