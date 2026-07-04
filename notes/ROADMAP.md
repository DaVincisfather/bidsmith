# Bidsmith — Roadmap & Status

> **Enda sanningskällan för "vad är gjort / vad härnäst".** Uppdatera denna fil i
> SAMMA PR som ändringen. Lita ALDRIG på assistent-minne för status — läs här och
> verifiera mot `git log` / koden. (Minnet driftar; denna fil följer koden.)

_Senast uppdaterad: 2026-07-03 — PIVOT: evidens-förankrad extraktion + noll-hallucinationsloop byggd (matchningskvalitet före mall-UI)_

---

## 🔜 NÄSTA (börja här)
- [x] **Noll-hallucinationsloop + runtime-evidensvakt.** PIVOT 2026-07-03 (Stefan):
      matchningskvalitet är vallgraven → mål är NOLL hallucinationer i extraktionen.
      Loop + mekanik byggd; **runtime-vakten shippad** (denna PR, offline-testad, inga
      API-anrop): verifieraren flyttad till produktkod (`src/lib/verify-evidence.ts`,
      delad av vakt + loop), vakten i `analyzeRfp` (`src/lib/rfp-analyzer.ts`) —
      verifiera → ETT batchat riktat re-citat → fortfarande overifierbart ⇒ strippa
      citatet (`evidence: undefined`, flaggat), kravet behålls. Loopen
      (`npm run eval:zero-halluc`) mäter nu POST-vakt-kvalitet.
      Design-doc: `notes/2026-07-03-zero-hallucination-loop.md`.
      KVAR (operatör, BETALD, under $20-tak): kör loopen mot 4 fixtures för att
      bekräfta stabil grön post-vakt + coverage mot goldens.
- [x] **Fas B — CV-extraktion (input-grounding).** BYGGD 2026-07-03 (offline-testad,
      inga API-anrop; operatörsvalidering kvar). Vakten utfaktoriserad till delad helper
      `src/lib/evidence-guard.ts` (`runEvidenceGuard`), använd av både `analyzeRfp` och
      `extractConsultant`. Kompetenser + referenser bär ordagrant CV-citat (schema
      `evidence.min(1)` + `competencies.min(1)`); "rimlig bedömning" narrowad till
      level/years/summary. CV-loop: `npm run eval:zero-halluc -- --target=cv`. Fixture-
      generator `evals/scripts/generate-cv-fixtures.ts` (BETALD, syntetiskt, ingen PII).
      **Budget-gate-bugg funnen + fixad:** loopens kostnadsfråga missade `:requote`-anropen
      (`.eq` → `.like("eval:zero-halluc%")`). Design-docens Fas B.
      KVAR (operatör, BETALD, under $20-tak): kör `eval:gen-cv-fixtures` sedan
      `eval:zero-halluc -- --target=cv` → bekräfta stabil grön + kompetens-coverage.
- [ ] **Fas C — matchning nedviktar/exkluderar flaggade kompetenser?** Öppet beslut: ska
      matchern nedvikta/exkludera flaggade (evidence-lösa) kompetenser? + matchnings-
      motiveringar får bara citera CV-grundade fakta. Rör INTE matchern i fas B.
      OBS (routine-fynd #56): degenererat underlag (fel fil uppladdad som CV) + competencies.min(1) kan ge en fabricerad-men-flaggad post som når matchern — väg in i policybeslutet.
- [ ] **"källa:"-badge i UI** (`analysis-result.tsx` + CV-vyn): surfa `evidence` per krav
      OCH per kompetens/referens; poster med `evidence: undefined` (vaktens flaggade)
      visar ingen badge. **Data + läsväg finns nu** (denna PR): SELECT-konstanterna +
      `mapConsultantRow` exponerar citatet och konsult-editorn round-tripar det —
      ENDAST själva badge-UI:t återstår.

### Routine-fynd #57 — evidens-round-trip (STÄNGDA denna PR, offline-testade, inga API-anrop)
- [x] **Läsväg exponerar evidence.** `CONSULTANT_SELECT`/`CONSULTANT_API_SELECT` hämtar nu
      `evidence` för kompetenser + referenser; `mapConsultantRow` mappar det (DB-null →
      undefined). Consultant-läs-typerna bar redan `evidence?` via ConsultantCompetency/Reference.
- [x] **Manuell redigering WIPAR inte längre persisterad evidens.** `PUT /api/consultants/[id]`
      tar emot valfritt `evidence` per post och RE-VERIFIERAR varje citat mot radens egna
      `raw_cv_text` via `verifyEvidence` (ren sträng-matchning, inga API-anrop): verifierat →
      persisteras som text, utelämnat/overifierbart/inget raw_cv_text → null. Behåller round-
      trippen förlustfri för orörda poster; redigerade/nya/fabricerade citat blir ärligt
      obelagda. Konsult-editorn (`consultant-profile.tsx`) rider med citatet i PUT-payloaden.
- [x] **Kör migration 008** (`template_profiles`) — applicerad manuellt i Supabase 2026-07-03.

### Nedprioriterat per pivot 2026-07-03 (matchningskvalitet före mall-UI; PPT-export kalibreras mot riktiga case senare)
- [ ] **Slice 5b — token-injektion** (`instrumentTemplate`): NY kärnkomponent efter beslut
      2026-07-03 (design-doc TILLÄGG). Onboarding instrumenterar en kopia av kundens mall
      (föreslå slots → bekräfta → injicera `{tokens}`) så den token-baserade pipelinen kör
      oförändrad. `classifyForeignSlot`, injektionsmotorn (`instrumentTemplate`) OCH
      förslags-lagret (`onboarding/propose-injection-plan.ts` — kandidat-slots ur
      shape-text/geometri → auto-klass → utkast-profil) byggda & enhetstestade. Kvar:
      generic-prose-inkoppling + slice 5-UI som konsumerar planen.
- [ ] **generic-prose-inkoppling** i genereringen för profil-drivna mallar (VVS:en som får
      främmande mallar att generera). Modellbytet är GJORT: `writingGeneric` = Sonnet 5
      (beslut 2026-07-03, ingen eval — ögonkoll på outputs i 5-UI-testningen istället).
- [ ] **Slice 5-UI** — onboarding-flöde (upload → slot-förslag → intervju → injicera →
      redigerbar profil), med Stefans design-riktning. Egen PR.

## Mall-uppladdning (godtyckliga bolagsmallar) — aktiv feature
Design-doc: `notes/2026-07-02-template-upload-architecture.md` (A+C-combo, B inkrementellt).
Beslut: kapabilitets-baserad motor, onboarding ≠ rendering, durabel mall-profil.
- [x] Slice 1 — mall-profil-schema + migration 008 (#42, merged)
- [x] Slice 2 — `manifestToProfile`: manifest → capability-klassificering (#44, merged)
- [x] Slice 3 — profil-driven renderare bakom `BIDSMITH_PROFILE_RENDER`, golden-bitparitet grön
- [~] Slice 4 — `generic-prose`-bundle + prose/field-applikator byggda & enhetstestade (isolerade); pipeline-inkoppling flyttad till slice 5
- [~] Slice 5a — profil-persistens (`profile-store.ts`) + upload deriverar & sparar startprofil
- [ ] Slice 5b — auto-klassificering + generic-prose-inkoppling (Sonnet 5)
- [ ] Slice 5-UI — onboarding-flöde (introspektion + intervju + redigerbar profil)
- [ ] Slice 6 — B inkrementellt: bullets, sedan godtyckliga table-rows

## Öppna PR:er (väntar review)
_Inga just nu._

## Backlog (verifiera mot kod före start — kan vara inaktuellt)
- Statisk TOC-sidnumrering desyncar (hårdkodad; matris-paginering + tomma referenser förskjuter riktiga nummer)
- `met`/JA-fältet vestigialt i matris-schemat (coverage = sanningskälla) — städbar
- ai-client detekterar inte `stop_reason: "max_tokens"` → alla bundles re-trunkerar identiskt (bredare härdning)
- `consultants/upload` sanerar inte filnamn (ingen storage-nyckel-yta idag, men om det ändras)
- Profil-renderarens `variant` castas `as ProseVariant` utan validering (render-from-profile.ts) — härda när slice 5/6 låter främmande mallar sätta godtyckliga variant-strängar
- [x] ~~generic-prose kör Opus + effort max per okänd slot~~ — LÖST 2026-07-03: egen roll `writingGeneric` = Sonnet 5 ($2/$10 intro → $3/$15 efter 2026-08-31; bump-påminnelse i ai-cost.ts)
- **BUG-A:** leveranser hamnar i ska-krav i analysvyn
- **BUG-B:** analyserad RFP syns inte i dashboarden → svårt att gå tillbaka till analysen
- "Ändra team" skapar nytt anbud (POST /api/bids) i st.f. att regenerera — semantik att se över
- T15 manuell smoke + runtime hallucination/coverage-kalibrering (kräver riktig RFP-data / Ekan-adoption)
- Profil-schema vs renderare: `SlideProfile.capability` är optional ("a slide may mix capabilities") men `applicatorForCapability` dispatchar bara på slide-nivå och kastar på undefined — per-slot-dispatch eller skärpt schema krävs innan främmande profiler renderas (Fable-review 2026-07-03)
- generic-prose saknar budget-enforcement vid rendering — soft-cap mot `slot.budgetChars` i generic-prose-applikatorn (jfr `_soft-cap.ts`) innan främmande mallar fylls på riktigt
- Flagg-vägen i `loader.ts` deriverar profilen ur manifestet per render i st.f. `loadTemplateProfile` — en REDIGERAD profil påverkar inte rendering förrän det byts (routine-follow-up #49)
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
