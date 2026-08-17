# Bidsmith — Roadmap & Status

> **Enda sanningskällan för "vad är gjort / vad härnäst".** Uppdatera denna fil i
> SAMMA PR som ändringen. Lita ALDRIG på assistent-minne för status — läs här och
> verifiera mot `git log` / koden. (Minnet driftar; denna fil följer koden.)

_Senast uppdaterad: 2026-08-17 — **AUDIT FIX-PR C: REQUIREUSER-SVEPET (DENNA PR).**
Slutauditens polish-svep — alla 38 API-routes bär nu samma auth-kontrakt:
requireUser-triot på de fyra PATCH-routerna (bids/[id] inkl. GET:ens watchdog-
UPDATE, outcome, go-no-go/[id], radar/opportunities/[id]) och de fem gamla
getUserId-routerna (analyze, matches/[id], bids POST, consultants/upload,
radar-analyze — gav 500 i st.f. JSON-401; radar-analyze fick även try/
internalError). Auth flyttad FÖRE body-buffring i analyze/upload (tar samtidigt
udden av det låga chunked-buffrings-fyndet). "Middleware guarantees
authentication"-kommentarerna strukna (pre-#103-arv). requirePageSession i
bids/[id]-sidan (loadProfileForBid vaktades av ordningen — routine-follow-up
#129). NY SVEPTESTFIL require-user-sweep.test.ts: 10 fall, JSON-401 + assert
att varken body eller service-klient nås före auth. AUDITEN DÄRMED STÄNGD för
lansering: alla 4 correctness-fynd + hela polish-svepet åtgärdade; kvar i
backloggen = död kod ×2, stub-delning (routine #130), 22 overifierade._

_Historik (2026-08-17): **AUDIT FIX-PR B: GENERATORNS SLUTFLIP (#130).**
Fjärde correctness-fyndet ur slutauditen: slutflippen generating→draft i
run-bid-generation.ts läste aldrig `{ error }` (supabase-js kastar inte —
belagt ner i postgrest-js `shouldThrowOnError=false`), så en failad skrivning
lämnade bidden i 'generating' utan logg ⇒ watchdogen dömde "tog för lång tid"
⇒ användaren betalade om hela genereringen. Nu: felkontroll + en retry +
annars `markFailed("Kunde inte spara utkastet")`. Incrementella persists förblir
fire-and-forget (bokförd design — som FÖRUTSÄTTER att slutskrivningen larmar).
Teststubbens chain gjord thenable med felkö; retry- och failed-vägarna testade.
KVAR UR AUDITEN: PR C (requireUser-svepet + ?next=-parametern var PR A-routinens
follow-up, TAGEN i A; bids/[id]-sidans loadProfileForBid-ordning noterad av
routinen — in i C-svepet)._

_Historik (2026-08-17): **ULTRACODE-SLUTAUDIT + FIX-PR A: AUTH-GRÄNSEN (#129).** Stefans beställda sista workflow-analys (14 agenter, 4 lenser
säkerhet/död-kod/förenkling/correctness, 33 råfynd → topp 10 adversariellt prövade →
9 bekräftade / 1 motbevisat). FYRA correctness-före-lansering-fynd; denna PR fixar de
tre auth-relaterade: (1) **middleware fail CLOSED** — gamla `return response` när
env-nycklar saknas gjorde HELA appen anonymt läsbar för self-hostare som bara satt
service-nyckeln (sidorna läser med service-klient = RLS-bypass; API-routes failade
redan stängt); nu 503 med SETUP-pekare, publika paths släpps igenom. (2) **matcherns
bildfilsundantag snävat** — `.*\.png$` undantog varje path med bildändelse så
/consultants/x.png nådde handlern utan middleware (ofarligt idag enbart för att
UUID-parsen aldrig matchar; nu bara rotfiler + templates/*). (3) **sessionsvakt i
arbetsyta-sidorna** (ny `lib/page-auth.ts` requirePageSession — #103-regelns
sidmotsvarighet; statistik-sidan läste user-mejl via auth.admin.listUsers) +
**requireUser i consultants/[id] PUT/DELETE** (PII-mutation/radering, 401-test enligt
#118-mönstret, DB-åtkomst-asserten h.dbCalls=0). ÅTERSTÅR UR AUDITEN: PR B
(generatorns slutflip, fjärde correctness-fyndet) + PR C (requireUser-svepet, polish)
— se auditsektionen i backloggen._

_Historik (2026-08-16 kväll): **FFU-TERMINOLOGIBYTET: "RFP" →
förfrågningsunderlag/FFU** (Stefans beslut i smoke-sessionen, körd efter #125 enligt
ordern). STEG 1 UI-copy: nav "Analysera FFU", FFU-radar, arbetsyta/analyser-sidorna,
railens tomläge, metadatan på svenska. STEG 2 promptar (GRINDADE per beslutet):
analyzer/matcher/gonogo/skrivbundlarna (understanding, phases, requirement-matrix,
generic-prose, context) — terminologin i prompttext, ALDRIG kodidentifierare
(RfpAnalysis-typen, rfp-analyzer.ts, storage-nycklar) eller maskin-etiketter
("RFP analysis" i ai_call_logs/cost-buckets är historisk bucketing och orörd).
GRINDAR KÖRDA: trippelsmoke (extraction 17 krav på rå syntetisk FFU + matching
7 scorade + gonogo 1 förslag/poolGap — ingen "RFP"-eko i någon användarsynlig
output) + full generateAllSections mot chalmers-fixturen (bundlarna, RFP-eko-regex).
BYGG-LÄRDOM (nästan-incident): PowerShell plattar enpars-nästlade arrayer —
@(@('a','b')) blir @('a','b') och $p[0]/$p[1] indexerar TECKEN ⇒ -replace 's','t'
korrumperade generic-prose.ts innan git checkout räddade; enparsfall görs med
Edit-verktyget, aldrig loopad -replace._

_Historik (2026-08-16): **PIPELINE-DASHBOARDPASSET (#125): Stefans tre
direktiv byggda mot godkänd mockup.** (1) AVGJORDA anbud lämnar railens kort och blir
arkivsektion (✓/✗-rader, 3 senaste + räknare + länk till statistiksidan som äger
utfallsdatat); (2) DUBBLETTKOLLAPS via ny `splitDashboard` i lib/pipeline (en rad per
analys i väntar-beslut, senaste inlämningen + "senaste av N"-badge; ARKIVET behåller
alla avgjorda rader — de är utfallshistorik, raderas/skrivs ALDRIG över; nya dubbletter
kan inte uppstå sedan #103; `BidSummary.analysisId` tillagd, dashboard-routens tak
8→100 som skydd i st.f. paginering); (3) OMSTYLAT i omdesignens DNA — och efter
beautifului.dev-referensen (bokad av smoke-sessionen 16/8) valde Stefan CHIPS-VARIANTEN:
railen är EN yta med filterchips (Alla/Aktiva/Väntar beslut/Avgjorda, live-filter,
avgjorda capas i Alla-läget med "Visa alla N →"), statuschip per kort (AKTIV/VÄNTAR
BESLUT/✓ VUNNEN/✗ FÖRLORAD med mot-vem/skäl/loggdatum), burgundy-CTA "Logga utfall"
med räknare, ärlig win-rate-fot, utfallsdialogen med Fraunces-rubrik + chip + formfält.
TREDJE falska kalibrerings-copyn städad i samma pass (berikningsformulärets "tränar
modellen" — samma klass som #124:s två). Visuellt verifierad live mot dev (chips-railen
+ öppnad dialog, autentiserade Playwright-shots).
PARALLELLNOT: Stefans smoke kör i worktreen `bidsmith-smoke` (port 3001);
FFU-terminologibytet (beslut i smoke-sessionen) tas EFTER detta pass._

_Historik (2026-08-14 kväll): **GENERERINGS-LIVENESS (#123): Stefans
första smoke-fynd på omdesignade editorn.** Fyndet: man landar i editorn medan allt
genereras, kravmatrisen tuggar länge och stillastående väntande-rader läses som att
det buggat ur (mittens ForgeLoader försvinner så fort första kapitlen landat).
Stefans båda förslag byggda ihop: snurrande mini-indikator per väntande kapitelrad
(ersätter statiska "…") + ForgeLoader (40px, "Smider…") under kapitellistan medan
status=generating. Visuellt verifierad via engångs-anbud i generating-läge
(PostgREST-insert → screenshot → delete, $0). Kvarstående ur samma smoke:
kravmatrisen ÄR långsammast (requirement-matrix ≤7 366 output-tokens/63,5 s per
#107-mätningen) — latensen i sig är eval-/modellspåret, inte UI._

_Historik (2026-08-14 em): **EDITOR-OMDESIGNEN PR 1: SKALET (#120).**
Stefans mockup-beslut (smoke-fynd 5; process: 3 varianter → syntes A+B+C → godkänd,
referens `notes/2026-08-14-editor-redesign-mockup.html`, spec+plan i docs/superpowers/):
ny EditorTopbar (flödessteg-pills ERSÄTTER FlowNav enbart på anbudssidan; dnr,
dokumentnamn, statuspunkt + SPARAD HH:MM, export/submit-knapparna flyttade upp,
metadata-rad avsändare/sista anbudsdag/anbudsdatum ur pinnade profilen + analysen,
null döljs), ny ChapterDashboard (numrerade rader, statusprickar, N/M KLARA,
avvikelsenoter DIREKT under listan; ersätter SectionNav + GeneratingChapterList,
dnd + genereringstillstånd bevarade), sektionskort på papper. ÄRLIG STATUSMODELL
(avsteg från mockup-fyllnad, bokfört i spec): klar/avvikelse (timpris saknas, kunde
inte genereras); "ej granskad" byggs inte (granskningsfeature ≠ omstyling) och
saknas-utan-failad-bundle flaggas inte (borttagning är supportad; foreign ej v2-bunden).
Visuellt verifierad mot dev-anbud b3b76311 (autentiserad Playwright-shot, matchar
mockupen; deadline-formatfix ur verifieringen). STEFANS BESLUT samma dag: PipelineRail
STÅR KVAR på editorsidan men behöver egen UI-polish (backlog nedan).
**PR 2 (DENNA PR): INNEHÅLLET.** PPTX-preview-covern RADERAD (Stefans uttryckliga
beställning) → dokumenthuvud-kortet (kicker + Fraunces-kundnamn + undertitel, alla
tre fälten fortsatt redigerbara, datamodell orörd); fasvyn → numrerad tidslinje
(slide-färgbalkarna raderade, samtliga fält redigerbara); RUBRIKUNIFIERING (wrappern
äger kapitelrubriken i Fraunces, renderers interna h2 borttagna — döda title/style-
props amputerade hela vägen: StyleGuide-plumbingen ur editorn/sidan; routinen belade
att typen därmed var HELT föräldralös — PPTX-motorn importerar den inte — så typen är
raderad, DB-kolumnen workspace_settings.style_guide står kvar oläst); tokenpass
(gray/neutral → ink/rule-tokens, p-6-dubbelpaddar bort). Routine-fynden fixade i PR:en:
placeholder-CSS för tomma EditableText-fält + Number("")-vakten i updateHours.
Visuellt verifierad mot dev-anbud b3b76311: dokumenthuvud + tidslinje matchar
mockupen. Nya renderer-tester (cover + faser). Smoke-fynd 5 STÄNGS vid merge —
därefter Stefans klick-smoke enligt gränsbeslutet._

_Historik (2026-08-14 em): **SVENSK-COPY-SVEPET + KONTRAST (#119).**
Tre backlog-poster stängda: (1) SMOKE-FYND 1 (2026-08-12) — go/no-go-promptens numrerade
kravlista bar engelska tags ([must/qualification]) som modellen ekade i svensk output
("should-krav 2"); nu svenska etiketter ([ska-krav]/[bör-krav]/[önskemål], kind-taggen
struken — listan är redan qualification-filtrerad), promptreglernas engelska
priority-referenser städade, test pinnar etiketterna. GRIND (gonogo-promptändring ⇒
live-smoke, #110-prejudikatet): orebro-fixtur, svagt 2-personersteam ⇒ output helt på
svenska ("ska-krav", "krav 1, 2, 3, 4"), add-förslag "+25–45 %" + ärlig poolGap — PASS.
(2) Flow-nav follow-up 8 + apply-swap-minors — engelska felsträngar i KÄRNFLÖDET
översatta (bids/matches/go-no-go/apply-swap/source-view/outcome/submit/export-guards +
komponent-fallbacks; "Generation timed out" → svensk display-sträng, ingen logik matchar
på den). Consultants-/templates-/radar-routernas strängar medvetet utanför (eget svep).
(3) #112-follow-upen kontrast — vinstchansens "(AI-estimat)" nedtonas nu via text-xs i
stället för opacity-60 (opacity blandar mot bakgrunden, #112-klassen);
probabilityColor-paren UPPMÄTTA mot Tailwind v4-paletten (oklch→sRGB→WCAG):
green 4,72:1 / yellow 4,76:1 / red 5,88:1 — alla PASS AA, ingen ändring behövdes.
Kvar av #112-follow-upen: komponenttest för etikettgrenen + undo-kortet (första
komponenttestet landade i #117)._

_Historik (2026-08-14 em): **EXPORTROUTER-STÄDET (#118): requireUser +
delade readiness-guards.** Två backlog-poster stängda i en städ-PR: (1) routine-follow-up
#116 — båda exportrouterna (md + parkerade PPTX) kör nu `requireUser` på route-nivå
(JSON-401 i stället för ohanterad NotAuthenticatedError ⇒ 500; nytt 401-test på md-routen);
(2) routine-förslag #100 — de rad-för-rad-duplicerade 404/generating/failed/failed_bundles-
guarderna utbrutna till `lib/bid-export-guards.ts` (ParseResult-formad diskriminerad union
så bid-typen smalnar utan non-null-assertions; egen testfil pinnar copy + statuskoder,
inkl. re-export-tillåtet och fail-closed på query-fel). Beteendebevarande — engelska
guard-strängarna översätts i copy-svepets PR (nästa), nu på ETT ställe._

_Historik (2026-08-14): **IMPACT-SPANN + TEAMPEDAGOGIK (#117): go/no-go-
förslagen lovar ett spann, inte en siffra.** Stefans beslut 2026-08-14 (överlovnings-
mönstret belagt 3 av 3: "+15%"→+6, "+10%"→±0, "+20%"→+7): `estimatedImpact`-punktestimatet
ersatt av `estimatedImpactMin/Max` (heltal, REQUIRED i AI-schemat per BUG-A; läs-typen
behåller strängfältet — evaluatorn normaliserar omkastade spann och syntetiserar
display-strängen "+4–7 %", legacy-rader renderar med tilde som förr). Promptregeln kräver
KONSERVATIVT spann; filtret gejtar på övre gränsen (>0), parseImpactPct pensionerad.
Pedagogik-tooltip (smoke-fynd 4) vid förslagsrubriken: individmatchning ≠ teamkomposition.
GRIND (gonogo-promptändring ⇒ live-smoke, #110-prejudikatet): orebro-fixtur, svagt
2-personersteam + meritbärande pool ⇒ add-förslag "+40–70 %" (heltal, normaliserat,
äkta poolkonsult) + ärlig poolGap parallellt — PASS. Smoke-lärdom bokförd: pool-prompten
byggs ur ScoredConsultant.reasoning, så stub-scorer utan meriter ger ärligt 0 förslag.
ROUTINE-FYNDEN FIXADE I PR:EN (APPROVE, båda polish): tooltipen är nu en klickbar knapp
(aria-expanded, touch/tangentbord; title kvar för hover) och nollan i undre gränsen
renderar utan plustecken ("0–5 %"). Beslutet togs i 2026-08-14-beslutspasset (se även
"Ideal 3–5"-strykningen + export/inlämnings-splitten i headrarna nedan)._

_Historik (2026-08-14): **EXPORT ≠ INLÄMNING (#116): exporten är en ren
nedladdning, inlämning är en explicit handling.** Stefans beslut 2026-08-14 (smoke-fynd 3,
2026-08-12: "export-frysningen kanske lite onödig"): export-routerna (md + parkerade PPTX)
flippar INTE längre `exported`/`exported_at` — flippen bor i nya POST
`/api/bids/[id]/submit` (requireUser på route-nivå, guards: 404/redan inlämnad/
generating/failed/failed_bundles ⇒ 409, CAS på status='draft' mot dubbel-submit från två
flikar). Kolumnerna återanvänds ⇒ ALLA nedströms-konsumenter orörda (Pipen, stats,
frys-guards i unlock/apply-swap/POST bids, analyses-listan). UI: "Markera som inlämnad"-
knapp med bekräftelsedialog i editorn + nudge efter export ("filen är nedladdad — markera
när inlämnat"); exported-läget visar inert inlämnad-rad; redigering + re-export förblir
öppna efter inlämning (som förr). Etiketter "Exporterat" → "Inlämnat" (analyser + statistik).
Call sites i HELA repot per #105-lärdomen: demo-seedern markerar nu explicit submit efter
export (annars tom demo-Pipe). MEDVETEN KONSEKVENS: den som glömmer markera får tom
utfallsspårning — nudgen mitigerar; migration behövdes inte. ROUTINE-FYNDEN FIXADE I
PR:EN (COMMENT, inga blockerare): cross-tab-409 adopterar inlämnad-läget i stället för
fel + `role="status"` på nudge/inlämnad-raden; routine-follow-up bokförd i backloggen
(export-routernas gamla getUserId-throw ⇒ 500 i st.f. 401 — byt till requireUser, egen
städ-PR). Grindar: 1551 tester (14 nya, TDD RED→GREEN), lint 0 fel, tsc rent,
`next build` exit 0. Beslutet togs i 2026-08-14-beslutspasset (se även "Ideal 3–5"-
strykningen i förra headern + impact-spannet, egna PR:ar)._

_Historik (2026-08-14): **"IDEAL 3–5"-RADEN STRUKEN (#115): grindbeslutet
avgjort.** Stefans beslut 2026-08-14: meningen "Ideal 3-5 för full impact" stryks ur
team-pricing-bundlens prompt ("Max 5 konsulter (template slot cap)" står kvar).
KORREKTIV mot förra headerns antagande: raden låg INTE i writing-rollen utan i
`team.ts` (writingSupport/Sonnet 5), som prissätter ett REDAN valt team — den kunde
aldrig ändra teamstorleken, bara possibly bias:a omfattning/timmar mot marknadsbilden
(1–2 vanligt små uppdrag, 3 standard, 5 oerhört ovanligt). Grind därmed
live-smoke (gonogo-promptändrings-prejudikatet, #110), inte eval: 2-personersfixtur
(chalmers-healthtech, elin+cecilia) ⇒ exakt 2 rader, inga påhittade konsulter,
omfattningar 50/20 %, 0 overflowFlags — PASS. Beslutet togs i 2026-08-14-beslutspasset
tillsammans med export/inlämnings-splitten och impact-spannet (egna PR:ar, se NÄSTA)._

_Historik (2026-08-13): **TEAMSTORLEKS-HINT (#113): defaultteamet följer
underlaget i stället för alltid topp-3.** Stefans beslut: första bedömningen byggs,
storleks-FÖRSLAG skippas (bolaget bedömer själva; remove-typ byggs inte). Levererat:
`teamSizeHint` i extraktionen (REQUIRED-nullable per BUG-A; sätts ENDAST vid uttrycklig
antalsangivelse i underlaget, ordagrant citat, mekaniskt verifierat via verifyEvidence —
miss ⇒ null, fail closed till dagens beteende), `defaultTeamSize`-hjälparen (hint.max
klampat 1..5; max per Stefans praxisnot: bemanna övre gränsen för ledighetstäckning;
utan hint = 3 som idag) i BÅDA default-ställena (matchnings-UI:t + go/no-go-fallbacken),
transparensrad "Underlaget anger 1–2 konsulter — 2 förvalda". LIVE-SMOKE: syntetisk RFP
med "1–2 konsulter" ⇒ hint med verifierat citat; rfp-1.md utan angivelse ⇒ null.
DESIGNINPUT BOKFÖRD (Stefans marknadsbild 2026-08-13): 1–2 vanligt på små uppdrag,
3 standard, 4 för ledighetstäckning, 5 oerhört ovanligt. ~~ÖPPET SEPARAT BESLUT:
team-bundlens promptrad "Ideal 3–5 för full impact" motsäger marknadsbilden men ligger
i writing-rollen (eval-grindad enligt policyn) — ändras inte utan Stefans grindbeslut.~~
AVGJORT 2026-08-14: raden struken (låg i writingSupport, inte writing — se headern).
Slutgranskningens fynd FIXADE före merge: underlagets tak styr nu även FÖRSLAGEN
(effectiveCap = min(5, hint.max) i evaluatorns promptrad + add-filter + routens
add-vakt med ärlig 409-copy) och förvalsraden ljuger inte längre i låst/liten-pool-läge.
LATENT NOTERING (om-granskningen): apply-routens analysis/match-hämtning flyttades före
guard-kedjan — analysis-404 utrankar nu guard-409:or när båda gäller; oåtkomligt idag
(inget kodspår raderar analyses/matches), pinna med test om delete-analys någonsin byggs._

_Historik (2026-08-12 natt): **ADD-FÖRSLAG (#110): go/no-go kan nu föreslå
en fjärde konsult + säga "poolen räcker inte".** Stefans beslut efter kvällens smoke:
tillägg primärt för otäckta ska-krav (bör-krav tillåtna), strukturerad poolGap-signal.
Levererat: `kind: "swap"|"add"`-diskriminator (REQUIRED i AI-schemat per BUG-A-lärdomen,
optional i lästyperna för legacy-rader), `poolGap: string|null` (required-nullable),
promptens task 6 + regler + teamstorleksinjektion ("Teamstorlek: N av 5"), per-kind-filter
med MAX_TEAM_SIZE-vakt, apply-routens add-gren (removeId frånvarande/null ⇒ append,
409 vid fullt team, allt annat oförändrat: CAS, dubbla bid-vakter, pool-422,
eval-före-delete), "Lägg till X"-kort med "Testa tillägget"-knapp, gul "Poolen räcker
inte"-panel (visas även utan förslag), jämförelsebalkens tilläggsgren. RIDER:
GoNoGoCreateSchema-taket 200→MAX_TEAM_SIZE (sista luckan där team kunde växa förbi 5
server-side). LIVE-SMOKE (grind för gonogo-promptändring): 2-personersteam gav två
kind:add (+15/+8, korrekt sorterade, removeId null) OCH ärlig poolGap om
kollektivavtal+Timecare-kombon — båda signalerna samexisterar korrekt. Kända v1-gränser:
ingen undo-dämpning för add-kort (skulle kräva remove-typ som inte finns; lägre
cirkularitetsrisk än byten). Slutgranskningens fynd FIXAT före merge: filtret tvingar nu
BÅDA fälten (swap.remove OCH swapIds.removeId null) för add — UI:ts två isAdd-härledningar
är ekvivalenta per konstruktion. Deferred follow-ups: promptregeln "varje förslag ska
vara ett byte" omformuleras i nästa prompt-PR (egen smoke), add-grenens felcopy,
två billiga testpins (pool-422 på add, team-diff-pin för add-form)._

_Historik (2026-08-12 natt): **KLASSNINGSHÄRDNING (#111): ska/bör förankras
i underlagets egen markering + deterministisk krav-dedupe.** Rotorsak (backlog-fynd 7,
Stefans repro): omanalys av samma RFP flippade "facklig samverkan" bör→ska ⇒ mekanisk 0 %.
Levererat: (1) prompt-regel — "must" ENDAST vid uttrycklig markering i underlaget
(kravmatris/ska/skall/obligatoriskt i mening eller rubrik); saknad/tvetydig markering ⇒
"should", ALDRIG must på egen viktighetsbedömning (Stefans princip: upphandlingar ÄR
explicita, ofta en matris); (2) `dedupeRequirements` (trigram ≥0,85 + identisk
priority+kind, keep-first) FÖRE evidence-guarden (indexskrivningen är lastbärande);
olik klassning kollapsas aldrig. **EVAL-GRINDEN — ÄRLIGT UTFALL (#107-mönstret):**
`eval:zero-halluc` GRÖN (1 stokastisk miss i första körningen — deliverable med utelämnat
citat, klassen strippas av vakten i drift; isolerad omkörning 22/22). `eval:analyzer` är
RÖD ÄVEN PÅ MAIN (req-f1 0,42 mot tröskel 0,85 — goldens stale sedan Sonnet 5-bytet) och
kan inte grinda någon ändring; baslinje-vs-branch per äkta fixtur visar INGEN regression
(0,67→0,73 / 0,19→0,30 / 0,11→0,10 / 0,15→0,14; snitt 0,28→0,32, inga tappade krav).
NYA BACKLOG-POSTER ur mätningen: run-analyzer räknar med `_stub` (2-kravsfixtur, f1
svänger 1↔0 på en flip och förvränger aggregatet — ska skippas som i loopen); goldens
behöver omannotering under marker-förankrad klassning innan analyzer-evalen åter är grind;
nice-to-have-etikettens fallback i analysis-result (nyckel `nice` vs värdet
`nice-to-have` ⇒ rå sträng renderas). Slutgranskningens mätta fynd FIXAT före merge:
sifferreferens-boilerplate ("bilaga 3" vs "bilaga 4" → 0,9091) kollapsade äkta ska-krav —
siffertoken-precondition tillagd i dedupe-predikatet. KÄND ACCEPTERAD RESIDUAL:
certnamns-klassen ("PRINCE2" vs "PMP" i identisk mall) mäter 0,8533 — strax ÖVER tröskeln
och utan siffror; rapporteras ett kollapsat cert-krav är detta rotorsaken._

_Historik (2026-08-12 kväll): **APPLY-SWAP (#109): go/no-go-förslagens
konsultbyte är nu en knapp.** Stefans klick-smoke (första efter #103) kvitterades i dev:
kärnflödet grönt end-to-end. Två 404-fynd under smoken visade sig vara stale `.next`-cache
(CLAUDE.md-regel tillagd på main, e8b6909), inte kodbuggar i #103/#105. Ur smoken föddes
denna PR: "Testa bytet"-knapp på förbättringskorten (POST `/api/analyses/[id]/apply-swap`:
validerar swapIds mot pool + låst team, CAS-vakt på assessment-id, omvärderar FÖRE
utkastraderingen så ett AI-fel aldrig kostar utkastet, gamla bedömningen behålls),
före/efter-panel (flow-state exponerar näst-senaste bedömningen, limit 2),
useTransition-gejtning mot dubbelklick på stale data under refetchen, samt route-auth på
POST /api/go-no-go (401 i stället för 500; #103-regeln, demo-seedern autentiserar redan).
Kända v1-gränser: cirkulärbyte-risken står kvar (notes/2026-04-30, nu användarsynlig men
exponerad av jämförelsepanelen); `estimatedImpact` är en gissning — livesmoke: "+15%"
blev +6 (42→48 %). Smoke-fynden i övrigt bokförda i live-backloggen._

_Historik (2026-08-12, #107): **HÖGEFFORT-BUNDLARNA TRUNKERADE, DE
SKENADE ALDRIG.** `max_tokens` är ett tak på tänkande PLUS svarstext. Tre bundles körde
`effort: "max"` under Anthropics golv på 64000 (phases 32k, understanding 32k, quality 16k)
⇒ tänkandet åt budgeten och svaret klipptes. Det bokfördes som ett skenande anrop eftersom
outputen stannade på exakt 32k — men ett skenande anrop stannar inte på ett jämnt tal, ett
avklippt gör det. Fixen är ett kapabilitetsregister (`MODEL_LIMITS` i models.ts, testtvingat
per modell) + runtime-vakt i `callClaude` + retry-tak ur registret i stället för gissningen
16384; bundlarna går till `effort: "high"` med tak 64000.
**EVAL-GRINDEN FRÅNGÅNGEN MEDVETET (Stefans beslut 2026-08-12):** evals pausas tills
produkten är färdig — planerad senare är en TREVÄGS (Opus 5@high, Opus 5@xhigh, Sonnet 5)
mot befintlig output, alltså en modellfråga, inte en effort-jämförelse på 4.8. Alternativet
var att låta en känd trunkeringsbugg stå kvar under hela härdningen. Ersättningsgrind =
LIVE-SMOKE (4 bid-generator-fixturer × 1 rep genom `generateAllSections`, produktens egen
`ai_call_logs` som mätinstrument): **24 anrop, 0 fel, $1,32 totalt = $0,33/anbud, 6 min 35 s
väggklocka för alla fyra (~99 s/anbud)**. Inget bundle nuddade sitt tak: phases 1 262–1 658
output-tokens (tak 64 000), 24,4–25,6 s, $0,074 i snitt; understanding ≤1 208/23,6 s;
quality ≤452/11,2 s; requirement-matrix ≤7 366/63,5 s (störst nu). Baslinjen 2026-08-02:
phases på EXAKT 32 000 i 3 av 4 genereringar, 272–277 s, ~$1,05 av ~$1,5 per anbud, och i
en körning skenade även retryn ⇒ hela genereringen fälld. `shortDescription` är rena och
`risks`/`hoursEstimate` materialiseras. OBS för framtida eval: `max` med 64k-taket är en
MÄTARM, inte en driftkandidat — den ger modellen dubbelt tänkutrymme och driver latensen
mot Vercels 300 s._

_Historik (2026-08-11 kväll): **FYRA PR:AR SAMMA KVÄLL, TRE MERGADE.**
#104 MD-escaping, #105 export-flippen till POST, #106 foreign-genereringen fail closed —
alla med PR-routine-fynd åtgärdade i respektive PR. #107 (kapabilitetsregister +
effort-fixen) ~~ligger som DRAFT och får inte mergas förrän eval körts~~ — grinden
frångicks 2026-08-12 och ersattes av en live-smoke, se headern.
Denna PR: prisnoten i `ai-cost.ts` var tidsinställt fel —
Sonnet 5:s $2/$10 skulle enligt noten "bumpas" till $3/$15 efter 2026-08-31, men
Anthropic har gjort $2/$10 till standardpris och höjningen sker inte; en bump hade
ÖVERskattat kostnaderna 1,5×. Prisrad för `claude-opus-5` tillagd (samma tier som
Opus 4.8 — ett rollbyte dit kostar inget extra). Båda låsta med test.
Modellrapporten för Stefan: `notes/2026-08-11-modellrapport-opus5-sonnet5.md`._

_Historik (2026-08-11): **LANSERINGEN SKJUTS FRAM (Stefans beslut 2026-08-11):**
inget datum satt; produkten byggs klar först och lanseringsdatumet sätts när den håller.
Videon, GIF:en och postutkasten ligger kvar som de är (`notes/2026-08-02-launch-posts.md`,
4 `[JUSTERA]` kvar) och kan återanvändas — inget av materialet är datumbundet.
Konsekvens för prioriteringen: "FÖRE LANSERING"-etiketten upphör som styrsignal;
posterna sorteras nu på correctness → produktlucka → polish. Levererat samma dag:
**MD-ESCAPING** (denna PR) — sista posten som bar den etiketten._

_Historik (2026-08-05): **FLOW-NAVIGATION MERGAD (#103, squash 98ea3d3).**
Kärnflödet navigerbart + reload-säkert: stegnav Analys & team → Go/No-Go (egen sida) →
Anbud; en analys = ETT anbud (ersätt utkast/frys exporterade, CAS-skyddat); hård reset
med dialoger; delad stale-regel `lib/bid-status.ts`; omkörningsknapp-luckan stängd.
Full detalj i backlog-postens LEVERERAD-notis. Granskningskedjan (per-task + slutreview
+ PR-routinen) fångade 13 äkta fynd — routinens REQUEST CHANGES (route-auth på
unlock-team + frys-vakt-alignering + CAS-copy) fixade i 2521e27 före merge. Ny
CLAUDE.md-regel: requireUser på route-nivå för destruktiva routes. Follow-ups bokförda
i live-backloggen. KVAR: Stefans egen klick-smoke i dev (planerad 5/8 kväll) — därefter
åter lanseringsspåret (posterna + 11/8)._

_Historik (2026-08-04 em): **BACKLOG-TRIAGE EFTER MD-PIVOTEN.** Backloggen
omsorterad i tre högar: **LIVE efter MD-pivoten** (MD-vägen + kärnan, se Backlog),
**Parkerat med PPTX-motorn** (väcks bara om post-launch-beslutet väcker motorn) och
**Struket** (verifierat inaktuellt: max_tokens-detekteringen FINNS i ai-client sedan
go/no-go-passet; PR-routinen bevisat aktiv på #99–#101). Beslut (Stefan 2026-08-04):
Markdown-escaping av AI-fritext uppgraderad polish → FÖRE LANSERING (MD är den formella
leveransen och preamblen pekar nedströms-AI på strukturen). Öppna poster ur 🔜 NÄSTA
(citat-täckning, loop-validering, Supabase-pausen) flyttade till live-backloggen;
NÄSTA = enbart publiceringen. Mall-uppladdningsspåret markerat parkerat._

_Historik (2026-08-04 fm): **BID EDITOR MD-FIRST-OMTÄNKET LEVERERAT (#102).**
Stefans beslut (brainstorm 2026-08-03): editorn = överblick + export, avsnitt/kapitel enda
strukturen, kapitelindelningen ÄR överblicken (inga ord-/teckenmått). Levererat:
(1) EDITORN EN DOKUMENTVY — BidEditor 425→272 rader (riktvärdet ≤200 missades — ärlig
siffra); raderat: budget-props/overflow-
omräkning/OverflowChecklist/teckenräknare/SlideNav/SlideGroupedSections/slot-meta-
gruppering i editorn/StructureEvalBadge/hälsorapport-länken/`/shorten`-routen (+ orphan-
schemas); PATCH tar inte overflowFlags, GET returnerar inte structureEval/overflowFlags.
(2) FÖRVÄNTADE KAPITEL FRÅN START — `expected-chapters.ts` (ur RUNTIME_MANDATORY_SECTIONS)
+ read-only GeneratingChapterList under generering; per-bundle-persist i generateAllSections
(serialiserad kö — persistSection är RMW; fel-slukning testad) + inkrementell failed_bundles-
märkning. Live-verifierad: full 11-kapitelslista sekund ett, väntande→klar löpande.
(3) STRUKTURJUDGEN UR RUNTIME — RÄTTELSE: judgen är MEKANISK ($0), borttagen som död
konsument (badgen ryker), INTE kostnad; lib/eval/bid-structure kvar för offline-evals.
(4) MD-PREAMBLE — nedströms-AI-instruktion som HTML-kommentar först i varje export
(semantik + fakta-låst-invarianten + formatgrenar Word/PPT/annat); verifierad i skarp export.
KÄND BEGRÄNSNING: foreign-anbud (flaggan på) visar 11 eviga väntande-kapitel under
generering (expected-listan är v2-bunden) — acceptabelt, foreign är experimentell yta.
Spec/plan: `docs/superpowers/specs|plans/2026-08-03-bid-editor-md-first-*`. Grindar:
1393 tester, lint 0 fel, tsc rent, `next build` exit 0, visuell verifiering + skarp
MD-export läst._

_Historik (2026-08-03 natt): **MD-FIRST-PIVOTEN MERGAD (#101).** Stefans
produktbeslut (argumenten: ALLA mallar är foreign ur en firmas perspektiv; utkast
kräver ändå omarbetning; formaterings-sista-milen löses bättre av verktygen kunderna
redan använder, matade med strukturerad Markdown): **Markdown är den formella
leveransen** — enda exportknappen, flippar `exported`/`exported_at` (felkontrollerat,
route-testat efter routine-fynd; `exported_at` bevaras vid re-export). PPTX-motorn
PARKERAD bakom `BIDSMITH_FOREIGN_TEMPLATES` (default AV, fail closed) — radering är
ett POST-LAUNCH-beslut med användardata. README: "Your template stays yours".
Video v7: PPTX-beaten ersatt med scrollande MD-dokument i brand-typografi.
Posterna omskrivna (ny vinkel: "kill your darlings"). Follow-up bokförd: flytta
export-flippen från GET till POST (båda routerna). Lansering tis 2026-08-11 står._

_Historik (2026-08-03 kväll): **MARKDOWN-EXPORT MERGAD (#100) + VIDEO v6 KLAR.**
Stefans beslut: md-export som mallfritt komplement FÖRE lansering (PPTX förblir
huvudspåret och den formella leveransen — omprioriteringsfrågan tas efter lansering med
användardata). `GET /api/bids/[id]/export-md` + editor-knapp; exporten flippar INTE
status (outcome-statistiken förblir PPTX-bunden). Routinen fällde först PR:en
(CRITICAL/REQUEST CHANGES: blankrads-separatorerna filtrerades bort av lines() ⇒
run-on-stycken i CommonMark) — fixat + strukturtester i follow-up-commit, båda
routine-follow-ups bokförda i backloggen. Video v6 (67 s, långsammare tempo +
accentkant-chips efter fru-testet) + radar-beat med riktig TED-data (87 hämtade/20
Haiku-scorade — kompetens-seed + CRON_SECRET tillagda i demo-miljön) + musik
(Pixabay/Rockot) + 15s-GIF för X. Lansering enligt plan tis 2026-08-11._

_Historik (2026-08-02 kväll): **VIDEO-RÅKLIPPEN KLARA (alla 6 scener) +
PHASES-RUNAWAY BELAGD.** Alla scener omtagna badge-fria mot demo-instansen; storyline:
analys 33ae44b3 → anbud b4571d95 (exported; PPTX i launch-worktreens tmp/demo-bid-v2.pptx;
deck-grindar: dupes inga över tröskeln, scan 0 FAIL). BRANCH-LOKALT på feat/launch-video
(EJ main-material): `devIndicators:false` (Next-badgen låg i pixlarna på alla juli-klipp),
watchdog 7→20 min + riggtimeout (utrymme för max_tokens-retry-kedjan). #83-VERIFIERINGEN:
detekteringen FUNGERAR (räddade 2 av 4 genereringar) men grundbeteendet är värre än trott —
se nya backlog-posten **Phases-runaway** nedan. Två fas-kortbeskrivningar med risk-läckage
manuellt polerade i demo-anbudet (senior-konsult-flödet, bokfört i backlog-posten).
KVAR: Stefan klipper (CapCut) + filmar PPTX:en i PowerPoint → publicering (annonsyta =
Stefans val)._

_Historik (2026-08-02 förmiddag): **FOREIGN-BESLUTET AVGJORT: PUBLICERING MED FÖRBEHÅLL
(denna PR).** Ingen äkta byråmall finns att smoka mot — Stefans beslut: vänta inte,
publicera; riktiga användares mallar ÄR real-mall-smoken (feedback-driven, post-launch).
Genereringen för foreign-vägen BEHÅLLS (slopa-frågan stängd). Levererat i denna PR:
README-sektionen "Bring your own template (beta)" (ärligt förbehåll + `onboarding:measure`-
instruktion + Claude Code-prompt som kör inspektionen/hälsorapporten åt användaren),
README-sektionen "Fighting hallucination: the evidence chain" (Stefans krav: evidenskedjan
för matchning/källhänvisning klarlagd publikt — schema-tvingade ordagranna citat, mekanisk
verifiering utan LLM-judge, runtime-vakt, kvarantän ur AI-input, käll-UI, eval:zero-halluc;
ärlig gräns: relevansdomen är mänsklig), SETUP-pekare till sektionen.
KVAR FÖRE PUBLICERING: video (verifiera att #83:s max_tokens-detektering löste
phases-trunkeringen → ta om scen 5–6) → publicering (annonsyta = Stefans val)._

_Historik (2026-07-21): **#95 + #96 + #97 MERGADE.** Access-modellen (#95) är på
main och invite-smoken grön. Mallsmoke 2 (Design-genererad blankettmall, 195 slots/79 defekter)
drev fram tre leveranser samma dag: **#96** utfalls-buggen (berikningsformuläret avmonterades av
förälderns refetch innan anledning kunde fyllas i — refetch flyttad till save/skip/close, TDD),
**#97** hälsorapporten permanent nåbar (länk i Inställningar-mallistan + anbudseditorns nav) +
"Acceptera alla (N)" (API: `{ all: true }`-union på defects-endpointen). ROUTINE-FOLLOW-UPS
(båda APPROVE, polish — bokförda i backloggen nedan): OutcomeSheet cancelled-vägen + knapp-flash
efter save/skip; wizardens tysta `refresh()`-fel (permanent "Laddar…" när foreign-flaggan är av);
BidEditor saknar testfil. NÄSTA: smoke-anbudets visuella dom (anbud-fc07d29b: volym PASS 8k,
dupes 0, scan 0 FAIL/35 WARN/56 INFO-annoterade) → beslut om polish-mekanik → video → publicering._

_Historik (2026-07-20, access-modellen i detalj):_
_**ACCESS-MODELLEN BYGGD → PR #95**
på branch `feat/access-control` (spec + plan i `docs/superpowers/specs|plans/2026-07-20-access-control*`):
stänger öppen Supabase-signup. Ny tabell `app_users` (migration 013) med roll (admin/member) +
status (invited/active), self-read-RLS + unikt `lower(email)`-index (alla skrivningar via
service-rollen). `/login` fick `shouldCreateUser:false` + "ej inbjuden"-copy; `/auth/callback` nekar
konton utan app_users-rad (signOut + no_access) och flippar invited→active; `/setup` bootstrappar
första admin (inert när tabellen har ≥1 rad); admin bjuder in medlemmar via `/installningar/anvandare`.
**MIGRATION 013 APPLICERAD** i SQL Editor (verifierat: rls=true, policy=1, trigger=1, index=1 — den
första körningen la bara tabell+RLS, resten reconcile:ades in). **PR-ROUTINEN (CRITICAL) fixad i PR:en:**
(a) `messageForOtpError` flyttad ur `login/page.tsx` → `otp-error.ts` (page-export bröt `next build`;
tsc+testkör såg det INTE — LÄRDOM i CLAUDE.md); (b) `createInvite` skickar nu `redirectTo=<origin>/auth/callback`
så invite-länken inte dör på Site-URL-roten. Verifierat under CI-paritet: `next build` exit 0, tsc rent,
1371 tester gröna, per-task + Opus-granskning, CI grön.
**INVITE-SMOKE GRÖN 2026-07-20 (Stefan, live mot dev):** invite av andra-adress → 201, mejl fram,
länken loggade in. Smoken avslöjade UPPGRADERINGSLUCKAN: `/setup`-bootstrap föll med 500
`email_exists` för konton skapade FÖRE access-modellen (`inviteUserByEmail` vägrar befintlig mejl)
— dvs. varje uppgraderingsinstallation (inkl. PRODUKTIONEN) hade låsts ute permanent
(tom `app_users` + callback-nekning + evig 500 på `/setup`). **ADOPTIONSFIXEN (samma PR, TDD):**
`createInvite` fångar `email_exists` → slår upp befintligt auth-konto via `listUsers` (paginerad,
case-insensitiv) → skapar `app_users`-raden på befintliga id:t; returnerar `{appUser, adopted}`;
`/setup`-sidan visar "logga in via /login"-copy i stället för "kolla mejlen" när `adopted` (inget
mejl skickas vid adoption). Lagar också specens orphan-städning (återinvite i stället för
dashboard-radering). Live-verifierad mot dev-Supabase (dev-smoke-kontot adopterat som member).
DEV-NOT: Stefans admin-rad i dev seedades manuellt via service-rollen (utredningens unblock)
INNAN fixen fanns — prod behöver INTE seedas, `/setup` adopterar nu. Fräsch-reviewer (Opus):
APPROVE, 0 kritiska; cast-städ + page-2-pagineringstest åtgärdade i follow-up-commit. MEDVETEN
TRADEOFF (reviewer-fynd, ingen kod): fel-men-existerande mejl i one-shot-`/setup` adopterar
irreversibelt det kontot som admin (pre-fix: retrybar 500) — operatören har service-rollen och
kan backa raden manuellt. Sedan: merga PR #95.
**⚠️ REVOKERING (Opus-slutgranskning):**
medlemskap enforce:as bara vid login-kanten (`/auth/callback`), INTE per request — middlewaren
re-kollar inte `app_users`. Att ta bort en användare = **radera `auth.users`-raden** (kaskaderar
`app_users` + invaliderar sessionen), INTE bara `app_users`-raden (den lämnar sessionen levande).
V1-BACKLOG (medvetet utanför): (1) per-request medlemskaps-koll i `middleware.ts` så revokering
slår igenom direkt (inte bara login-kanten); (2) roll-gejta admin-UI:t — `/installningar/anvandare`
+ länken på Inställningar-landningen syns för icke-admins (API:t nekar med 403, men sidan renderar
tom; dölj via self-read-rollen); (3) återkalla/byta roll/återsända inbjudan från UI; (4) callback
saknar try/catch (fail-closed idag, men rå 500 mid-auth); (5) Supabase built-in-mejlets rate-limits
vid högre invite-volym. Nästa efter merge: **video → publicering**._

_2026-07-20 — **WORKFLOWANALYSENS FIX-KEDJA MERGAD**: säkerhet
(PR #92: zip-bomb-guard, content-type-hantering, JSON-bounds, open-redirect-guard),
buggsvep (PR #93: server-side team-cap, atomisk CV-upsert, JSON-500-guards, tidszon),
död kod-städ (PR #94, ~185 rader verifierat oanvänt). Residualer bokförda i
backloggen (zip-bomb robust bounding + markitdown-vägen, engines-fältet,
buggsvepets fyra kvarvarande)._

_2026-07-19 — **LAUNCH-POLISH LEVERERAD** (setup.sql + doctor,
BUG-A/B fixade, foreign-flaggan default PÅ; nästa: workflowanalys → video →
publicering). Tidigare samma dag: tabeller slice 6 (PR #90), onboarding-mätpasset
(PR #89), smoke 3 godkänd + kicker-enforcement (PR #88)._

_2026-07-15 — **BID-EDITOR-SLIMNINGEN LEVERERAD** (design + plan i
`notes/2026-07-15-bid-editor-slim-{design,plan}.md`): editorn för onboardade mallar visar
nu bara prosa-rutor grupperade per slide med teckenräknare; wizarden fick "fast slide"-knapp.
Visuellt verifierad mot Radrum v4-anbudet (137 → 28 synliga rutor). Vägbeslutet 2026-07-14
(env-flagga + iterera) står — se avsnittet nedan; utvärdering:
`notes/2026-07-14-budget-calibration-evaluation.md`._

## ⚖️ AVGJORT 2026-07-14: env-flagga + iterera (revert avfärdad)
Stefans idé (kalibreringsloop vid onboarding istället för binärt revert/rädda) byggdes
och utvärderades — design `notes/2026-07-14-budget-calibration-loop-design.md`, plan
`…-loop-plan.md`, utfall `…-evaluation.md`. Loopen: fyll instrumenterad mall med
deterministisk testtext → COM-mät overflow (BoundHeight + autofit-fontScale) → binärsök
budgetChars per ruta → vision-slutpass → skriv profilen (`npm run calibrate:budgets`).
Radrum v4: 6 varv, 137/137 mätta, $0. Beslutet: mergad loop + prompter (generella
förbättringar), foreign-YTAN döljs bakom env-flagga tills loop v2 stänger mätluckorna.

---

## 🔜 NÄSTA (börja här)
- [ ] **PRODUKTHÄRDNING FÖRE LANSERING (Stefans beslut 2026-08-11).** Lanseringen är
      framflyttad utan nytt datum — produkten ska vara bra nog först. Ingen deadline
      styr prioriteringen längre; ordningen är correctness → produktluckor → polish.
      **ALLA TRE CORRECTNESS-POSTERNA ÄR NU STÄNGDA:**
      ~~(1) 32k-runawayen i phases-bundlen~~ — KLAR 2026-08-12 (#107): det var trunkering,
      inte runaway; se headern. ~~(2) foreign-genereringen gejtas inte av flaggan~~ —
      KLAR 2026-08-11 (#106, fail closed). ~~(3) export-flippen muterar DB på GET~~ —
      KLAR 2026-08-11 (#105, POST i båda exportrouterna).
      ~~Markdown-escaping av AI-fritext~~ — KLAR 2026-08-11 (#104).
      ~~NÄSTA STEG ÄR DÄRMED STEFANS KLICK-SMOKE i dev på kärnflödet~~ — **GENOMFÖRD
      2026-08-12:** kärnflödet grönt end-to-end (analys → go/no-go → generering →
      MD-export). Fynden bokförda i live-backloggen ("SMOKE-FYND 2026-08-12");
      apply-swap-knappen byggdes direkt ur smoken (denna PR). Öppna poster som INTE är
      correctness ligger kvar i live-backloggen (watchdog-samspel, status-reconcile,
      routine-follow-ups från #96/#97, onboarding-mätpassets v1-lucka).
- [ ] **PUBLICERING — FRAMFLYTTAD 2026-08-11, INGET NYTT DATUM.** Ursprungsplanen
      (tisdag 2026-08-11, LinkedIn ~07:45 svensk B2B-morgon, X ~14:30 US-östkustens
      morgon) står kvar som mall för tidpunkterna när datumet sätts om.
      **VIDEON ÄR KLAR OCH GODKÄND (v8.1, 82,5 s — omfilmad 2026-08-16/17 mot nya UI:t,
      nedsaktad efter Stefans pacing-feedback):**
      `bidsmith-video/tmp/videocut/bidsmith-launch-draft.mp4` (musik: Pixabay
      "Corporate Ambient Piano"/Rockot, fri kommersiell licens) + `bidsmith-15s.gif`
      (X, 3,2 MB) + full-GIF; allt arkiverat i `bidsmith-brand/launch-arkiv/v8-2026-08-17/`
      (rigg + råscener + stills). Innehåll: hook → upload → smideloader → krav →
      källvisar-frys (10/10 mekaniskt belagda) → matchning + frys → go/no-go-SIDAN + frys
      (68 %-bedömningen; overlay-copyn säger "Uppskattad vinstchans — och motiveringen i
      klartext", INTE spann-copyn — v8-bedömningen föreslog inget teambyte, copyn måste
      vara sann mot bilden) → smide (kapitelspinnrar + ForgeLoader) → nya editorn →
      MD-scroll → NY BEAT: rail-flikarna Pågående→Arkiv (3 seedade utfall, win-rate-fot)
      → radar (riktig TED-data) → endcard. Tagningslärdomar i rigg-kommentarerna
      (record-video.mjs): --from-parsningen utan flagga gav NaN och hoppade väntblocket;
      demo-FFU:ns anbudsdag måste ligga i framtiden (lokalt bumpad i bidsmith-video).
      KVAR FÖR STEFAN: justera [JUSTERA] i `notes/2026-08-02-launch-posts.md`, sätt
      datum, posta (repo-länk i första kommentaren på LinkedIn). OBS: demo-Supabasen
      pingades 2026-08-16 via inspelningen — pausar igen efter ~7 d inaktivitet; sätts
      datumet längre fram, arma om keep-alive-rutinen (claude.ai/code/routines) till
      söndagen före.
- [x] **STEFANS SMOKE (KLAR 2026-07-07):** onboarding grön (137 bekräftade/84 pending
      av 221), generering 137/137 mekaniskt grön — men **slutprodukten katastrofal**:
      45 789 tecken prosa över 11 slides, 0 budgetChars satta, nio dubblett-"Om oss" på
      en slide, prosa i metadata-fält, preview ogranskbar (137 platta sektioner).
      OBS: varv 5 hade SAMMA volym (46 126 t) — "helgrönt" gällde mekaniken, inte det
      visuella. Mätning + rotorsaker: TILLÄGG 3 i verifieringsdokumentet.
- [x] **LÄNGDSTYRNING för foreign-generering — LEVERERAD 2026-07-14 som
      BUDGET-KALIBRERINGSLOOPEN** (feat/budget-calibration-loop): (1) budgetChars sätts
      nu EMPIRISKT per ruta (COM-mätning + binärsökning, inte bara geometri-matte) via
      `npm run calibrate:budgets -- <templateId> [--write]`; (2) kortfältsregeln
      (budget ≤80 ⇒ VÄRDE eller tomt, aldrig ursäktsprosa; tomt re-askas aldrig);
      (3) syskon-arbetsdelning i generic-prose-prompten. Utvärderat mot Radrum v4:
      45,8k→12,7k tecken, 42→1 dubblettpar. (4) bid-preview-gruppering ersatt av
      EDITOR-SLIMNINGS-spåret nedan. Kvar = loop v2 (mätluckorna nedan).
- [x] **ENV-FLAGGA för foreign-vägen — LEVERERAD 2026-07-14 (PR #80):**
      `BIDSMITH_FOREIGN_TEMPLATES=on` krävs för foreign-uppladdning/wizard/API
      (default AV, fail closed); onboardade mallar renderar oförändrat.
      SUPERSEDED 2026-07-19 (launch-polish): default PÅ, `=off` stänger —
      aktiveringsgrinden bär säkerheten. Historisk OBS (inaktuell):
      sätt flaggan i Vercel-env om foreign-vägen ska vara på i driften, och
      `=on` i dev-worktrees `.env.local`.
- [x] **KALIBRERINGSLOOP v2 + DECK-SCANNERN — LEVERERADE 2026-07-14** (design
      `notes/2026-07-14-measure-core-design.md`, facit `…-deck-scan-facit.md`):
      gemensam mätkärna `src/lib/pptx-template/measure/` (7 checkar, com/xml-märkta) +
      `npm run deck:scan -- <anbud.pptx> [--json]` (exit 0/1/2). Mätluckorna stängda:
      text-baserad outside-slide (spAuto/slidekant), enrads-cap (64 Radrum-slots
      kapade vid om-kalibrering), horizontal-clip för no-wrap. Facit-validerad: alla
      Stefans FAIL-klass-fynd träffas; baslinjens enda FAIL = äkta malldefekt
      (Radrum slide 9, statisk text 817pt>810 — läggs på mallfix-punkten).
      Kvar (v2-begränsningar, dokumenterade i facit-noten): kickers med wordWrap
      detekteras som radbryt-WARN (per-rad-geometri = v3); single-line-break träffar
      bara spAuto; deadspace okalibrerad tills nästa riktiga generering; --profile
      budget-checkar deferred till app-spåret (kräver DB-sektioner för shape→slot).
- [x] **BID-EDITOR-SLIMNING — LEVERERAD 2026-07-15:** editorn för onboardade mallar
      visar nu endast prosa-rutor, grupperade per slide med intent-etikett +
      teckenräknare (text/budgetChars, röd vid över); kortfält (≤80) döljs helt
      (genereras/exporteras oförändrat); SlideNav ersätter sektionslistan
      (omordning/borttagning av — platshållar-bundet); okänd placeholder ⇒ synlig
      "Övriga rutor"-fallback; overflow-checklistan (inert för foreign) döljs i
      grupperad vy. Wizarden: "Markera hela sliden som fast"-knapp (bulk-skip,
      originaltext behålls) + fasta slides i sammanfattningen.
      Design: notes/2026-07-15-bid-editor-slim-design.md, plan: …-plan.md.
- [x] **STEFANS SMOKE 2 (KLAR 2026-07-15) = loop v2-utvärderingens sista steg.** Ny
      generering (anbud a400c2ca) mot om-kalibrerade Radrum v4, jämförd mot 14/7-baslinjen
      (c993fa7a) med samma grindar: FAIL 5→3, WARN 48→42, volym 12 705→11 804, dubbletter 0.
      Stefans dom: "nästan samtliga fel kvar, marginellt bättre" — BEKRÄFTAD av siffrorna.
      Kvarvarande fel i tre högar: (1) 3 outside-slide-FAIL (slide 2/4/8, botten 817–839pt)
      = MALLDEFEKT-klassen → mallfix-punkten nedan; (2) grova overflow-WARN (t.ex. 216pt
      text i 26pt-box, slide 8) = budgetar är rådgivande utan mekanisk enforcement +
      MAX-slot-mätluckan; (3) små WARN = kicker/radbryt-mätbegränsningen (v3).
      Slutsats: volymkriget vunnet (46k→12k), layoutkriget kräver enforcement + mallfix —
      → OVERFLOW-LOOP-spåret nedan.
- [x] **OVERFLOW-LOOP: HARNESS LEVERERAD 2026-07-15 (denna PR) — forskningskörningen är
      nästa steg.** `npm run overflow:eval -- --varv N`: genererar 5 frysta fixturer
      (riktiga team), COM-mäter, fitness v1-gates (0 FAIL exkl. 29 malldefekter ur tomma
      instrumenterade mallen, grov overflow >1,25×/+30pt, dubbletter ≥0,3, min-fyllnad,
      volymkorridor), varvrapport med delta + kostnad, städar eval-anbuden. Provkörning:
      0/1 PASS (3 innehållsdrivna FAIL slide 2/4/8 = loopens byte), $0,53/anbud.
      Körregler: `notes/overflow-loop-protokoll.md`; design + plan i
      `notes/2026-07-15-overflow-loop-{design,plan}.md`. Loopen körs på
      `feat/overflow-loop` efter merge — rapport till Stefan efter VARJE varv, $50-tak.
- [x] **OVERFLOW-LOOP: FORSKNINGSKÖRNING KLAR 2026-07-16 (varv 1–4, $12 av $50,
      PR #86 mergad efter Stefans visuella dom + routine APPROVE).** Två rattar
      bevisade: enstyckes-regeln (generic-prose; monstret {Läsanvisning 2} släckt,
      dupes 7→1) + prosa-budgetfaktor 0,85 (budget-rules; grova 84→60, faktorgolv
      0,85 — variansen nuddar redan min-fill underifrån). 0/5 PASS: kvarvarande
      FAIL-mängd är 100 % chip-klass. Slutrapport:
      `notes/2026-07-16-overflow-loop-slutrapport.md`.
- [x] **BESLUT A+B GENOMFÖRDA 2026-07-16 (PR #87, routine COMMENT→fyndet fixat):
      FAIL 9→0 i ALLA anbud.** A: roundBudget ersätter 30-golven i buildSlotResult;
      Radrum v4 omkalibrerad (6 varv, 137/137, --write): 85→22 slots på 30-värdet,
      riskchipsen 30→5, budgetsumma 12 640→11 460. B: collectFill undantar
      meningsinitial "lämnas tom(t)"-intent (negations-säkrad regex efter
      routine-fyndet). Varv 5-verifiering: grova 60→20, min-fill 0/5, korridoren
      höll. $14,61 av $50. Addendum i notes/2026-07-16-overflow-loop-slutrapport.md.
- [x] **SMOKE 3 GODKÄND 2026-07-19 (Stefans dom):** ny skarp generering (anbud
      f5faeb4c, samma flöde som smoke 2: analys 930bc471 + samma team, 137/137
      sektioner, 108 s, $0,51) mot omkalibrerade Radrum v4. Grindarna:
      **FAIL 3→0**, WARN 42→23, volym 11 804→10 474 (korridoren höll), parvisa
      dubbletter 1 par (0,31, gränsfall). 5 grova enligt eval-definitionen, ALLA
      i kända klasser: 3 malldefekter (slide 1 bolagsnamnsbox, slide 2 Text 36
      companyName, slide 4 statbox) + 2 kickers (slide 6/7, 1,88–1,96× =
      tvåraders wrap). Noll grova i prosa-klassen — #86/#87-rattarna håller i
      skarp generering. → kicker-enforcement påbörjad (nästa punkt).
- [x] **KICKER-ENFORCEMENT — LEVERERAD 2026-07-19 (denna PR): kickergrova 2→0 i
      skarp smoke.** Tre delar: (A) enrads-fakta persisteras nu i profilen
      (`SlotProfileSchema.singleLine`; kalibreringen sparade siffran men slängde
      fakta) + backfill-skript `npm run calibrate:backfill-single-line` (ren
      geometri, $0, inga budgetändringar — Radrum v4: 112 slots flaggade, 9
      enforcement-bara kickers); (B) hård EN RAD-formulering i prompten för
      enrads-prosaslots (delat predikat `isEnforceableKicker` så löfte och
      enforcement inte driftar); (C) EN batchad mekanisk shorten-våg efter F6
      mot SKALADE asken (label "generic-prose shorten", billiga rattar per
      shorten-field-precedent, kortaste-vinner, aldrig failedSections).
      Smoke 4 (anbud 32aed5e5, $0,50): alla 9 kickers under skalad ask,
      FAIL 0, WARN 23→20, grova 5→3 = enbart malldefekt-klassen kvar
      (slide 1 bolagsnamnsbox, slide 2 Text 36, slide 4 statbox), dubbletter 0,
      volym 10 265. → 5/5 PASS kräver nu ENDAST defektlista + mallfix.
- [x] **ONBOARDING-MÄTPASSET — LEVERERAT 2026-07-19 (denna PR).** Stefans
      processbeslut ("fixa inte Rådrum specifikt, fixa processen"): defektdetektion
      + kalibrering är nu en del av onboardingflödet för GODTYCKLIGA mallar.
      Design/plan: `notes/2026-07-19-onboarding-measure-{design,plan}.md`.
      Levererat: `npm run onboarding:measure -- <id> [--write]` (tomma-mallen-scan
      [generaliserad ur overflow-bootstrap, beteendebevarande] + budgetkalibrering +
      ETT atomiskt profilskriv), profilfälten `measurement`/`knownDefects` (jsonb,
      ingen migration), geometri-screen vid upload (preliminär), wizardens mätsteg +
      hälsorapport (accept per defekt), HÅRD aktiveringsgrind (`activationBlockReason`),
      `deck:scan --profile` (accepterade signaturer → INFO "känd malldefekt").
      LIVE-VERIFIERAT mot Radrum v4: 29 defekter (identiskt evalens frysta lista),
      budgetar/singleLine identiska, grind 409→200, UI-accept, scan-annotering av
      slide 1 Text 0. **ÄRLIG BEGRÄNSNING (v1):** tomma-mallen-scannen ser INTE
      (a) master-boxar vars overflow kräver innehåll (slide 2 Text 36-klassen) eller
      (b) innehållsdrivna overflows i små boxar (statbox-klassen slide 4) — 2 av 3
      kvarvarande smoke-grova är därmed oannoterbara i v1; de ägs av mallfix-punkten
      resp. en framtida innehållsmedveten detektion (v2-kandidat: scan-driven
      defekt-förslag ur genererade deck). Ersätter "Defektlist-kandidat"-punkten
      (slide 2 Text 36 dokumenterad här som master-klassens exempel).
- [x] **LAUNCH-POLISH — LEVERERAD 2026-07-19 (denna PR).** Stefans prioritering
      inför publiceringen (2, 3, 4 av lanseringsluckorna; Supabase-pausen +
      PowerPoint-kravet accepterade som de är): (2) SETUP-KOLLAPSEN —
      `supabase/setup.sql` (genererad: alla migrationer + de tre buckets via SQL;
      gamla "buckets kan inte skapas via SQL"-påståendet var fel, 005 bevisade
      motsatsen) + driftskyddstest + `npm run doctor` (preflight: env, Supabase,
      migrations-sentineller, buckets, mallfil — svensk checklista med åtgärd per
      FAIL; verifierad allt-grön mot dev + negativtest utan env) + README/SETUP
      omskrivna till klistra-en-fil-flödet; (3) BUG-A + BUG-B fixade (se
      backloggen); (4) FOREIGN-FLAGGAN DEFAULT PÅ (`=off` stänger) —
      aktiveringsgrinden bär säkerheten, vägbeslutets villkor uppfyllt av
      mätpasset. EFTER MERGE (Stefans ordning): workflowanalys (död kod +
      färsk-ögon-djupdykning + lanseringschecklista) → video (verifiera att
      #83:s max_tokens-detektering löste phases-trunkeringen → ta om scen 5–6)
      → publicering.
- [x] **TABELLER (SLICE 6, tabelldelen) — LEVERERAD 2026-07-19 (denna PR).** Kravmatris
      i äkta `a:tbl`-tabeller i främmande mallar: introspektionen läser tabeller
      (additivt `SlideShapes.tables` — shapeIndex orörd), wizarden får tabellsteg
      (fasta kolumnroller krav/uppfyllnad/referens/status/ignorera, rubrikrader,
      mallrad), profilen bär `tableMap` (ingen migration), `isForeignProfile` ersätter
      routing-predikatet, matris-bundeln körs för foreign med mappad tabell, och en
      direktskrivande radmotor klonar mall-`a:tr` per ska-krav med FORMULAISKA svar
      (`Ja — se CV: {namn}` / `Delvis` / `Nej`; referenskolumn = konsultnamn) och
      paginerar via slide-kloning ur KUNDENS geometri (max-wrap över mappade kolumner).
      Mätgrenen ser tabellramar (HasTable). Ingen cell-tokenisering (medvetet).
      Design/plan + efterskrift: `notes/2026-07-19-foreign-table-matrix-{design,plan}.md`.
      LIVE-VERIFIERAT: fixturmall onboardad → mappad → mätt → aktiverad → genererad
      (5 krav, 41 s) → PowerPoint-öppningsbar → deck:scan 0 FAIL. Två live-rotorsaker
      fixade: OPC-orena fixtur-orphans (0x80CB8001) + verbosa referens-strängar i
      formulaiska svar (radhöjds-explosion). KVAR (v2/backlog): bullets-delen av
      slice 6, pris-/bemanningsroller, cellnivå-mätning, cell-`sz` i radestimatet,
      parallell bundle-körning, UI-varning vid flera tabeller per slide.
- [x] **GO/NO-GO-LATENS — LEVERERAD 2026-07-15 (ärligt utfall: måttlig latensvinst,
      värdet är härdningen):** index-refererade ska-krav (server-hydrering, publikt
      format orört, live-verifierad mot RetailTech: hydreringen håller med riktig
      modell-output), krav+citat ur JSON-dumpen + kompakt serialisering,
      max_tokens-detektering i ai-client (höjning <16 384, annars EN re-roll på samma
      storlek — bevarar 32k-bundlarnas motståndskraft; branch-ärliga fel). UPPMÄTT:
      36→25 s, input 8 262→7 780, output 1 285→1 238. Promptvikten sitter i TEAM-texten
      (5k tecken belagda claims — beslutsrelevant, bantas ej) + systemprompt; vidare
      latensjakt = UX-spår (streaming/progress i UI:t), inte prompt-bantning.
- [x] **RADRUM-GRÖNT-VARV (KLART 2026-07-07, varv 5):** 117/117 sektioner, 0 failade,
      150 s väggklocka, export + PowerPoint gröna. Krävde #72–#76 — hela kedjan och
      API-lärdomarna dokumenterade i verifieringsdokumentets TILLÄGG 2.
      Ursprunglig plan nedan: omtest
      mot Radrum v3 (id 9bf84030…, onboardad med prisfält skippade) — billigt, ingen ny
      klassificering behövs. Kontroll: (1) genereringen håller sig under Vercels 300 s
      (F5 — nu SLIDE_CONCURRENCY 6, ~2,5 min förväntat), (2) inga tomma slots efter
      re-ask-vågen över flera körningar (F6 — lotteriet borta), (3) export GÅR IGENOM.
      Sedan Stefans egen smoke i UI:t (upload→wizard→complete→generera→export).
- [x] **F6/F5-FIX (LEVERERAD — branch fix/empty-slot-reask):** F6 = batchat re-ask enligt
      evidence-guard-mönstret: efter första vågen samlas ALLA tomma/saknade slots (över
      alla slides) → ETT `callClaude` (`generic-prose re-ask`, dynamiskt Zod-schema över
      enbart de tomma platshållarna, prompt som kräver substantiellt innehåll per fält)
      → merge → bara slots som ÄVEN efter re-ask är tomma → failedSections. Re-ask-reject
      fäller aldrig våg 1-sektioner. F5 = SLIDE_CONCURRENCY 3→6 (effort/maxTokens orörda).
      Sviten 1008/0, tsc + eslint rena. Väntar Radrum-grönt-varv + Stefans smoke ovan.
- [x] **STICKPROV (KLART 2026-07-07):** 143/143 bedömda — 111 relevant (78 %),
      15 tveksamma, 17 ej stöd. Resultat + mönsteranalys + Stefans fullständiga export:
      `notes/2026-07-07-relevans-stickprov-resultat.md`. Dominant mönster: sammansatta
      claims där citatet bara täcker en del ("håll dig till källan, don't infer");
      4 fall ren inferens (Riskguardian-rating värst); CV-referensernas roll-etiketter
      saknar källförankring. → Föder CITAT-TÄCKNINGS-fixen nedan.

## Levererat 2026-07-06 kväll (operatörsverifiering + F1/F2-fix, denna PR)
**Operatörsverifiering mot riktig kundmall** (Radrum, 12 slides/221 kandidater — Claude
Design-genererad; rapport: `notes/2026-07-06-onboarding-operator-verification.md`):
hela kedjan upload→klassificering→wizard→complete→PowerPoint GRÖN live, men genereringen
föll — **F1:** per-slot-anrop × 169 bekräftade ≈ 8–10 min > watchdog/Vercel-tak.
**Fixat i denna PR:** `generateSectionsFromProfile` batchar per SLIDE (ETT callClaude
per slide, dynamiskt Zod-schema över slidens placeholders, delad `PROSE_VOICE` med
per-slot-varianten, SLIDE_CONCURRENCY=3) → ~12 anrop; **F2:** klassificerarprompten
skyddar etikett-rutor (static → pending-grinden). Kvarvarande residualer i backloggen.

## Levererat 2026-07-05/06 (onboarding-wizarden, PR #70)
Mall-uppladdningsspårets sista bit: tokenlösa kundmallar onboardas end-to-end.
Upload auto-detekterar (`isForeignPptx`) → async klassificering (`propose`, CAS-grindad,
`after()`-mönstret) → wizard på `/installningar/mallar/[id]/onboarding` (SVG-wireframe i
EMU-viewBox, tangentbordsnavigerbar; intent/tokennamn redigerbara; static/toc förbekräftas
ALDRIG) → complete (instrumenterad kopia `{name}/v{n}-instrumented.pptx`, original behålls;
profil + syntetiskt static-manifest + statusflip i EN update — fel lämnar 'draft', omkörbart)
→ aktiverings-grind. Utkast persisteras i `templates.onboarding_draft` (migr. 012) — avbrott
kostar inget. Byggd subagent-drivet med per-task-review + helbransch-slutreview; slutreviewens
C1 (onboardad mall kraschade genereringen via manifest=null) fixad med `buildForeignManifest`.
Spec + plan: `notes/2026-07-05-onboarding-wizard-{design,plan}.md`. Sviten 992/0.

## Levererat 2026-07-03/04 (noll-hallucinationsspåret + UX-pass)
**PIVOT (Stefan 2026-07-03):** matchningskvalitet är vallgraven; PPT-export-perfektion
nedprioriterad (kalibreras mot riktiga case senare). Kedjan komplett & mergad **#54–#68**:
varje krav/kompetens/referens bär ordagrant källcitat (schema-tvingat) → mekanisk verifiering
(`src/lib/verify-evidence.ts`, INGEN LLM-judge = inget kalibreringsproblem) → runtime-vakt
(`src/lib/evidence-guard.ts`: verifiera → ETT batchat re-citat → strippa/flagga, kastar aldrig)
i `analyzeRfp` + `extractConsultant` → persistens (migr. 009) → förlustfri redigering
(server-återverifierad round-trip) → UI (trust-receipt → källa-chip → källvisare med
täckningskarta → originalfil-länk, symmetriskt RFP/CV; migr. 010 + privat bucket `consultant-cvs`)
→ **fas C:** flaggade (obelagda) claims EXKLUDERAS ur all AI-input (`grounded-claims.ts`,
motiveringar belagda per konstruktion) → **extraktions-versions-diskriminator** (migr. 011)
stänger legacy-tvetydigheten. **Modellbyte #53:** Sonnet-roller → Sonnet 5, ny `writingGeneric`-
roll; `judge` medvetet kvar på 4-6 (kalibreringsbunden). Loopar GRÖNA: RFP 0/77, CV 0/66;
spårkostnad ~$5 av $20-taket. **UX-pass:** kostnadsvyn i tre hinkar (#60), mall-radering med
aktiv/anbud/bundlad-skydd (#65), företagsprofil → `/arbetsyta/profil` + påverkans-panel (#66),
profil-driven generering för onboardade mallar (#68, stänger #49-follow-up). Migrationer
009/010/011 + bucket `consultant-cvs` KÖRDA av operatören. Design-doc:
`notes/2026-07-03-zero-hallucination-loop.md`.

## Mall-uppladdning (godtyckliga bolagsmallar) — PARKERAD med PPTX-motorn (2026-08-03, #101)
Design-doc: `notes/2026-07-02-template-upload-architecture.md` (A+C-combo, B inkrementellt).
Beslut: kapabilitets-baserad motor, onboarding ≠ rendering, durabel mall-profil.
- [x] Slice 1 — mall-profil-schema + migration 008 (#42, merged)
- [x] Slice 2 — `manifestToProfile`: manifest → capability-klassificering (#44, merged)
- [x] Slice 3 — profil-driven renderare bakom `BIDSMITH_PROFILE_RENDER`, golden-bitparitet grön
- [x] Slice 4 — `generic-prose`-bundle + prose/field-applikator; pipeline-inkoppling levererad i slice 5b
- [x] Slice 5a — profil-persistens (`profile-store.ts`) + upload deriverar & sparar startprofil
- [x] Slice 5b — auto-klassificering (`propose-injection-plan`) + generic-prose-inkoppling (`generateSectionsFromProfile` + all-generic-routing, Sonnet 5)
- [x] Slice 5-UI — onboarding-wizard (introspektion + intervju + redigerbar profil) (#70, 2026-07-06)
- [ ] Slice 6 — **PARKERAD 2026-08-04 med PPTX-motorn** — B inkrementellt: bullets, sedan godtyckliga table-rows. OBS: text i
      tabeller (`a:tbl`/graphicFrame) deltar INTE i onboardingen idag (inte kandidat, inte
      i wireframe, kan inte instrumenteras) — kravmatris-liknande slides blir statiska
      tills detta byggs (dokumenterad begränsning i #70)

## Öppna PR:er (väntar review)
_Inga — #54–#68 mergade 2026-07-03/04._

## Backlog — LIVE efter MD-pivoten (verifiera mot kod före start)

_Triage 2026-08-04: PPTX-bundna poster flyttade till "Parkerat med PPTX-motorn" nedan,
verifierat inaktuella till "Struket". Kvar här = MD-vägen + kärnan (generering,
extraktion, säkerhet, drift). Klara [x]-poster behållna för spårbarhet._

- **ULTRACODE-SLUTAUDIT 2026-08-17** (14 agenter: 4 lenser → 33 råfynd → topp 10
  adversariellt prövade → 9 bekräftade/1 motbevisat; full data i sessionens
  workflow-journal). CORRECTNESS-FÖRE-LANSERING (4): auth-trion fixad i PR A (se
  headern); **PR B KVAR: run-bid-generation.ts slutflip generating→draft läser aldrig
  `{ error }`** (supabase-js kastar inte — tyst fail ⇒ watchdogen dömer "tog för
  lång tid" ⇒ användaren betalar om genereringen; verifierat ner i postgrest-js
  `shouldThrowOnError=false`). POLISH-EFTER (5, bekräftade): **PR C-svepet** —
  requireUser på bids/[id] PATCH + outcome-PATCH + go-no-go/[id] PATCH +
  radar/opportunities/[id] PATCH (alla stoppas idag av middleware-307 + RLS +
  stängt-failande anon-klient; svepet ger JSON-401 + uniformitet) samt de fem
  getUserId-routerna (analyze, matches/[id], bids POST, consultants/upload,
  radar-analyze — 500 i st.f. 401 idag) + stryk "Middleware guarantees
  authentication"-kommentarerna (matches/[id]:20, radar-analyze:17); **död kod**:
  evidence-context kontextfönster-resterna (~62 rader: locateEvidenceContext/
  locateEvidenceSpan/EvidenceContext/DEFAULT_WINDOW/snapBefore/snapAfter/clean +
  testblock — locateAllSpans-kedjan LEVER), slot-meta grupperingen
  (groupSectionsBySlide/SlideGroup/GroupedSections + testblock; buildSlotMeta/
  SlotMeta LEVER via overflow-eval; header-kommentaren stale). MOTBEVISAT:
  structure_eval-kolumnen är dokumenterat MD-first-beslut (spec 2026-08-03), inte
  död kod — endast stale kommentarer kvar (bid-structure.ts:144, setup.sql:132).
  OVERIFIERADE KANDIDATER (22 st under topp-10-snittet; kör verify-runda före
  åtgärd) — fyra medel-correctness värda först: generations-CAS i runnern
  (interfolierade genereringar), outcome-PATCH nullar berikningsfält utan
  statusvakt, sections-PATCH ersätter array utan versionsvakt (cross-tab),
  radar-analyzens länk-uppdatering okontrollerad (dubbelbetald analys); resten
  låg (CRON_SECRET-timing, chunked upload-buffring, råa felmeddelanden i 500,
  team_evaluation-kolumnen, style_guide-kommentaren, fetched_at/scored_at,
  3 filstorleks-utbrytningar, requireAdmin-duplicering, sorteringsduplicering
  pipeline.ts, expected-chapters eval-import, OutcomeSheet unmount-fältet,
  Number("")-vakten i team-tabellen, analyslistans UTC-"idag").
- **SMOKE-FYND 2026-08-12 (Stefans klick-smoke, polish/produkt):** ~~(1) go/no-go-copyn
  blandar engelska ("should-krav 2") — etikettpass på hydrering/prompt önskas;~~
  ÅTGÄRDAD (2026-08-14, copy-svepet): svenska etiketter i kravlistan + felsträngs-svep,
  se headern;
  ~~(2) genererings-väntan: användaren står kvar på go/no-go-sidan med enbart knapptext i
  ~2 min — kandidat: navigera till editorn direkt på 202 så GeneratingChapterList/
  ForgeLoader bär väntan (Stefan lutar åt ja, beslutas separat, rör #103-testat flöde);~~
  LEVERERAD (denna PR): "Generera anbud" navigerar direkt till editorn på 202;
  GeneratingChapterList/ForgeLoader bär väntan. ~~(3)
  export-frysningen ifrågasatt ("kanske lite onödigt nu när jag tänker på det") — hänger
  ihop med utfallsspårningen (exporten ÄR inlämningssignalen), kräver äkta produktbeslut;~~
  AVGJORD + LEVERERAD (2026-08-14): export = ren nedladdning, explicit
  "Markera som inlämnad" äger flippen — se headern.
  ~~(4) pedagogiken "varför föreslås byten när jag valde bäst matchade?" — individmatchning
  vs teamkomposition behöver förklaras i UI-copy;~~ LEVERERAD (2026-08-14):
  info-tooltip vid förslagsrubriken + impact-SPANN i stället för punktestimat, se headern.
  (Kvarglömt konfliktmärke från 50ce9f1 upplöst här 2026-08-17 — båda grenarnas
  leveranser var äkta och är sammanförda.)
  (5) editor-UI:t ska designas om
  (Stefan styr, eget synkront pass); UX-POLISH LEVERERAD (denna PR, 2026-08-13, ur
  Stefans smoke på #110): scroll-till-smiden vid apply (korten ligger under folden —
  klick gav ingen synlig feedback), kontextuell poolGap-etikett ("Kvarstående gap
  (täcks inte av förslagen ovan)" när förslag finns; "Poolen räcker inte" annars),
  estimatet nedtonat till "~+N % (AI-estimat)" (överlovnings-mönstret belagt 3 av 3:
  +15→+6, +10→±0, +20→+7 — kalibrering hör till eval-spåret). ROUTINE-FOLLOW-UPS
  (#112, egen PR): ~~kontrastsvep över AI-estimat-suffixen (rad 72:s opacity-60) +
  probabilityColor-kombinationerna~~ ÅTGÄRDAD (2026-08-14, copy-svepet): text-xs i
  stället för opacity; probabilityColor-paren uppmätta, alla PASS AA — se headern;
  KVAR: komponenttest för GoNoGoResultView:s etikettgren + undo-kort (första
  komponenttestet landade i #117);
  (6) GO/NO-GO-VARIANSEN BELAGD i apply-swap-smoken:
  samma team + samma analys gav 48 % resp. 38 % i två körningar (±10 p brus, dränker
  bytets effekt — "+10%" gav ±0, "+15%" gav +6); jämförelsepanelens Δ = byteseffekt +
  brus. Hör till eval-/kalibreringsspåret (pausat till trevägs-evalen), inte UI:t.
  CIRKELBYTET BELAGT LIVE i samma smoke: direkt efter Sara→Aram (±0) föreslog nya
  bedömningen "byt tillbaka Aram→Sara +7%" — den dokumenterade 2026-04-30-begränsningen,
  nu klickbar (ping-pong à 30 s + AI-kostnad på brusnivå-skillnader);
  ~~(7) extraktions-icke-determinismen BITER I PRAKTIKEN: samma RFP omanalyserad gav
  annan ska-/bör-klassning (facklig samverkan blev ska-krav ⇒ mekanisk 0 %) + en
  krav-DUBBLETT i listan — dedupe-kandidat i extraktionens post-processing.~~
  ÅTGÄRDAD (denna PR): klassningsförankring + dedupe, se headern.
- **APPLY-SWAP: deferred minors ur PR:ens granskningskedja** (final review pekas hit):
  ApplySwapSchema saknar sektions-headerkommentar i api-schemas.ts; "Analysis not
  found"/"No match found" på engelska i apply-swap- OCH go-no-go-routerna (samma
  strängar); apply-swaps 500-grenar (delete-/select-fel) utan dedikerade tester;
  flow-state-testtiteln säger "limit 1" trots assessments limit 2; isRefreshing kan
  teoretiskt fastna om RSC-refetchen aldrig löser (inherent i useTransition-mönstret,
  accepterat); oanvändbar fallback "föreslaget byte" i swapText (knappen renderas bara
  när swap.remove/add finns). PR-ROUTINENS FOLLOW-UP (#109, APPROVE): CAS:en skyddar
  mot stale vy men inte mot två samtidiga swaps från samma färska vy — dubbel
  AI-kostnad, koherent slutläge; åtgärdas (insert villkorad på att assessmentId ännu
  är senaste raden, t.ex. RPC) först om det observeras i praktiken.
- **generic-prose kör `high`/32000 på Sonnet 5 (routine-follow-up på #107, polish):**
  runtime-vakten gejtar bara `max`/`xhigh`, vilket är rätt mot Anthropics dokumenterade
  golv — men samma mekanism (tänkandet delar taket med svaret) gäller i mildare form
  även på `high`. Ligger på foreign-/profilvägen, som är parkerad med PPTX-motorn, så
  posten väcks när den ytan aktiveras igen: höj taket där eller utvidga golvtanken.
- **PHASES-RUNAWAY (CORRECTNESS, kärnlogik — ta SYNKRONT med Stefan):** phases-bundlen
  (Opus `writing`, `effort: "max"`, `maxTokens: 32000`) skenade till EXAKT 32k-output-taket
  i 3 av 4 skarpa genereringar 2026-08-02 (272–277 s, ~$0,85/försök); i en körning skenade
  ÄVEN #83-retryn ⇒ hård trunkering, phases fällde hela genereringen. Även FRISKA anrop
  läcker risk-artefakter i `shortDescription` (`','risks','placeholder'` — samma signatur
  som julibuggen). Hypoteser: (1) effort max-tänkbudgeten delar 32k-taket med outputen
  (jfr ai-client-kommentaren om thinking-härledning ur max_tokens) — resonemanget äter
  utrymmet; (2) `risks`/`hoursEstimate` är optional i schemat och med i promptens
  JSON-exempel men saknar budgetnycklar — modellen förvirras runt fältet. Följdeffekt:
  retry-kedjan kan äta 7-min-watchdogen (`STALE_GENERATING_MS`) ⇒ KOMPLETT anbud stämplas
  failed ("Generation timed out" — take 1 missade fönstret med 15 s) och UI saknar
  omkörningsknapp. Åtgärdskandidater: (a) lägre effort/eget tak för phases (OBS
  grind-policyn: ändring av writing-rollens beteende ⇒ eval), (b) städa risks ur
  schema + promptexempel, (c) watchdog-fönster vs retry-budget, (d) status-reconcile
  när sen generering fullbordas post-watchdog, (e) omkörningsknapp för fallerade
  genereringar (produktlucka sedan juli). Kostnadsnot: runaway gör phases till
  ~$1,05 av ~$1,5 per anbud. **DELVIS ÅTGÄRDAD 2026-08-02 natt (PR #99, routine
  APPROVE efter CRITICAL-klassning):** hypotes 2 bekräftad och fixad — exemplets
  fältordning matchade inte schemats emissionsordning (structured outputs följer
  schemaordningen; `z.toJSONSchema` bevarar nyckelordning) ⇒ exempel-svansen
  blödde in i sista strängfältet. Livesmoke post-fix: phases i ETT anrop
  (9 081 tokens/98 s), rena shortDescriptions, och `risks`/`hoursEstimate`
  materialiseras nu (var alltid tomma pre-fix ⇒ {Risker}-boxen får innehåll).
  **HYPOTES 1 BELAGD + ÅTGÄRDAD 2026-08-11 (denna PR) — och den var aldrig en
  runaway.** Anthropics migrationsguide för Opus 4.7/4.8 har en BLOCKS-punkt:
  vid `effort: "max"`/`"xhigh"` ska `max_tokens` vara ≥ 64000, eftersom taket är
  ett hårt tak på TÄNKANDE + svarstext tillsammans. phases körde `max` med 32000
  ⇒ tänkandet åt utrymmet och svaret klipptes. "Skenade till EXAKT 32k" var
  ledtråden: ett skenande anrop stannar inte på ett jämnt tal, ett avklippt gör
  det. Två bundles till bröt mot samma regel utan att ha fällt en generering:
  `understanding` (max/32000) och `quality` (max/16000 — värst ställd).
  Följdfyndet förklarar varför #83-retryn inte räddade den: `MAX_TOKENS_RETRY_CAP`
  var en modelloberoende gissning på 16384, så bundlarna låg redan över
  retry-taket och kördes om på SAMMA tak — och trunkerade likadant.
  LEVERERAT (Stefans val: effort ner OCH tak upp): alla tre bundles `max` → `high`
  med tak 64000; **kapabilitetsregister `MODEL_LIMITS` i `models.ts`** (output-tak
  + golv för hög effort per modell, med `claude-opus-5` förberedd) så ett
  modellbyte förblir en enradsändring i stället för en granskning av varje
  hårdkodat tokentak; **runtime-vakt i `callClaude`** som vägrar hög effort under
  modellens golv innan anropet går iväg (samma mönster som temperature-vakten) —
  buggklassen kan därmed inte återinföras; retry-taket kommer nu ur registret i
  stället för gissningen (okänd modell faller tillbaka på 16384).
  **GRINDEN: EVAL FRÅNGÅNGEN, LIVE-SMOKE I STÄLLET (Stefans beslut 2026-08-12).**
  Effort-ändringen rör `writing`-rollens beteende och krävde enligt policyn en eval,
  men Stefan pausade alla evals tills produkten är färdig; alternativet var att låta
  trunkeringen stå kvar under hela härdningen. Ersättningsgrinden kördes i stället:
  4 bid-generator-fixturer × 1 rep genom `generateAllSections`, mätt med produktens
  egen `ai_call_logs` — 24 anrop, **0 fel, 4/4 utan trunkering**, $1,32 totalt
  ($0,33/anbud mot ~$1,5), 6 min 35 s för alla fyra. phases: 1 262–1 658 output-tokens
  mot taket 64 000 och 24,4–25,6 s mot baslinjens 272–277 s; `shortDescription` rena,
  `risks`/`hoursEstimate` materialiserade. Kvar omätt: anbudsTEXTENS kvalitet vid
  `high` vs `max` — den frågan ställs aldrig av Stefans planerade trevägs (Opus 5@high,
  Opus 5@xhigh, Sonnet 5 mot befintlig output), så den är medvetet obesvarad.
  KVAR av posten: watchdog-samspelet och status-reconcile (latensvinsten från
  `high` mildrar men löser inte); Opus 5-bytet är nu en radändring men eget
  beslut med egen eval — buntas medvetet INTE ihop med effort-ändringen, då
  mäter evalen två saker samtidigt.
  ~~omkörningsknapp~~ — KLAR 2026-08-05 (flow-navigation-PR:en): go/no-go-sidans
  "Generera om" ersätter utkastet på samma rad; stale generating (>7 min) räknas
  som död och ersätts i stället för att 409:a (delad regel i `lib/bid-status.ts`
  som GET-vakthunden också använder — watchdog-samspelet därmed delvis mildrat).
- [x] **NAVIGERING I KÄRNFLÖDET — LEVERERAD 2026-08-05 (denna PR,
  feat/flow-navigation):** stegnav Analys & team → Go/No-Go (egen sida) → Anbud
  på alla tre sidorna, server-rehydrerad ur `lib/flow-state.ts` (sidladdning
  tappar inget längre); EN ANALYS = ETT ANBUD (POST /api/bids ersätter utkast
  på samma rad; CAS på status+created_at stänger dubbelgenererings-race; 409
  vid pågående/fryst); hård reset via POST /api/analyses/[id]/unlock-team
  (bekräftelsedialoger, FK-ordnad radering, retry-läkbar partial failure);
  delad stale-generating-regel i `lib/bid-status.ts` (GET-vakthund + POST +
  unlock — död generering blockerar aldrig flödet); editorhöjden flex-baserad
  + kalibrerad mot verkliga 61px-naven (gammal 4px-overflow borta). Full
  UI-livesmoke (playwright, 31/32→höjdfix→grönt): rehydrering efter reload,
  båda dialogerna, hård reset, omkörning (nytt 11-kapitelsanbud på RFP 1),
  fryst läge. 8 tasks subagent-drivet med per-task-review (10 Important-fynd
  fixade under vägen). Plan: docs/superpowers/plans/2026-08-04-flow-navigation.md.
  Ursprunglig postbeskrivning nedan för historik._
  _(UX-lucka, Stefans fynd
  2026-08-04):** flödet är enkelriktat och tappas vid sidladdning — teamlås +
  go/no-go-resultat är enbart klient-state (`analysis-match-section.tsx`: useState,
  rehydreras aldrig ur DB), analysvyn länkar ALDRIG till existerande anbud (enda
  vägarna till editorn: redirect efter lyckad generering, "Öppna utkastet ändå" för
  partiella, Pipens SubmittedRow — bara inlämnade), så vägen tillbaka blir "generera
  nytt anbud" = nytt bid + ny API-kostnad. STEFANS SKISS (riktning — brainstorm/spec
  före bygge): navigationsrad överst med stegen Analys/Team → Go/No-Go (egen sida,
  teamkorten överst) → Bid editor; ej genomförda steg utgråade/oklickbara;
  fram-och-tillbaka-navigering mellan genomförda. Relaterat: "Ändra team skapar
  nytt anbud"-posten. BESLUTAT 2026-08-04 (samma kväll): tas FÖRE lanseringen.
  Design godkänd i brainstorm (en analys = ETT anbud; utkast ersätts/exporterade
  fryses; hård reset vid upplåsning med bekräftelsedialog; stegnav + egen
  go/no-go-sida) — spec: `docs/superpowers/specs/2026-08-04-flow-navigation-design.md`.
  Stänger även "Ändra team"- och omkörningsknapp-posterna när den landar.)_
- **Foreign-generering gejtas INTE av flaggan (fynd 2026-08-04, "195 kapitel"-
  mysteriet):** `BIDSMITH_FOREIGN_TEMPLATES` gejtar bara onboarding-ytorna +
  ny-uppladdning; POST /api/bids tar aktiva mallen och `run-bid-generation.ts:80`
  routar enbart på `isForeignProfile(sparad profil)` — en AKTIV foreign-mall
  genererar profilvägen (195 generic-prose-sektioner, ~$0,5+/anbud) fast flaggan
  är av, och editorn visar dem som platt 195-kapitelslista. Belagt i dev:
  blankettmallen (9e3e084a, mallsmoke 2) stod som aktiv mall → Stefans färska
  anbud f5c49d28 fick 195 kapitel. Symptomet åtgärdat (aktiv mall åter
  anbudsmall-v2 via workspace_settings).
  **BESLUTAT + LEVERERAT 2026-08-11 (denna PR) — Stefans val: fail closed + väg ut.**
  POST /api/bids laddar den sparade profilen för den aktiva mallen och vägrar med
  403 när `isForeignProfile(profil) && !foreignTemplatesEnabled()` — grinden ligger
  FÖRE varje skrivning (inget anbud skapas/ersätts, ingen `after()`-körning köas)
  och använder SAMMA predikat som routern i `run-bid-generation.ts`, så grind och
  routing inte kan glida isär. Vägen ut står i felmeddelandet, som klienten
  (`go-no-go-section.tsx`) renderar ordagrant: byt aktiv mall under Inställningar →
  Anbudsmallar, eller sätt `BIDSMITH_FOREIGN_TEMPLATES=on`. Alternativet "bara
  UI-varning" valdes bort (kan klickas förbi ⇒ kostnaden kan fortfarande brännas).
  MEDVETEN KONSEKVENS: den som onboardade en mall medan flaggan var default PÅ
  (19/7–3/8) blir stoppad tills hen byter mall eller sätter flaggan — accepterat
  pris för att en avstängd yta inte ska kunna spendera pengar.
  Kostnad: en extra profil-select per generering (försumbar mot 2–5 min generering).
  PR-routinen: APPROVE, ett polish-fynd fixat i PR:en (`foreign-flag.ts`-docstringen
  påstod fortfarande att generering aldrig gejtas — osant efter denna ändring).
  Routinens follow-up-förslag (egen PR, ej öppnad): skicka `storedProfile` som
  argument in i `runBidGeneration` i stället för att den laddar om profilen —
  tar bort dubbel-selecten och stänger TOCTOU-glipan där grind och router läser
  varsin snapshot.
- **Flow-navigation follow-ups (slutgranskningen 2026-08-05 — polish om inget
  annat anges):** (1) extrahera `flowNavProps(flow)`-helper (bidId/bidFailed
  dupliceras mellan analys-/go-no-go-sidan; editorn utelämnar hasFailures —
  aligna vid samma tillfälle); (2) FlowNav a11y: disabled-stegs tooltip ej
  tangentbordsnåbar; (3) CAS-409-copyn vid exported-interleaving → neutral
  "Anbudet ändrades samtidigt — ladda om"; (4) unlock-409-copyn vid legacy
  osynlig exporterad dubblett; (5) go/no-go-sidan visar ingen pågår-status vid
  reload mitt i generering (409-backstoppad); (6) `GoNoGoResultView` död
  `assessmentId`-prop; (7) 61px-magin → låt layouten äga höjdkedjan (h-screen
  flex); (8) svensk-copy-svep över engelska felfallbacks i kärnflödet;
  (9) POST-ANBUD (post-launch, kräver dev-datastädning + migration): partiell
  unik index på `bids(analysis_id)` så en-anbuds-regeln bor i DB:n, stänger
  concurrent-create-dubbelinsert som specen medvetet accepterade;
  (10) utöka `fetchLatestTeamProposal` med id → pensionera flow-states
  inline-matches-query; (11) test-kosmetik: bid-status boundary-test,
  watchdogUpdatePayloads-dubbelbokföring.
- [x] **Export-flippen muterar DB på GET — LEVERERAD 2026-08-11 (denna PR;
  routine-förslag #101).** Båda exportrouterna (`export-md` primär, `export`
  parkerad) exporterar nu `POST` i stället för `GET`; `BidEditor.downloadMarkdown`
  skickar `method: "POST"` (klienten använde redan `fetch`, så ingen
  nedladdningsmekanik ändrades). SKÄRPT MOTIVERING sedan #103: en exporterad
  anbudsrad är FRYST (en analys = ett anbud), så en webbläsar-prefetch, en
  länkförhandsvisning eller en säkerhetsskanner som följde URL:en kunde frysa
  användarens utkast OCH räkna det som inlämnat i utfallsstatistiken — inte bara
  ett brott mot HTTP-semantiken. Nytt regressionstest asserterar att routen inte
  exporterar någon GET-handler alls. Grindar: 1428 tester, lint 0 fel, tsc rent,
  `next build` exit 0 (route-export-ändring ⇒ byggvakten obligatorisk).
  PR-ROUTINENS FYND FIXAT I PR:EN: `scripts/demo-seed.mjs:119` anropade
  PPTX-exporten med GET och hade kraschat med 405 på steg 6/6 — jag hade sökt
  call sites bara i `src/`, och seedern är demo-instansens byggare + enda
  e2e-smoken. Routinens polish-förslag också taget: den parkerade PPTX-routen fick
  en egen no-GET-assert (den saknade testfil helt, så en återinförd GET hade
  passerat tyst). LÄRDOM (ny CLAUDE.md-regel föreslagen): sök call sites i HELA
  repot — `scripts/`, `evals/`, docs — inte bara `src/`, vid ändrat API-kontrakt.
  BONUSVÄRDE som routinen belade: Supabase-cookien är SameSite=Lax, så en
  cross-site toppnivånavigering (länk i mejl) bar auth till GET-exporten — den var
  i praktiken CSRF-bar. POST utan cookie-medföljning stänger även det.
  KVARSTÅR (medvetet utanför): PPTX-routens statusflipp är fortfarande
  fire-and-forget (ingen felkontroll, till skillnad från md-routens) — den ytan är
  parkerad med motorn och orörd här.
- **UTFALLSKALIBRERING AV GO/NO-GO (produktvision, post-launch, eval-spåret):**
  i dag flödar utfallen INTE in i go/no-go — winProbability är en ren LLM-bedömning
  av underlaget (Stefans fråga 2026-08-14 belade nollkopplingen; rail-copyn som
  påstod motsatsen är rättad). Framtida koppling: enklast en prior i prompten
  ("historisk win-rate X % över N anbud"), seriösare en efterkalibrering av
  sannolikheterna mot loggade utfall. Kräver volym (14 utfall räcker inte) och
  det pausade eval-spåret — buntas med trevägs-evalen tidigast.
- [x] ~~**PIPELINE-DASHBOARDENS UI/UX-PASS (Stefans direktiv 2026-08-14)**~~ —
  LEVERERAT 2026-08-16 (se headern): arkiv + dubblettkollaps + omstyling mot
  godkänd mockup.
  DESIGNREFERENS BOKFÖRD 2026-08-16: mönstermappning från beautifului.dev
  (filter table/insight cards/records table) i
  `notes/2026-08-16-pipeline-dashboard-designreferens.md` — input till mockup-fasen.
- **Superseded-kaskad vid utfallsloggning (semantikbeslut, routine-follow-up #125):**
  railens dedupe döljer nu äldre odömda syskon (superseded — väg A, fixad i #125),
  men raderna ligger kvar odömda i DB ⇒ statistiksidans pendingCount räknar dem för
  evigt. Beslut kvar: kaskad-markera syskon vid utfallsloggning (kräver
  utfallssemantik för "superseded" — cancelled? eget värde?) eller acceptera
  historiken som den är. Berör bara legacy-data — nya dubbletter kan inte uppstå.
- **Strängsvep 2 (polish, routine-follow-up #119):** kärnflödet är helsvenskt efter
  copy-svepet, men consultants-/templates-/radar-routernas felsträngar är kvar på
  engelska ("Consultant not found", "Template not found", "No file provided" i
  upload/score/analyze m.fl.). Eget svep när ytan ändå rörs.
- [x] ~~**Export-routernas auth-mönster (polish, routine-follow-up #116)**~~ — KLAR
  2026-08-14 (exportrouter-städet): `requireUser` i båda routerna, 401-test.
- [x] ~~**Export-routernas delade readiness-guards (polish, routine-förslag #100)**~~ —
  KLAR 2026-08-14 (exportrouter-städet): `lib/bid-export-guards.ts`, egen testfil.
- [x] **Markdown-escaping av AI-fritext — LEVERERAD 2026-08-11 (denna PR).**
  Ursprungsposten (uppgraderad polish → FÖRE LANSERING, Stefan 2026-08-04;
  routine-förslag #100): rader i AI-text som börjar med `#`, `*`, `` ` `` blir
  oavsiktlig struktur i md-exporten. Skälet för uppgraderingen står: MD är den
  formella leveransen och MD-preamblen (#102) pekar uttryckligen nedströms-AI på
  dokumentstrukturen — oavsiktlig struktur är ett correctness-fel i slutprodukten.
  LEVERERAT: `text()` i `bid-markdown.ts` escapar radvis de blocköppnare som
  KOLLIDERAR med dokumentets egen semantik — ATX-rubriker (`#`–`######`, falskt
  kapitel), thematic breaks + setext-understrykningar (`---`/`***`/`___`/`===`,
  falsk kapitelgräns — `---` är vår egen avgränsare), och kodfence
  (```` ``` ````/`~~~`, sväljer resten av exporten). Applicerat på varje
  fritextvärde + alla bullet-items; `cell()` plattar dessutom nyrader till
  mellanslag (fritext med radbrytning bröt tabellraden — samma felklass, hittad
  under bygget). **MEDVETET INTE ESCAPADE — avsteg från postens `*`:**
  listmarkörer, inline-emfas och inline-backtick. Skäl för listmarkörerna är
  tekniskt, inte smak: `\- a\n\- b` mjukradbryts till EN run-on-paragraf (exakt
  felet PR-routinen fällde #100 för), medan en oescapad lista renderar som den
  uppräkning modellen menade — escaping vore alltså en regression. Inline-emfas/
  kod bär ingen strukturell betydelse här och escaping ger synliga bakstreck i
  verktyg som visar rå text. 7 nya tester (TDD, RED verifierad), varav ett
  guard-test som fäller framtida över-escaping av listor.
  PR-ROUTINENS TVÅ CORRECTNESS-FYND FIXADE I PR:EN (routinen: COMMENT, inga hårda
  blockerare — men båda var äkta): (1) setext-underline behöver bara ETT streck i
  CommonMark, så `Rubrik\n--` blev en falsk H2 — dash/equals-grenen tar nu 1+ i
  stället för 3+, och spärrade breaks (`- - -`, `* * *`) täcks samtidigt (escapeRun
  escapar bara icke-whitespace: `\ ` är ingen giltig CommonMark-escape);
  (2) nyrader i ENRADSKONTEXTER bröt rubrikrader (`### Fas 1\nEtablering`) — ny
  `inline()`-helper (text + plattning, delar plattningsregexen med `cell()`) på alla
  rubriker, coverns enradiga metadatarad och fas-metan. 5 tester till.
  Grindar efter fixarna: 1438 tester, lint 0 fel, tsc rent.
- **Ordnings-invariant-test för bundle-exempel (polish, routine-förslag #99):**
  enhetstest som parsar JSON-exemplet ur SYSTEM_PROMPT och asserterar
  nyckelordning === `Object.keys(PhasesV2Schema.shape...)`; återanvänd mönstret
  för övriga bundles med JSON-exempel i prompten.
- **CITAT-TÄCKNING i extraktionen (ur stickprovet; flyttad hit ur NÄSTA vid
  MD-triagen):** (1) extraktionsprompt: atomära claims, citatet ska täcka ALLA led,
  inkludera listpunkter när citatet slutar på kolon, specificera aldrig utöver källan;
  (2) billig mekanisk flagga för kolon-trunkerade citat; (3) CV-referensernas
  roll-etiketter härleds ur källans formulering; (4) om-mät på sample (baslinje 78 %).
  Fallen i stickprovsdokumentet är färdiga testfixturer.
- **LOOP-VALIDERING (operatör, BETALD, under $20-tak, vid behov):** om-kör
  `npm run eval:zero-halluc [-- --target=cv]` för stabil grön post-vakt + coverage mot
  goldens. Spårkostnad hittills ~$5 av $20.
- **Supabase free-tier-pausen (accepterat beslut):** dev + drift går ner efter 7 d
  inaktivitet (~5 min boot efter restore). STEFANS BESLUT 2026-07-19: accepteras som
  den är inför publiceringen (dokumenterad i SETUP.md + doctor-hinten); betald
  tier/veckoping förblir öppen option, ingen blockerare. Keep-alive-rutinen pingar
  demo-Supabase sön 9/8 inför lanseringen.
- **Routine-follow-ups #96 (polish):** (1) "Avbröts"-vägen i OutcomeSheet är en död ände
  (ingen refetch, inget formulär — raden ligger inert tills sheeten stängs), otestad;
  (2) efter Hoppa över/Spara flashar utfallsknapparna tillbaka tills refetchen landat —
  snabbt dubbelklick kan PATCH:a om utfallet; (3) fyll i BidSummary-fixturens null-fält
  i st.f. `as`-cast i OutcomeSheet.test.
- **Routine-follow-ups #97 (polish):** (1) wizardens `refresh()` sväljer icke-ok-svar
  tyst — med `BIDSMITH_FOREIGN_TEMPLATES=off` 404:ar GET-routen och de permanenta
  Hälsorapport-länkarna landar i evigt "Laddar…"; `else setUiError(...)` räcker.
  OBS 2026-08-04: flaggan är numera AV som default (MD-pivoten) — verifiera om
  Hälsorapport-länkar renderas i Inställningar-mallistan med flaggan av; i så fall är
  evigt "Laddar…" default-upplevelsen och fixen hör hemma här (annars parkera posten);
  (2) ~~BidEditor.tsx saknar helt testfil~~ — KLAR 2026-08-04 (editor-omtänket:
  BidEditor.test.tsx + expected-chapters.test.ts; navlänken den testade är borttagen).
- **Zip-bomb-skyddet robust (säkerhetsauditen + #92-granskningen, MEDIUM):**
  `assertZipWithinLimits` litar på zip-huvudets DEKLARERADE uncompressedSize —
  en förfalskad mall kan underrapportera den och ändå inflatera till GB (bevisat
  i granskningen; pako cappar inte inflationen). Robust fix = strömma uppackning
  med hård byte-gräns (annat unzip-lib, t.ex. yauzl). Auth-gatat + serverless-
  isolerat ⇒ residual = per-anrop-OOM, inte total nedsläckning. (2) SAMMA
  klass osäkrad på markitdown-vägen (`/api/analyze` + CV-upload parsar
  docx/pptx/xlsx via markitdowns interna unzip — utanför JSZip-guarden).
- **Node-krav maskinkontrollerat (PR #91-routinen):** `engines`-fält i package.json;
  `deck:scan`-scriptet använder fortfarande `--env-file-if-exists` (Node ≥22.9) —
  antingen samma script-interna env-laddning som doctor, eller höjt dokumenterat krav.
- **A11y-pass editorn/genereringen (rest av #82, polish):** GeneratingChapterList är
  div-rader i nav utan textuell state-cue (slutreview-minor 2026-08-04) + SectionNav
  aria-current i den mån den finns kvar post-#102. Wizard-delarna av #82
  (fetch-boilerplate, statusradens aria-live) flyttade till Parkerat-sektionen.
- ~~**UX: anbudsmallar går inte att RADERA**~~ — KLART: `DELETE /api/templates/[id]` + radera-knapp i TemplateSection (vägrar aktiv mall / mall som anbud refererar / bundlad mall med 409; storage-städning icke-fatal; template_profiles kaskaderar) (2026-07-04)
- [x] ~~**UX: företagsprofilen** — flytta till arbetsytan + gör PÅVERKAN begriplig~~ — FLYTTAD till `/arbetsyta/profil` (kort på arbetsyta-landningen + pekare kvar i Inställningar); ny `ProfileImpactPanel` visar var profilen injiceras (6 skrivbundlar, härlett ur `formatContext`), vad tomma fält betyder, och fyllnadsgrad per fält. Fyllnadslogik ren + enhetstestad, drift-vaktad mot `BUNDLE_LABELS`. Visuell polish itereras live med Stefan. (2026-07-04)
- Pre-fas-C-lagrade matchmotiveringar (`ScoredConsultant.reasoning` i DB) kan citera obelagda claims och flödar in i go/no-go + anbudskontext tills om-matchning — samma temporala residual, annan väg (routine #64). ANNOTERAT 2026-07-04: med `extraction_version` på konsult-raden är staleness nu DETEKTERBAR. Ingen kod behövs nu — om-matchning av en post-feature-konsult regenererar reasoning via den versions-medvetna grinden. Kvar som backlog bara om aktiv invalidering önskas.
- `consultant.summary` är overifierad friyta in i alla tre AI-inputs — nästa naturliga yta för noll-hallucinationsspåret (routine #64)
- [x] ~~Extraktions-versions-diskriminator: all-strippad post-feature-konsult (fel fil) är i datat identisk med legacy → grinden släpper igenom~~ — LEVERERAD 2026-07-04 (offline-testad, inga API-anrop): `consultants.extraction_version` (migration 011, nullable; NULL=legacy, 1=evidens-generationen). `EXTRACTION_VERSION` i `src/lib/extraction-version.ts`; `upsertConsultant` stämplar den (insert + update). `groundedConsultantClaims` + UI-grinden (`showEvidenceBadges`, `TrustReceipt`) tar valfri `extractionVersion`: non-null ⇒ grinden ALLTID på (all-strippad → noll grundade claims in i AI-input + all-amber i UI); null ⇒ union-heuristik (äkta legacy). Migration 011 KÖRD av operatören 2026-07-04. Residualen nu temporal + krympande: bara rader extraherade post-feature men FÖRE 011 förblir tvetydiga tills om-uppladdning (ingen backfill — versionen kan ej härledas i efterhand).
- [x] ~~`consultants/upload` sanerar inte filnamn (ingen storage-nyckel-yta idag, men om det ändras)~~ — AKTIVERAD + LÖST: originalfilen persisteras nu, så en storage-nyckel-yta finns; `buildCvKey` slugar filnamnet (gemener, åäö behålls, allt annat → "-", sökväg strippas) som mall-uploaden och behåller den whitelistade extensionen
- [x] ~~generic-prose kör Opus + effort max per okänd slot~~ — LÖST 2026-07-03: egen roll `writingGeneric` = Sonnet 5 ($2/$10 intro → $3/$15 efter 2026-08-31; bump-påminnelse i ai-cost.ts)
- [x] ~~**BUG-A:** leveranser hamnar i ska-krav i analysvyn~~ — FIXAD 2026-07-19
  (launch-polish): rotorsak = `.default("qualification")` gjorde `kind` utelämnbart i
  structured outputs; nu OBLIGATORISKT i modell-output (utelämnad klassning omöjlig).
  Legacy-analyser utan fältet renderas som förr — om-analys är vägen.
- [x] ~~**BUG-B:** analyserad RFP syns inte i dashboarden~~ — FIXAD 2026-07-19
  (launch-polish): deadline-lösa analyser ingår nu i Pipen (sorteras sist,
  "deadline saknas"), och railen har permanent "Alla analyser →"-länk till
  /arbetsyta/analyser (passerade deadlines ägs fortsatt av den listan).
- [x] ~~"Ändra team" skapar nytt anbud (POST /api/bids) i st.f. att regenerera~~ —
  KLAR 2026-08-05 (flow-navigation-PR:en): en analys äger ETT anbud; POST ersätter
  utkast på samma rad, exporterade fryses; "Ändra team" går via go/no-go-sidans
  hårda reset.
- T15 manuell smoke + runtime hallucination/coverage-kalibrering (kräver riktig RFP-data / Ekan-adoption)
- [x] ~~Flagg-vägen i `loader.ts` deriverar profilen ur manifestet per render i st.f. `loadTemplateProfile`~~ — LÖST: flagg-vägen laddar nu den persisterade profilen (fallback till manifest-härledd för bundlade mallen utan rad) (routine-follow-up #49)
- [x] **Manuell PowerPoint-smoke:** GENOMFÖRD 2026-07-03 — riktig anbudsmall-v2 instrumenterad, öppnad i PowerPoint via COM utan reparation, slide exporterad + visuellt verifierad (token med ärvd formatering). instrumentTemplate är verifierad mot syntetisk mini-pptx; xmldoms serialisering (ns-redeklarationer, attributordning) är obeprövad mot riktiga kundmallar + att PowerPoint faktiskt öppnar den instrumenterade kopian (routine-follow-up #51)
- Grind-policyns "smoke" som körbar grej: `skipIf(!process.env.ANTHROPIC_API_KEY)`-gated test som gör ETT riktigt API-anrop per roll i models.ts — exakt gapet som släppte igenom temperature-blockeraren på #53 (routine-follow-up)
- **Ny blindfacit-validering (förutsättning för judge-byte till Sonnet 5):** ska vara PLANERAD denna gång (Stefan 2026-07-03) — generera ENBART sektioner som faktiskt AI-genereras i produktion; fas 1-rundan inkluderade sektioner som numera är deterministiska (referenser, certifieringar, cover) och judgade därmed delvis text som aldrig shippas

## Parkerat med PPTX-motorn (triage 2026-08-04)

> PPTX-motorn är parkerad bakom `BIDSMITH_FOREIGN_TEMPLATES` (default AV, fail closed)
> sedan MD-first-pivoten (#101); radering av motorn är ett post-launch-beslut med
> användardata. Posterna nedan är bundna till motorn (foreign-generering,
> kalibrering/mätning, deck-gates, onboarding-wizarden, mallfixar) och väcks ENDAST
> om det beslutet väcker motorn. Ingen av dem blockerar MD-vägen eller lanseringen.
> Texterna flyttade oförändrade ur backloggen/NÄSTA — verifiera mot kod före
> återupptagande.

- **Skip-generation för intent-tomma slots (routine-förslag PR #87, polish):**
  generationssidan motarbetar fortfarande "lämnas tom"-slots — re-asken kräver
  "lämna inte tomt" och bränner ett betalt anrop. Flytta EMPTY_SANCTIONED_INTENT
  till delad modul + hoppa över sloten i wave-1 och re-ask.
- **Radrum-mallfixar (VÅR testmall — håll isär från loop-fixar):** bredda
  bolagsnamnsboxen (slide 1), flytta upp boxarna (slide 2/3/9), statboxarna slide 4,
  högerspalten slide 8; byt M365-cloudfonter → installerade (klick-i-textbox ändrar
  font/storlek = autofit-omräkning med substitutfont, se evaluation-noten).
- **deck:dupes-trösklarna för höga för LLM-parafras:** katastrofdecket passerade
  0,5/0,7-gaten (parafras ≈ 0,3–0,45 trigram). Kalibrera mot fler riktiga deck innan
  gaten får beslutsvikt; parvis mätning vid 0,3 är tills vidare jämföraren.
- **Slice 6-resterna (tabelldelen #90, v2/backlog):** bullets-delen, pris-/
  bemanningsroller, cellnivå-mätning, cell-`sz` i radestimatet, parallell
  bundle-körning, UI-varning vid flera tabeller per slide.
- **Mätpassets follow-ups (PR #89-routinen, polish):** (1) bära uppmätt detail in i
  FAIL-defekternas suggestion — kräver medvetet beslut om eval-JSON:ens frysning
  (EmptyScanDefect serialiseras rakt av i bootstrap); (2) validera `precount`-payloaden
  med Zod som `screen` nu valideras; (3) annoteringsräknaren i scan-deck bör komma ur
  annotateKnownDefects i stället för detail-strängprefixet; (4) accept utan CAS-guard
  (single-operator-risk, låg); (5) engines-rad i package.json (Node ≥22.9 för
  --env-file-if-exists); (6) OnboardingWizard.tsx 378 rader — bryt ut draft-vyn.
- **Editor-slimningens wizard-rester (PR #82):** `decideSlide`/`decide` delar
  fetch-boilerplate — gemensam `patchOnboarding` (wizarden); wizardens statusrad
  saknar aria-live.
- **Re-ask-residualer (F6, PR #72-routinen):**
  - chunka re-asken vid stora tomt-set (>30 targets -> flera batchar) sa F6-monstret skalar med bredare mallar
  - stickprovsrutinen bor marka re-ask-fyllda sektioner i underlaget (hallucinationsrisken koncentrerad dit)
  - F5-marginalen ar tunn (~240-290 s berknat) — logga vaggklockan i Radrum-varven; >270 s -> parallellisera re-asken eller hoj concurrency till 8
- **Per-slide-genereringens residualer (F1-fixen, granskningsnoterade):**
  - trunkering (maxTokens-taket) fäller HELA slidens slots i failedSections — per-slot
    drabbades bara den överstora sloten (correctness, svansrisk på täta slides)
  - dubbel-placeholder på samma slide garderas ENBART av onboardingens kollisionssuffix —
    map-nyckeln skriver tyst över (correctness-lite, ej nåbar idag)
  - ~~missing-key-nedgraderingen i generate-from-profile är onåbar~~ — INAKTUELL NOT
    (2026-07-19-städning): efter övergången till det FASTA sections-array-schemat
    tolererar mappningen aktivt att modellen utelämnar ett element (re-ask-insamlingen);
    testas explicit i generate-from-profile.test.ts. Koden är levande, inte död.
  - ~~`buildGenericProseSection` (per-slot) produktions-orphan~~ — BORTTAGEN 2026-07-19
    (död kod-städ-PR): produktion kör batch-varianterna; per-slot-funktionen +
    GenericProseBundleSchema + systemPrompt hade noll produktionsreferenser.
- **Onboarding-verifieringens övriga fynd (2026-07-06):**
  - F3 (polish): wireframens textetiketter skalar inte med slideSize — oläsliga på mallar
    i övernormal storlek (Radrum 150 %)
  - kostnadstexten på wizard-startsidan hårdkodad "under en dollar" — skala med precount
    (221 kandidater ≈ $1–1.5, belagd avvikelse)
- **Onboarding-wizard residualer (#70, triagerade i slutreview — polish om inte annat anges):**
  - "Godkänn slidens förslag"-bulkknapp (spec §3) ej byggd + kostnadstexten hårdkodad
    "under en dollar" oavsett kandidatantal (Stefan-beslut om båda)
  - retry efter klassificeringsfel visar inte precount-siffrorna ({error} ersatte {precount})
  - PATCH är read-modify-write på hela utkastet — två flikar kan tappa varandras beslut
    (correctness-lite; OK single-user)
  - GET-pollen tyst vid icke-ok-svar (t.ex. 500 under polling) + mall raderad mid-wizard
    fryser UI:t på gammalt tillstånd
  - orphan propose-jobb (efter dubbel-force på classifying) kan klobbra nyare utkast med
    {error} — hör ihop med dokumenterad dubbel-force-residual (correctness, låg sannolikhet)
  - tom-men-parsbar pptx utan slides → foreign-vägen (precount 0/0) i st.f. 422
  - TemplateSection.tsx 423 rader (>300-gränsen, pre-existing) — bryt ut TemplatePreview
  - a11y-polish SlideWireframe: fokus- och selected-markering visuellt identiska; tom
    aria-label för placerad tom textruta
  - route-nivå-integrationstester för onboarding-endpoints saknas (logiken enhets-/kedjetestad)
  - tyst catch utan loggning när korrupt utkast fångas i draftPayload (felsökbarhet)
- Statisk TOC-sidnumrering desyncar (hårdkodad; matris-paginering + tomma referenser förskjuter riktiga nummer)
- `met`/JA-fältet vestigialt i matris-schemat (coverage = sanningskälla) — städbar
- Profil-renderarens `variant` castas `as ProseVariant` utan validering (render-from-profile.ts) — härda när slice 5/6 låter främmande mallar sätta godtyckliga variant-strängar
- Profil-schema vs renderare: `SlideProfile.capability` är optional ("a slide may mix capabilities") men `applicatorForCapability` dispatchar bara på slide-nivå och kastar på undefined — per-slot-dispatch eller skärpt schema krävs innan främmande profiler renderas (Fable-review 2026-07-03)
- generic-prose saknar budget-enforcement vid rendering — soft-cap mot `slot.budgetChars` i generic-prose-applikatorn (jfr `_soft-cap.ts`) innan främmande mallar fylls på riktigt
- budgetChars för främmande slots: förslags-lagret lämnar budget osatt — koppla compute-budgets geometri→tecken-matten till ProposedSlot innan generic-prose-fyllning av riktiga kundmallar (annars ingen längdstyrning)
- Re-onboarding av delvis instrumenterad mall: förslags-lagret inkluderar token-bärande slides som static-passthrough (försvinner inte ur rendern) men deras BEFINTLIGA tokens fylls inte — kräver profil-merge mot tidigare sparad profil (routine-follow-up #52)
- **MD-editorns foreign-visning (två kända, accepterade begränsningar 2026-08-04):**
  (1) foreign-anbud med flaggan PÅ visar 11 eviga väntande-kapitel under generering
  (expected-listan är v2-bunden); (2) befintliga foreign-anbud renderas som platt
  landed-only-kapitellista — ett blankettmalls-anbud (mallsmoke 2) blir 195 kapitel
  i dokumentvyn (`expected-chapters.ts`, extras-vägen; verifierat i dev 2026-08-04).
  Foreign är experimentell yta — åtgärdas bara om motorn väcks.

## Struket vid MD-triagen 2026-08-04 (verifierat inaktuellt)

- ~~ai-client detekterar inte `stop_reason: "max_tokens"` → alla bundles re-trunkerar
  identiskt (bredare härdning)~~ — FALSKT sedan go/no-go-latenspasset: detektering +
  EN höjnings-/omkörnings-retry finns i `src/lib/ai-client.ts` (MaxTokensError-vägen);
  2026-08-02-körningarna bevisade den live (räddade 2 av 4 genereringar).
- ~~PR-ROUTINEN triggade inte på #76 — kolla körloggen/återskapa triggern~~ —
  routinen har bevisat triggat och granskat #99, #100 och #101; ingen åtgärd kvar.

## Strategiska spår (större, senare)
- Kapacitetsgap-kartan (vilka ska-krav firman återkommande inte uppfyller)
- Anbudshistorik / feedbackloop (win-rate per köpartyp/CPV, win-loss-vy)
- Mall-importören (del av mall-uppladdning ovan)

## Levererat 2026-07-02 (dagens pass)
- #34 API-härdning · #35 matcher-tester · #36 SSRF + upload-säkerhet · #37 OOM-guard
- #38–40 kravmatris (paginering / innehållsmedveten layout / JA-NEJ-DELVIS-status)
- #41 städpack (export-guard + ai-client kostnadstak + RFP-injektions-delimiters)
- #42 mall-profil-schema · #43 bid-editor-nav · #44 manifest→profil · #45 denna ROADMAP

## Arbetsnoter / gotchas
- **PPTX-INSPEKTIONSHARNESS (obligatorisk grind, 2026-07-07):**
  `pwsh -File scripts/inspect-pptx.ps1 -Pptx <fil.pptx>` → per-slide-PNGs +
  composite-grid + teckenvolym/slide med PASS/WARN/FAIL (>1500/>3000 tecken;
  exit-kod 0/1/2). **Ska köras på VARJE genererat deck innan visuell dom** —
  smoke-lärdomen: spot-check av enstaka slides missade deck-katastrofen två varv
  i rad. Kalibrerad: katastrof-anbudet 378c78a5 = FAIL (47,5k tecken, 8 FAIL-slides);
  tomma Radrum-mallen = PASS (6,5k — designerns avsedda täthet ≈ 540 tecken/slide,
  användbar som budget-facit). Volymstatistiken följer presentation.xml:s sldIdLst
  (pptx-automizer lämnar mallens slide-XML:er som föräldralösa i zipen — glob
  dubbelräknar). Stats funkar utan PowerPoint (`-NoRender`).
- **PPTX visuell iteration:** rendera via `renderTemplate` → exportera slides→PNG via PowerPoint
  COM (`Presentations.Open(...).Slides.Item(i).Export(png,"PNG",w,h)`) → titta. Slide 50.8×28.575 cm.
  Layout-konstanter i `applicators/requirement-matrix.ts` kalibrerade mot mallens font/kolumner.
- **PR-review-routinen ÄR aktiv på bidsmith** (verifierad #47–#53, 2026-07-03): triggar på NYA
  PR:er (inte pushar till befintliga), klassar CRITICAL/…, kör sviten oberoende, lämnar fynd.
  Vänta in dess kommentar före merge; lokal `/code-review` är komplement vid regressionskänsligt.
- Migreringar appliceras MANUELLT via Supabase SQL Editor; redigera aldrig en applicerad migration.
