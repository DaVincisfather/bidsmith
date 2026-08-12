# Bidsmith — Roadmap & Status

> **Enda sanningskällan för "vad är gjort / vad härnäst".** Uppdatera denna fil i
> SAMMA PR som ändringen. Lita ALDRIG på assistent-minne för status — läs här och
> verifiera mot `git log` / koden. (Minnet driftar; denna fil följer koden.)

_Senast uppdaterad: 2026-08-11 kväll — **FYRA PR:AR SAMMA KVÄLL, TRE MERGADE.**
#104 MD-escaping, #105 export-flippen till POST, #106 foreign-genereringen fail closed —
alla med PR-routine-fynd åtgärdade i respektive PR. #107 (kapabilitetsregister +
effort-fixen) ligger som **DRAFT** och får inte mergas förrän eval körts: den ändrar
`writing`-rollens beteende. Denna PR: prisnoten i `ai-cost.ts` var tidsinställt fel —
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
      Öppna correctness-poster i live-backloggen, störst först:
      (1) **32k-runawayen i phases-bundlen** (synkront med Stefan, kräver eval enligt
      grind-policyn eftersom `writing`-rollen berörs) — den enda kvarvarande posten som
      kan fälla en hel generering; (2) **foreign-genereringen gejtas inte av flaggan**
      (aktiv foreign-mall genererar profilvägen med flaggan av → 195 kapitel + ~$0,5
      i onödan); (3) **export-flippen muterar DB på GET** (båda exportrouterna).
      Därefter: Stefans klick-smoke i dev på kärnflödet (aldrig kvitterad efter #103).
      ~~Markdown-escaping av AI-fritext~~ — KLAR 2026-08-11 (denna PR).
- [ ] **PUBLICERING — FRAMFLYTTAD 2026-08-11, INGET NYTT DATUM.** Ursprungsplanen
      (tisdag 2026-08-11, LinkedIn ~07:45 svensk B2B-morgon, X ~14:30 US-östkustens
      morgon) står kvar som mall för tidpunkterna när datumet sätts om.
      VIDEON ÄR KLAR (v5, 51 s, klippt programmatiskt via ffmpeg — CapCut behövs ej):
      `bidsmith-launch/tmp/videocut/bidsmith-launch-draft.mp4` (med musik: Pixabay
      "Corporate Ambient Piano"/Rockot, fri kommersiell licens) + `bidsmith-15s.gif`
      (X, 2,3 MB) + full-GIF. Innehåll: hook → upload → smideloader → krav →
      källvisar-frys (hallucinationsbeviset) → matchning + frys → go/no-go + frys →
      smide → editor → PPTX-pan → radar (RIKTIG TED-data: 87 hämtade, 20 Haiku-scorade,
      kompetens-seed + CRON_SECRET nu i demo-miljön) → endcard. Ombygge: `build.ps1` +
      `render-cards.mjs` i tmp/videocut/. KVAR FÖR STEFAN: godkänn slutversionen,
      justera [JUSTERA] i `notes/2026-08-02-launch-posts.md`, posta (repo-länk i första
      kommentaren på LinkedIn). OBS efter framflyttningen: keep-alive-rutinen kördes
      sön 9/8 09:00 (claude.ai/code/routines) inför det gamla datumet — demo-Supabasen
      pausar igen efter ~7 d inaktivitet, så den behöver pingas om inför nytt datum
      (eller inför varje demo/inspelning).
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
  KVAR av posten: 32k-runawayen (hypotes 1, effort max-tänkbudgeten — n=1 utan
  runaway bevisar inget), watchdog-samspelet, status-reconcile.
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
- **Export-routernas delade readiness-guards (polish, routine-förslag #100):** 404/
  generating/failed/failed_bundles-guarderna är nu duplicerade rad för rad mellan
  `export/route.ts` och `export-md/route.ts` — bryt ut till gemensam helper innan de
  glider isär.
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
