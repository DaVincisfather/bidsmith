# Bidsmith — Utvecklingsplan (master)

> **För agentiska arbetare:** Detta är en MASTERPLAN med sex faser. Varje fas får en egen
> detaljerad implementationsplan (superpowers:writing-plans, TDD, bite-sized tasks) i denna
> mapp NÄR fasen startar. Exekvera aldrig en fas direkt från detta dokument — skriv
> detaljplanen först. Detaljplaner exekveras via superpowers:subagent-driven-development
> eller superpowers:executing-plans.

> **Reviderad 2026-06-10** efter merge av PR #9 (async generering + failed-status),
> #10 (Opus-prisfix + `ai_call_logs.bid_id`) och #12 (referensbundle → deterministisk
> tom mall): modelltabellen, fas 0-tasks och fas 3/5-beskrivningarna är synkade mot main.

**Mål:** Göra bidsmith generellt användbar för olika konsultbolag (mall/profil som data,
fler output-format), robust i drift (kö-baserad pipeline), självförbättrande
(kunskapslager + utfallsdata) och tokeneffektiv — med en mätbar modellstrategi där
Opus 4.8 vs Fable 5 avgörs via A/B-test, inte magkänsla.

**Arkitekturprincip (oförändrad):** Deterministisk, komprimerande pipeline med modellnivåer
per steg. Det bolagsspecifika flyttas ur koden till data (DB + Storage); produkten förblir
generell, varje bolags särart blir konfiguration.

**Tech-stack:** Next.js 16, TypeScript strict, Supabase (Postgres + Storage + pg-boss),
pptx-automizer, Claude API (`@anthropic-ai/sdk`), Vercel. Befintlig eval-harness i `evals/`.

---

## Fasöversikt och ordningslogik

| Fas | Namn | Storlek | Varför denna ordning |
|---|---|---|---|
| 0 | Modellbas & API-modernisering | Liten | Rör `ai-client.ts` som allt annat bygger på; sänker kostnad/flakiness direkt |
| 1 | A/B-harness: Opus 4.8 vs Fable 5 | Liten–medel | Mätinstrumentet måste finnas innan vi ändrar skrivsteget; återanvänds för all senare kvalitetsmätning |
| 2 | Mall & profil som data | Stor | Största produktvärdet — gör white-labeling till konfiguration istället för fork |
| 3 | Pipeline som kö-jobb | Medel | Ersätter PR #9:s after()-interim (300 s-tak kvarstår där); retry per steg; förutsättning för längre Fable/Opus-körningar och fas 4–5 |
| 4 | Output-adapters (DOCX + kravsvar) | Medel | Kräver mallmanifest (fas 2); svensk offentlig upphandling levereras ofta inte som PPTX |
| 5 | Kunskapslager & utfallsåterkoppling | Stor | Störst kvalitetshävstång över tid; kräver driftdata och fas 3:s persistens |
| 6 | Tokenoptimering radar (Batch API) | Liten | Fristående; kan köras närhelst |

Fas 0+1 görs först och i ordning. Fas 6 kan flikas in när som helst. Fas 2–5 i ordning.

---

## Modellstrategi (uppdaterar CLAUDE.md §Modellstrategi efter fas 1)

Aktuella listpriser (USD per MTok in/ut, verifierade 2026-06-10 via claude-api-skill):
Fable 5 `claude-fable-5` $10/$50 · Opus 4.8 `claude-opus-4-8` $5/$25 ·
Sonnet 4.6 `claude-sonnet-4-6` $3/$15 · Haiku 4.5 `claude-haiku-4-5` $1/$5.

| Pipelinesteg | Idag (kod) | Målbild |
|---|---|---|
| RFP-analys (`rfp-analyzer.ts`) | Sonnet 4.6 | Sonnet 4.6 |
| Konsultextraktion (`consultant-extractor.ts`) | Sonnet 4.6 | Sonnet 4.6 |
| Matchning (`consultant-matcher.ts`) | Haiku-prefilter + Sonnet 4.6 | Oförändrat; embeddings-pre-rank i fas 5 |
| Go/No-Go (`go-no-go-evaluator.ts`) | Sonnet 4.6 | Sonnet 4.6 + kalibreringsdata (fas 5) |
| Skrivbundles: understanding, phases, quality | **Opus 4.7** | **Opus 4.8 nu (fas 0); Fable 5 om A/B i fas 1 motiverar det** |
| Skrivbundles: team, requirement-matrix | Sonnet 4.6 | Sonnet 4.6 |
| Referenssektion | Deterministisk tom mall (PR #12) — ingen AI | Vault-matad referensväljare (efter fas 5) |
| RFP-radar (`opportunity-scorer.ts`) | Haiku 4.5 | Haiku 4.5 via Batch API (fas 6) |
| Eval-judges (`evals/`, `src/lib/eval/`) | Sonnet 4.6 | Sonnet 4.6 — judge får aldrig vara samma modell som jämförs |

**Resonemang Fable 5 vs Opus 4.8:** Fable kostar 2× Opus. Skrivsteget i ett anbud producerar
grovt 15–30k output-tokens → ca $0,75–1,50 (Opus) vs $1,50–3,00 (Fable) per anbud. I absoluta
tal är skillnaden försumbar mot anbudets värde — **kvalitet, inte kostnad, ska avgöra valet**,
och det är exakt vad fas 1 mäter. Fable övervägs ENDAST där text avgör vinst/förlust
(understanding/phases/quality-bundles). Extraktion, matchning och radar vinner inget på
Fable och stannar på Sonnet/Haiku.

---

## Fas 0 — Modellbas & API-modernisering

**Mål:** Centraliserad modellkonfiguration, korrekt kostnadsdata, structured outputs istället
för JSON-extraktion, prompt caching. Allt i `src/lib/`, inga produktytor ändras.

**Filer:** Skapa `src/lib/models.ts`. Ändra `src/lib/ai-client.ts`, `src/lib/ai-cost.ts`,
alla 11 call-sites med hårdkodade modellsträngar (se `grep -r "claude-" src/lib`;
referensbundlen är borta sedan PR #12),
`src/lib/__tests__/ai-client.test.ts`, `src/lib/__tests__/ai-cost.test.ts`.

Uppgifter (detaljplan med TDD-steg skrivs vid fasstart):

1. **`src/lib/models.ts` — modellregistry.** Exportera roller, inte strängar:
   `MODELS = { extraction, matching, prefilter, writing, writingChallenger, judge, radar }`.
   Ersätt hårdkodade ID:n i alla call-sites. → Verifiera: `grep -rn "claude-" src/`
   träffar endast `models.ts`, `ai-cost.ts` och tester; `npx vitest run` grönt.
2. **`ai-cost.ts` — prisrad för Fable 5.** Opus-priserna är redan korrigerade och
   `claude-opus-4-8` tillagd (PR #10, mergad 2026-06-10). Kvar: lägg till
   `claude-fable-5` {10, 50} och skärp models-pristestet så fallback räknas som fel.
   → Verifiera: `ai-cost.test.ts` + `models.test.ts` passerar.
3. **Migrera skrivbundles Opus 4.7 → 4.8.** Endast modell-ID via `MODELS.writing`
   (4.7→4.8 har inga API-brytande ändringar; adaptive thinking + effort används redan).
   → Verifiera: `npm run eval:bid-generator` passerar trösklarna i `evals/thresholds.yaml`.
4. **Structured outputs i `callClaude()`.** Generera JSON Schema från Zod-schemat
   (`zod-to-json-schema`, `additionalProperties: false`) och skicka
   `output_config: { format: { type: "json_schema", schema } }`. Behåll Zod-`safeParse`
   som validering, men `extractJson()` + `ResponseFormatError`-omkörningarna ska inte
   längre behövas i normalfallet (behåll som fallback bakom flagga första veckan).
   OBS: schemats begränsningar — inga `minLength`/`minimum` etc.; rensa eller flytta
   sådana constraints till Zod-sidan. → Verifiera: nya tester för schema-vägen;
   `eval:analyzer` + `eval:matcher` gröna; `ai_call_logs` visar noll format-retries.
5. **Prompt caching.** `cache_control: { type: "ephemeral" }` på system-blocket i
   `callClaude()` när systemprompten är stor nog att caches (minimum 2048–4096 tokens
   beroende på modell — mindre prompts cachas tyst inte, vilket är ofarligt).
   Strukturera system: stabil del (instruktioner + framtida org-profil) FÖRE breakpoint,
   volatilt (RFP-innehåll) i user-content som idag. → Verifiera: vid generering av ett
   anbud (5 bundles mot samma RFP) visar `ai_call_logs` `cache_read_input_tokens > 0`
   från andra anropet och framåt.

**Framgångskriterier fas 0:** Alla vitest + alla tre evals gröna; ett testanbud genererat
end-to-end; kostnad per anbud i `ai_call_logs` dokumenterad som baslinje inför fas 1.

---

## Fas 1 — A/B-harness: Opus 4.8 vs Fable 5 på anbudstext

**Mål:** Datadrivet beslut om `MODELS.writing`. Harnessen blir permanent — varje framtida
modellrelease körs genom samma jämförelse (mönstret finns redan i
`evals/scripts/sandbox-matching-compare.ts` och `evals/results-matching-model-comparison.md`).

**Filer:** Skapa `evals/scripts/run-bid-model-compare.ts`,
`evals/harness/core/pairwise-judge.ts`, `evals/results-bid-model-comparison.md` (genererad).
Ändra `package.json` (script `eval:bid-compare`), ev. `evals/thresholds.yaml`.

Uppgifter:

1. **Jämförelserunner.** Kör bid-generator-fixtures med modellmatris
   `[MODELS.writing, MODELS.writingChallenger]` × ≥3 upprepningar per fixture (variansen
   mellan körningar måste vara känd innan delta tolkas). Samla per modell: befintliga
   dimensioner (struktur/coverage/hallucination), tokens, kostnad (`calculateCostUsd`),
   latens. Dumpa till `evals/runs/`.
2. **Parvis blind textbedömning.** LLM-judge (Sonnet 4.6 — inte en deltagare) får två
   anonymiserade utkast av samma sektion och en rubrik: klarhet, övertygelse, konkretion,
   ton på svenska, frihet från AI-floskler. Varje par bedöms två gånger med bytt position
   (positionsbias); oenighet = oavgjort. Output: vinstandel per modell och sektionstyp.
3. **Mänsklig blindgranskning.** Rapporten renderar N slumpade par som "Utkast A/B" utan
   modellnamn + facit i separat fil. Stefan granskar; människa är gold standard, judgen
   skalar.
4. **Beslutsrapport.** `results-bid-model-comparison.md`: kvalitetsdelta per dimension med
   spridning, kostnad/anbud, latens, rekommendation. Beslutsregel: byt till Fable endast om
   blindgranskning + judge samstämmigt visar bättre text där det är affärskritiskt
   (understanding/quality); kostnadsskillnaden är försumbar per anbud (se Modellstrategi).
5. **Verkställ beslutet.** Uppdatera `MODELS.writing` + CLAUDE.md §Modellstrategi.

**Framgångskriterier fas 1:** Rapport finns med ≥3 fixtures × ≥3 körningar × 2 modeller;
beslut dokumenterat och genomfört; `eval:bid-compare` körbart som regressionsverktyg.

---

## Fas 2 — Mall & profil som data

> **STATUS 2026-06-12: PÅGÅR.** Detaljplan: [2026-06-12-fas-2-mall-profil-som-data.md](2026-06-12-fas-2-mall-profil-som-data.md).
> Avvikelser från denna masterplan (single-workspace istf org-RLS, två migrationer,
> prose-varianter, hybrid budgetmodell — redaktionella tak klampade av geometri) är
> dokumenterade och motiverade i detaljplanens §Designbeslut och Task 4-revisionen.
> PR A (introspektionsmotor) implementerad.

**Mål:** Ett nytt konsultbolag laddar upp sin anbuds-PPTX och fyller i sin profil — och får
anbud i sin egen mall utan kodändring. Idag ligger budgets/registry som kod i
`src/lib/pptx-template/`.

**Filer:** Skapa `src/lib/pptx-template/introspect.ts`, `src/lib/org-profile.ts`,
`supabase/migrations/0NN_templates_and_profiles.sql`, UI-sidor för mall/profil.
Ändra `src/lib/pptx-template/{loader,registry,budget-loader}.ts`,
`src/lib/bid-generator/context.ts` (org-profil in i system-prompt), `src/lib/org.ts`.

Uppgifter:

1. **Mallintrospektion.** Läs uppladdad PPTX via pptx-automizer: namngivna placeholders,
   shape-geometri, fontstorlekar. Beräkna teckenbudget per placeholder ur geometri +
   fontmetrik (kalibrera mot de handsatta budgetar som finns i `budget-loader.ts` — de är
   facit för Ekan-mallen). Output: **mallmanifest** (JSON, versionerat).
   → Verifiera: introspektion av befintlig mall i `templates/` reproducerar dagens
   budgetar inom ±10 %.
2. **DB & Storage.** Tabeller `templates` (manifest, storage-path, version, org_id) och
   `org_profiles` (färger, logga, tonalitet-text, standardsektioner, boilerplate).
   RLS per org. Migration enligt `NNN_beskrivning.sql`-konventionen, appliceras manuellt.
3. **Generering mot manifest.** `bid-generator`/`pptx-template` läser budgets + slots från
   manifestet istället för kodade konstanter; trelagerskorrektorn (promptbudget →
   verifiering+retry → flagga i editor) behålls oförändrad men parametriseras.
   → Verifiera: golden-test — Ekan-mallen genererar identiskt resultat före/efter.
4. **Profilpaket i prompten.** Tonalitet + boilerplate injiceras i systempromptens stabila
   del (före cache-breakpoint från fas 0.5) så att varje org får sin röst utan att
   cachen sprängs per anrop.
5. **UI.** Uppladdning, manifest-förhandsvisning (vilka fält hittades, vilka budgetar),
   profilformulär.

**Framgångskriterier fas 2:** Demo: skapa "Testbolaget AB" med annan PPTX + profil →
generera anbud → korrekt mall, färger, ton; Ekan-flödet oförändrat (golden-test grönt).

---

## Fas 3 — Pipeline som kö-jobb

**Mål:** Generering körs som resumerbara jobb istället för i request-cykeln. Tar bort
timeout-taket, ger retry per steg och progress i UI, och förbereder utbrytning av
`@bidsmith/core` för headless-körning.

**Relation till PR #9 (mergad 2026-06-10):** generering körs redan asynkront via `after()`
med `maxDuration: 300`, status `failed` + `failed_bundles` persisterade och en
stale-watchdog i `GET /api/bids/[id]`. Fas 3 ersätter after()-flödet (vars 300 s-tak
kvarstår) men ska ÅTERANVÄNDA statusmaskineriet och klient-pollingen — bygg inte ett
parallellt felhanteringssystem.

**Rekommenderat vägval:** pg-boss ovanpå befintlig Supabase-Postgres — ingen ny
infrastruktur, ingen ny leverantör. (Alternativ: Inngest/Trigger.dev om managed önskas;
beslut tas vid fasstart.) Worker körs som separat Node-process (lokalt/VPS/Railway);
Vercel behåller UI + API.

Uppgifter:

1. Migration: `pipeline_runs` + `pipeline_steps` (status, input-ref, output-ref, fel,
   tokens/kostnad per steg).
2. Stegen analyze → match → gonogo → generate → render som pg-boss-jobb; varje steg läser
   föregående stegs persisterade output (komprimeringsprincipen blir nu även
   persistensgräns — bra för felsökning och för fas 5:s kunskapslager).
3. API-routes blir enqueue + status; UI pollar/streamar stegstatus.
4. Worker-entrypoint utanför Next (`src/worker/index.ts`) — kärnlogiken i `src/lib/` får
   inte importera Next-specifikt (verifieras med lint-regel).

**Framgångskriterier fas 3:** Anbud genereras end-to-end via kön; ett medvetet fellat steg
kan retry:as utan att tidigare steg körs om; inga API-routes med >60 s körtid återstår.

---

## Fas 4 — Output-adapters (DOCX + kravsvar)

**Mål:** Samma genererade anbudsinnehåll kan levereras som PPTX, DOCX eller kravsvarstabell.
Svensk offentlig upphandling (TendSign/Mercell/Kommers) kräver ofta Word eller svar per
skall-krav — PPTX-only är en reell begränsning.

Uppgifter:

1. Adapter-interface `BidOutputAdapter` med `render(bidContent, manifest, profile)`;
   dagens PPTX-motor blir första implementationen (ren refaktor, golden-test).
2. DOCX-adapter — mallbaserad (docxtemplater mot uppladdad .docx-mall, samma
   introspektionsidé som fas 2) hellre än programmatisk uppbyggnad.
3. Kravsvarsadapter: requirement-matrix → tabell "krav | uppfylls ja/nej | svar | bevis"
   som DOCX/XLSX, redo för inmatning i upphandlingssystem.
4. UI: exportval per anbud.

**Framgångskriterier fas 4:** Ett anbud exporterat i alla tre format; kravsvars-exporten
täcker 100 % av extraherade skall-krav (deterministiskt test).

---

## Fas 5 — Kunskapslager & utfallsåterkoppling

**Mål:** Bolagets historia gör nästa anbud bättre: retrieval över vunna anbud och
referensuppdrag i skrivsteget, och utfallsdata som kalibrerar go/no-go.

**Beslutspunkt vid fasstart:** embedding-leverantör (Anthropic saknar embeddings-API) —
kandidater: Voyage AI, OpenAI embeddings, eller Supabase/gte-small via edge function
(ingen ny leverantör, lägst kostnad). Väg datapolicy tungt — kunddata lämnar annars
ytterligare en leverantör.

Uppgifter:

1. pgvector-migration; indexera tidigare anbud (per sektion), referensuppdrag, vunna FU.
2. Retrieval in i skrivbundles: top-k relevanta referenser in i prompten (efter
   cache-breakpoint, de varierar per RFP).
3. Utfallsloggning finns redan (won/lost/no-bid/cancelled + förlustorsak, konkurrent och
   kommentar via `PATCH /api/bids/[id]/outcome`). Kvar: visa loggat utfall på `/bids/[id]`
   och ge go/no-go-prompten aggregerad historisk träffbild ("av 12 liknande upphandlingar
   vann ni 3").
4. Embeddings-pre-rank i `consultant-matcher` före Haiku/Sonnet-stegen — sänker
   matchningskostnaden vid 80+ konsulter till nära noll för uppenbara icke-matchningar.
   → Verifiera mot matcher-evals: ingen försämring av `expected_top_k`-träff.

**Framgångskriterier fas 5:** Skrivsteget citerar faktiska referensuppdrag (verifierat i
hallucination-eval — källor måste finnas); go/no-go visar kalibreringsunderlag;
matcher-eval grön med pre-rank aktiverad.

---

## Fas 6 — Tokenoptimering radar (Batch API)

**Mål:** Halvera radar-kostnaden. TED-scoring är inte tidskritisk (körs på schema) —
perfekt för Batch API:s 50 %-rabatt.

Uppgifter:

1. `opportunity-scorer` batchvariant: skapa batch (`client.messages.batches.create`),
   polla, hämta resultat; cron-flödet skriver resultat när batchen är klar istället för
   synkront.
2. Kostnadslogg: `ai_call_logs` får batch-flagga (ny migration — `bid_id`-kolumnen finns
   redan sedan PR #10) så halveringen syns i uppföljning.

**Framgångskriterier fas 6:** Radar körs via batch i drift; kostnad per scorad notis
halverad i `ai_call_logs` jämfört med baslinjen.

---

## Arbetssätt och regler (gäller alla faser)

- **Detaljplan före exekvering.** Vid fasstart: superpowers:writing-plans →
  `docs/superpowers/plans/YYYY-MM-DD-fas-N-<namn>.md` med kodnivå-tasks, TDD-steg och
  exakta verifieringskommandon. Denna masterplan uppdateras med länk + status per fas.
- **Evals är grinden.** `npm run eval:analyzer && npm run eval:matcher &&
  npm run eval:bid-generator` ska vara grönt före merge av varje fas. Trösklar i
  `evals/thresholds.yaml`.
- **Surgical changes** och övriga regler i CLAUDE.md gäller. DB-migrationer:
  `NNN_beskrivning.sql`, aldrig redigera applicerad migration.
- **Kostnadsbaslinje.** Efter fas 0 dokumenteras kostnad/anbud; varje senare fas jämförs
  mot den.

## Risker

| Risk | Hantering |
|---|---|
| Structured outputs ändrar svarskvalitet subtilt | Fas 0.4 grindas av alla tre evals, inte bara enhetstester |
| Teckenbudget ur fontmetrik blir oprecis | Kalibrera mot handsatta Ekan-budgetar (±10 %-test); trelagerskorrektorn fångar resten |
| LLM-judge-bias i fas 1 | Positionsbyte, judge ≠ deltagare, mänsklig blindgranskning som gold |
| pg-boss-worker = ny driftyta | Minsta möjliga: en process, healthcheck, omstart via plattformen |
| Embeddings-leverantör och datapolicy | Explicit beslutspunkt vid fas 5-start, inte ett implementationsval |
