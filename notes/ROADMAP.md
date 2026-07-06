# Bidsmith — Roadmap & Status

> **Enda sanningskällan för "vad är gjort / vad härnäst".** Uppdatera denna fil i
> SAMMA PR som ändringen. Lita ALDRIG på assistent-minne för status — läs här och
> verifiera mot `git log` / koden. (Minnet driftar; denna fil följer koden.)

_Senast uppdaterad: 2026-07-06 sen kväll — Radrum-omtest KÖRT efter #71: F2 verifierad (67 static), generering GÅR IGENOM men två nya fynd (F5 väggklocka > Vercel-tak, F6 tomma-slot-lotteri). NÄSTA: F6/F5-fix + stickprov._

---

## 🔜 NÄSTA (börja här)
- [ ] **F6/F5-FIX (nästa kodpass — riktning föreslagen, Stefan beslutar):** omtestet
      (verifieringsdokumentets TILLÄGG) visade att slide-anrop med 20–30 obligatoriska
      nycklar nondeterministiskt lämnar 1–9 TOMMA (körning 1: en, körning 2: nio) →
      export-lotteri trots per-slot-nedgradering. Föreslagen F6-fix enligt
      evidence-guard-mönstret: samla tomma/saknade slots efter slide-anropen → ETT
      batchat re-ask-anrop → först därefter failedSections. Ta F5 i samma pass:
      351–352 s väggklocka > Vercels 300 s-tak (höj SLIDE_CONCURRENCY och/eller sänk
      effort/maxTokens för writingGeneric). Omtest mot Radrum v3 (id 9bf84030…,
      onboardad med prisfält skippade) — billigt: ingen ny klassificering behövs.
- [ ] **STICKPROV (operatör — Stefan, påbörjat 2026-07-05):** relevans-stickprov av
      citaten på gröna loopkörningar. Mekaniken garanterar att citaten FINNS ordagrant;
      att de är RELEVANTA för påståendet är residualen som verifieras av människa. Underlag:
      verifierade par i `evals/results/*.md` (RFP + CV, från gröna varven).
- [ ] **LOOP-VALIDERING (operatör, BETALD, under $20-tak, vid behov):** om-kör
      `npm run eval:zero-halluc [-- --target=cv]` för stabil grön post-vakt + coverage mot
      goldens. Spårkostnad hittills ~$5 av $20.

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

## Mall-uppladdning (godtyckliga bolagsmallar) — aktiv feature
Design-doc: `notes/2026-07-02-template-upload-architecture.md` (A+C-combo, B inkrementellt).
Beslut: kapabilitets-baserad motor, onboarding ≠ rendering, durabel mall-profil.
- [x] Slice 1 — mall-profil-schema + migration 008 (#42, merged)
- [x] Slice 2 — `manifestToProfile`: manifest → capability-klassificering (#44, merged)
- [x] Slice 3 — profil-driven renderare bakom `BIDSMITH_PROFILE_RENDER`, golden-bitparitet grön
- [x] Slice 4 — `generic-prose`-bundle + prose/field-applikator; pipeline-inkoppling levererad i slice 5b
- [x] Slice 5a — profil-persistens (`profile-store.ts`) + upload deriverar & sparar startprofil
- [x] Slice 5b — auto-klassificering (`propose-injection-plan`) + generic-prose-inkoppling (`generateSectionsFromProfile` + all-generic-routing, Sonnet 5)
- [x] Slice 5-UI — onboarding-wizard (introspektion + intervju + redigerbar profil) (#70, 2026-07-06)
- [ ] Slice 6 — B inkrementellt: bullets, sedan godtyckliga table-rows. OBS: text i
      tabeller (`a:tbl`/graphicFrame) deltar INTE i onboardingen idag (inte kandidat, inte
      i wireframe, kan inte instrumenteras) — kravmatris-liknande slides blir statiska
      tills detta byggs (dokumenterad begränsning i #70)

## Öppna PR:er (väntar review)
_Inga — #54–#68 mergade 2026-07-03/04._

## Backlog (verifiera mot kod före start — kan vara inaktuellt)
- **Per-slide-genereringens residualer (F1-fixen, granskningsnoterade):**
  - trunkering (maxTokens-taket) fäller HELA slidens slots i failedSections — per-slot
    drabbades bara den överstora sloten (correctness, svansrisk på täta slides)
  - dubbel-placeholder på samma slide garderas ENBART av onboardingens kollisionssuffix —
    map-nyckeln skriver tyst över (correctness-lite, ej nåbar idag)
  - missing-key-nedgraderingen i generate-from-profile är onåbar i produktion (schemat
    rejectar före) — död defensiv kod med felbeskrivande kommentar (städ)
  - `buildGenericProseSection` (per-slot) är nu produktions-orphan — behåll/ta bort medvetet
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
- ~~**UX: anbudsmallar går inte att RADERA**~~ — KLART: `DELETE /api/templates/[id]` + radera-knapp i TemplateSection (vägrar aktiv mall / mall som anbud refererar / bundlad mall med 409; storage-städning icke-fatal; template_profiles kaskaderar) (2026-07-04)
- [x] ~~**UX: företagsprofilen** — flytta till arbetsytan + gör PÅVERKAN begriplig~~ — FLYTTAD till `/arbetsyta/profil` (kort på arbetsyta-landningen + pekare kvar i Inställningar); ny `ProfileImpactPanel` visar var profilen injiceras (6 skrivbundlar, härlett ur `formatContext`), vad tomma fält betyder, och fyllnadsgrad per fält. Fyllnadslogik ren + enhetstestad, drift-vaktad mot `BUNDLE_LABELS`. Visuell polish itereras live med Stefan. (2026-07-04)
- Pre-fas-C-lagrade matchmotiveringar (`ScoredConsultant.reasoning` i DB) kan citera obelagda claims och flödar in i go/no-go + anbudskontext tills om-matchning — samma temporala residual, annan väg (routine #64). ANNOTERAT 2026-07-04: med `extraction_version` på konsult-raden är staleness nu DETEKTERBAR. Ingen kod behövs nu — om-matchning av en post-feature-konsult regenererar reasoning via den versions-medvetna grinden. Kvar som backlog bara om aktiv invalidering önskas.
- `consultant.summary` är overifierad friyta in i alla tre AI-inputs — nästa naturliga yta för noll-hallucinationsspåret (routine #64)
- [x] ~~Extraktions-versions-diskriminator: all-strippad post-feature-konsult (fel fil) är i datat identisk med legacy → grinden släpper igenom~~ — LEVERERAD 2026-07-04 (offline-testad, inga API-anrop): `consultants.extraction_version` (migration 011, nullable; NULL=legacy, 1=evidens-generationen). `EXTRACTION_VERSION` i `src/lib/extraction-version.ts`; `upsertConsultant` stämplar den (insert + update). `groundedConsultantClaims` + UI-grinden (`showEvidenceBadges`, `TrustReceipt`) tar valfri `extractionVersion`: non-null ⇒ grinden ALLTID på (all-strippad → noll grundade claims in i AI-input + all-amber i UI); null ⇒ union-heuristik (äkta legacy). Migration 011 KÖRD av operatören 2026-07-04. Residualen nu temporal + krympande: bara rader extraherade post-feature men FÖRE 011 förblir tvetydiga tills om-uppladdning (ingen backfill — versionen kan ej härledas i efterhand).
- Statisk TOC-sidnumrering desyncar (hårdkodad; matris-paginering + tomma referenser förskjuter riktiga nummer)
- `met`/JA-fältet vestigialt i matris-schemat (coverage = sanningskälla) — städbar
- ai-client detekterar inte `stop_reason: "max_tokens"` → alla bundles re-trunkerar identiskt (bredare härdning)
- [x] ~~`consultants/upload` sanerar inte filnamn (ingen storage-nyckel-yta idag, men om det ändras)~~ — AKTIVERAD + LÖST: originalfilen persisteras nu, så en storage-nyckel-yta finns; `buildCvKey` slugar filnamnet (gemener, åäö behålls, allt annat → "-", sökväg strippas) som mall-uploaden och behåller den whitelistade extensionen
- Profil-renderarens `variant` castas `as ProseVariant` utan validering (render-from-profile.ts) — härda när slice 5/6 låter främmande mallar sätta godtyckliga variant-strängar
- [x] ~~generic-prose kör Opus + effort max per okänd slot~~ — LÖST 2026-07-03: egen roll `writingGeneric` = Sonnet 5 ($2/$10 intro → $3/$15 efter 2026-08-31; bump-påminnelse i ai-cost.ts)
- **BUG-A:** leveranser hamnar i ska-krav i analysvyn
- **BUG-B:** analyserad RFP syns inte i dashboarden → svårt att gå tillbaka till analysen
- "Ändra team" skapar nytt anbud (POST /api/bids) i st.f. att regenerera — semantik att se över
- T15 manuell smoke + runtime hallucination/coverage-kalibrering (kräver riktig RFP-data / Ekan-adoption)
- Profil-schema vs renderare: `SlideProfile.capability` är optional ("a slide may mix capabilities") men `applicatorForCapability` dispatchar bara på slide-nivå och kastar på undefined — per-slot-dispatch eller skärpt schema krävs innan främmande profiler renderas (Fable-review 2026-07-03)
- generic-prose saknar budget-enforcement vid rendering — soft-cap mot `slot.budgetChars` i generic-prose-applikatorn (jfr `_soft-cap.ts`) innan främmande mallar fylls på riktigt
- [x] ~~Flagg-vägen i `loader.ts` deriverar profilen ur manifestet per render i st.f. `loadTemplateProfile`~~ — LÖST: flagg-vägen laddar nu den persisterade profilen (fallback till manifest-härledd för bundlade mallen utan rad) (routine-follow-up #49)
- [x] **Manuell PowerPoint-smoke:** GENOMFÖRD 2026-07-03 — riktig anbudsmall-v2 instrumenterad, öppnad i PowerPoint via COM utan reparation, slide exporterad + visuellt verifierad (token med ärvd formatering). instrumentTemplate är verifierad mot syntetisk mini-pptx; xmldoms serialisering (ns-redeklarationer, attributordning) är obeprövad mot riktiga kundmallar + att PowerPoint faktiskt öppnar den instrumenterade kopian (routine-follow-up #51)
- budgetChars för främmande slots: förslags-lagret lämnar budget osatt — koppla compute-budgets geometri→tecken-matten till ProposedSlot innan generic-prose-fyllning av riktiga kundmallar (annars ingen längdstyrning)
- Re-onboarding av delvis instrumenterad mall: förslags-lagret inkluderar token-bärande slides som static-passthrough (försvinner inte ur rendern) men deras BEFINTLIGA tokens fylls inte — kräver profil-merge mot tidigare sparad profil (routine-follow-up #52)
- Grind-policyns "smoke" som körbar grej: `skipIf(!process.env.ANTHROPIC_API_KEY)`-gated test som gör ETT riktigt API-anrop per roll i models.ts — exakt gapet som släppte igenom temperature-blockeraren på #53 (routine-follow-up)
- **Ny blindfacit-validering (förutsättning för judge-byte till Sonnet 5):** ska vara PLANERAD denna gång (Stefan 2026-07-03) — generera ENBART sektioner som faktiskt AI-genereras i produktion; fas 1-rundan inkluderade sektioner som numera är deterministiska (referenser, certifieringar, cover) och judgade därmed delvis text som aldrig shippas

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
- **PPTX visuell iteration:** rendera via `renderTemplate` → exportera slides→PNG via PowerPoint
  COM (`Presentations.Open(...).Slides.Item(i).Export(png,"PNG",w,h)`) → titta. Slide 50.8×28.575 cm.
  Layout-konstanter i `applicators/requirement-matrix.ts` kalibrerade mot mallens font/kolumner.
- **PR-review-routinen ÄR aktiv på bidsmith** (verifierad #47–#53, 2026-07-03): triggar på NYA
  PR:er (inte pushar till befintliga), klassar CRITICAL/…, kör sviten oberoende, lämnar fynd.
  Vänta in dess kommentar före merge; lokal `/code-review` är komplement vid regressionskänsligt.
- Migreringar appliceras MANUELLT via Supabase SQL Editor; redigera aldrig en applicerad migration.
