# Bidsmith — granskningsrapport 2026-06-10

*Multi-agent find→verify-workflow (60 agenter, 4.5M tokens). 31 fynd → 28 överlevde verifiering (10 bekräftade, 18 nedgraderade, 3 refuterade). Gap-analys över 10 områden + backlog-verifiering + ekosystem-recon. Baslinje: tsc rent, 401 tester gröna, 3 kända lint-fel (setState-i-effect).*

---

## 1. Executive summary

Pipelinen är funktionellt sund — verifieringen slog ner de flesta larm (3 refuterade helt, 18 nedgraderade, ofta för att ett "skydd" redan fanns nedströms eller för att beteendet var avsiktligt). Men **en äkta produktionsstoppare kvarstår: anbudsgenereringen körs synkront i POST /api/bids utan `maxDuration`** (bids/route.ts:83). På Vercel dödar plattformen funktionen innan 6 parallella Opus-anrop (effort=max, 32k tokens, 2–5 min, SDK flaggar själv >10 min wall-time) hinner klart → anbudet fastnar i `status='generating'` för evigt. Det fungerar i demo eftersom du kör lokalt (ingen funktions-timeout). Näst viktigast är en kluster av **affärsmodell-risker i enhetsekonomin**: prislistan i ai-cost.ts är 3x för hög på den dominerande kostnadsdrivaren (Opus 4.7 listad $15/$75, faktiskt $5/$25), default-modellen opus-4-8 saknas helt i prislistan (faller tyst tillbaka på Sonnet-pris), och ai_call_logs saknar bid_id-koppling — så $1.70/anbud-baslinjen går inte att mäta per anbud. Säkerhetsmässigt: en autentiserad SSRF i radar-analyze (P2), full CV-PII (raw_cv_text) returneras via `select('*')` till varje inloggad användare (P3), och RFP-filer lagras före validering. Promptinjektion via uppladdade dokument är reell men begränsad (Zod kapar nedströms, människa ser go/no-go) — defense-in-depth, inte akut. Referensbundlen AI-genererar fortfarande referenser trots dubbelt dokumenterat beslut att leverera tom mall — den känsligaste fabriceringsrisken i ett juridiskt skarpt upphandlingssammanhang. PII-anonymisering är obyggd överallt (rå CV/RFP-text går oförändrad till Anthropic) — en konstant, inte ett löst problem.

---

## 2. Del A — verifierade buggar

### P0–P1

| Sev | Fil | Fynd |
|---|---|---|
| **P0/P1** | `bids/route.ts:83` | Synkron anbudsgenerering utan `maxDuration` → Vercel dödar funktionen, bid fastnar i `generating`. Två verifierare: en bekräftade P0, en nedgraderade till P1. Fungerar lokalt, latent i deploy. **Fix:** minimum `export const maxDuration = 300`; egentlig fix = gör flödet asynkront (POST skapar bid+returnerar, generering i bakgrund). Effort M. |

### P2 (bekräftade / nedgraderade till P2)

| Sev | Fil | Fynd | Fix-effort |
|---|---|---|---|
| P2 ✓ | `consultant-matcher.ts:133` | matchConsultants reconcilierar inte prefilter-output mot input-poolen — konsulter som Haiku utelämnar/hallucinerar försvinner tyst ur matchningen | M |
| P2 ↓ | `radar/opportunities/[id]/analyze/route.ts:33` | Autentiserad SSRF: route fetchar attacker-styrbar `raw_xml`-URL serverside, bara `startsWith("http")`, ingen host-allowlist/privat-IP-block/redirect-skydd | M |
| P2 ✓ | `bids/[id]/export/route.ts:56` | `renderTemplate` saknar try/catch → ohanterad 500 vid PPTX-renderingsfel | L |
| P2 ↓ | `rfp-analyzer.ts:53` | Obetrott dokumentinnehåll konkateneras i prompts utan delimiters/hardening — injektionsväg genom pipelinen (defense-in-depth) | M |
| P2 ↓ | `bids/[id]/export/route.ts:30` | Partiella anbudsdrafts exporteras med råa `{platshållare}` synliga i PPTX:en | M |
| P2 ↓ | `ai-client.ts:120` | Per-request kostnadstak saknas: retry-amplifiering kan trippla varje Opus-max-bundle | M |
| P2 ↓ | `ai-client.ts:74` | Eval-domarna körs på default-temp 1.0 trots designkrav temp 0 — harnessen icke-deterministisk (etiketteras polish) | L |

### P3 (bekräftade — billiga, värda en samlad PR)

| Fil | Fynd | Effort |
|---|---|---|
| `supabase.ts:55` | `fetchConsultantsByIds` returnerar tyst mindre team när id:n saknas — bid genereras för färre konsulter än `team_consultant_ids` påstår | L |
| `analyze/route.ts:23` | RFP-fil lagras i Storage före storleks-/typvalidering; ovaliderat filnamn i storage-nyckel | L |
| `consultants/[id]/route.ts:16` | `select('*')` returnerar `raw_cv_text` (full CV-PII) till varje inloggad användare (polish/PII) | L |
| `outcome/route.ts:31` | Ogiltigt UUID i path-param läcker rå Postgres-felmeddelande + fel statuskod (500 i st.f. 400) | M |
| `consultants/[id]/route.ts:100` | PUT/DELETE på okänd consultant-id returnerar 200 (PUT ger body=null) — saknad 404 | L |
| `radar/opportunities/route.ts:23` | Icke-numeriskt `min_score` → NaN i `.gte()` → potentiellt DB-fel med läckt meddelande | L |
| `_footer.ts:169` | `replaceNthOccurrence` saknar paragraf-nivå-pass — bräckligt mot run-splittring | M |
| `reference.ts:89` | Referensflikens slidenummer-prefix uppdateras aldrig — visar '14' på alla referensslides | L |
| Diverse P3 ↓ | prompt-injektion på cover/secrecy-fält, dokument-teckentak saknas, radar-scorer utan delimiters, hallucination.count räknar allowlistade påståenden, middleware fail-open vid saknade env-vars, auth vilar på en deprecated middleware-fil | L–M |

### Refuterade (släppta — felaktiga larm)

- **Go/No-Go default-team top-3 globalt** — refuterad: speglar produktens *egna* avsiktliga default (UI:t gör identiskt val, kommenterat "regardless of level"); default-grenen är dessutom i praktiken onåbar (enda anroparen skickar alltid icke-tomt team).
- **structure.empty_fields fångar bara strängar, inte arrayer** — refuterad.
- **Runtime structure-judge gatar ingenting** — refuterad: dokumenterat avsiktligt (badge är rådgivande, ingen grind), fyndet erkände själv "inte en bugg".

---

## 3. Del B — gap-analys per pipeline-steg

### Improve now (värt knappa timmar nu)

| Steg | Gap | Impact/Effort |
|---|---|---|
| upload-parsing | CV-upload skapar dubbletter — ingen upsert på namn, inget "uppdatera CV"-flöde | H/M |
| upload-parsing | `.doc` annonseras som stött men markitdown-js saknar converter för binärt .doc → kryptiskt fel | M/L |
| extraction | Inget längd-/token-skyddsräcke: hela råtexten (upp till 20MB → 100k+ tokens) skickas ostympad till Sonnet (maxTokens 4000) → sprängt fönster eller tyst tappade krav i slutet | H/M |
| extraction | Extraktionsfel ytliggörs aldrig: ingen confidence, ingen validering att kriterievikter summerar ~100, ingen tom-fält-flagga | H/L |
| matching | Konsult utanför AI-kortlistan får tom motivering i hela kedjan utan UI-signal/fallback | M/L |
| bid-generation | Ingen per-bundle/per-sektion-regenerering: ett failat bundle kräver omkörning av alla 6 (om-betalning av 5 lyckade Opus-anrop) | H/M |
| bid-generation | Referenser AI-genereras fortfarande trots beslut om tom mall — känsligaste fabriceringsrisken | H/L |
| eval-gates | Strukturdomaren är rent rådgivande — inget gatar export; ihåligt anbud kan exporteras och skickas in | M/L |
| rendering | T15 smoke-testet skippar alltid (pekar på gitignorad mockup, fel fil) → noll regressionsskydd | M/L |
| dashboard | Loggat utfall + förlustorsak visas ingenstans på /bids/[id] — utfallsloopen är write-only | H/M |
| dashboard | Anbudshistoriken kapad till 8 rader utan "visa fler" — avbrutna/äldre anbud onåbara | M/M |
| onboarding | `.env.local.example` saknar 2 vars som SETUP ber dig fylla i (NEXT_PUBLIC_SITE_URL, CRON_SECRET) | M/L |
| onboarding | NEXT_PUBLIC_SITE_URL dokumenteras men konsumeras inte i koden; portskifte 3000→3001 bryter magic-link utan att felsökningen nämner det | H/L |
| onboarding | Inaktuellt SESSION-STATUS.md i publika repo-roten (pratar "Agentic Dealflow", `master`) | M/L |
| observability | failedBundles persisteras aldrig — vilka sektioner som failade är borta efter HTTP-svaret | H/L |
| observability | Radar-cron: per-opportunity-fel sväljs tyst, syns bara i Vercel-stdout | M/L |
| unit-economics | Prislistan i ai-cost.ts 3x fel: Opus 4.7 listad $15/$75, faktiskt $5/$25 — dominerande kostnadsdrivaren | H/L |
| unit-economics | Default-modellen opus-4-8 saknas i PRICING → faller tyst tillbaka på Sonnet-pris (~1.7x underräkning) | M/L |

### Improve later

- **extraction:** centrala upphandlingsfält (avtalstid, optioner, takvolym/takpris/kontraktsvärde) extraheras inte — bara `estimatedScope` fritext. Ett ärende = exakt en fil; svenska upphandlingar = huvuddok + bilagor → tappade krav. [M/M]
- **eval-gates:** coverage- och hallucination-domarna körs ALDRIG runtime — bara offline mot stub-fixtures. Runtime ser bara struktur (minst värdefulla dimensionen). Ingen domare kalibrerad mot riktig data. [H/M]
- **rendering:** kravmatrisen tappar krav 7+ tyst (`slice(0,6)` + bundle `.max(6)`) — vid 14+ ska/bör-krav (vanligt) faller krav bort utan UI-signal. [H/M]
- **observability/unit-economics:** ai_call_logs saknar bid_id/run_id → kostnad/fel per enskild körning omöjligt att se; $/anbud kan bara fås som total/antal. [H/M]
- **dashboard:** cancelled-anbud försvinner tyst ur statistiken. [L/L]

### Backlog-status (verifierad mot kod)

| # | Post | Status |
|---|---|---|
| 1 | T15 smoke-test PPTX-corrector | **not_started** — enda smoke-filen skippar i CI, pekar på fel/gitignorad fil |
| 2 | Bid-generator v2 slot-alignment (M2) | **done** — 6 bundles via Promise.allSettled + 3 deterministiska |
| 3 | Hallucination/coverage runtime-gating | **partial** — structure-judge ÄR runtime-integrerad; coverage/hallucination bara offline |
| 4 | CV-upload upsert på namn + "uppdatera CV" | **not_started** — rak insert, varje upload = ny rad |
| 5 | Referensbundle → tom mall | **not_started** — AI-genererar fortfarande |
| 6 | Dokumentparser → markitdown | **done** — markitdown-js för alla format, mammoth/pdf-parse borta |
| 7 | PII-anonymisering (two-view/Presidio) | **not_started** — noll träffar i kod, rå text går till LLM |
| 8 | Utfalls-loop offentlighetsprincipen | **partial** — manuell outcome sparar rik data (outcome/loss_reason/competitor_name/loss_comment), ingen auto-ingestion av tilldelningsbeslut |

---

## 4. Del C — ekosystem (Consulting OS ⇄ Org Vault ⇄ Bidsmith)

### Nuläge (verifierat)

```
  Consulting OS (plugin v2.5, live)        Org Vault (EJ BYGGD)         Bidsmith (live)
  ┌──────────────────────────┐            ┌──────────────────┐         ┌──────────────────────┐
  │ skills: projektdirektiv,  │            │  RFP/anbud-hist  │         │ consultants (name,    │
  │ nytt-projekt, intro,      │            │  CV-bibliotek    │         │   raw_cv_text i PG)   │
  │ stop-slop                 │            │  referenser      │         │ analyses, matches,    │
  │ CV-skill: PLANERAD ✗      │   ───?───▶ │  (Obsidian +     │ ──?───▶ │ go/no-go, bids,       │
  │ slutrapport: PLANERAD ✗   │            │   YAML-frontm.)  │         │ outcomes, ai_call_logs│
  │ vault-inbox: EJ BYGGD ✗   │ ◀──?─────  │                  │ ◀──?─── │ PPTX-export           │
  │ id: Windows-profil + namn │            └──────────────────┘         │ id: enbart namn       │
  │   i projekt-CLAUDE.md     │              ALLA pilar obyggda           │   (ingen unik-constr.) │
  └──────────────────────────┘                                          └──────────────────────┘
   filbaserat (Word via python-docx, markitdown, PowerShell-hooks)
```

**Kritiskt:** ingetdera systemet har ett stabilt konsult-ID. Consulting OS identifierar via Windows-användarnamn + namn i projekt-team-tabeller; Bidsmith via `name` utan unik-constraint. Vault finns inte. CV-skill och slutrapport-skill i Consulting OS är **planerade men obyggda**. Vault-inbox **obyggd**.

### Per integrationskant

| Kant | Data | Rekommenderad mekanism (nära-noll-ops) | Rationale |
|---|---|---|---|
| Consulting OS → Bidsmith (CV) | Konsult-CV (PII) | **Filuppladdning via befintlig upload + upsert-på-namn** | Bidsmith har redan upload-vägen; bygg upsert (gap #4) så blir CV-underhåll i Word → upload idempotent. Ingen ny infra. Bygg INTE API ännu. |
| Bidsmith → Vault (utfall/artefakter) | Won/lost + PPTX | **Filbaserad inbox: markdown + YAML-frontmatter per stängt anbud** | Matchar Consulting OS:s planerade vault-inbox-mönster. Datan finns redan i `bids`. Aktiveras när vault finns. |
| Vault → Bidsmith (referensval) | Projektreferenser | **Skjut upp; när det behövs: read-only MCP-server över valvet** | Claude-native stack; men nära-term filbaserat räcker. Blockeras på vault. |

### Datadiktatur & flöde
- **Kanoniskt CV bor idag i Bidsmith** (`raw_cv_text` i Postgres) — Consulting OS hanterar inte CV ännu. Riktning: när konsultcv-skill byggs blir konsulten författare (markdown/Word i `~/consulting/`), Bidsmith ingestar via upload. Valvet blir kanoniskt *senare*.
- **Referensflöde:** Consulting OS slutrapport-skill → vault-inbox → vault → Bidsmith referensval. **Alla uppströmsbitar obyggda.** → Gör Bidsmiths referensbundle till tom mall NU (gap), vault-matad senare.
- **Bidsmith pushar tillbaka:** utfall (redan strukturerat) + exporterad PPTX → markdown+frontmatter till valvet.

### Open-core-gräns
Publika `bidsmith` får ALDRIG innehålla: Ekan-specifika prompts, kalibrerade eval-set på riktig data, Ekan-mallar, klientdata, branding. De bor i Ekans privata fork + Ekans Supabase. Vault (proprietärt) + Consulting OS-innehåll (proprietärt) rör aldrig publika repot. Topologi: publika = generisk kod + syntetiska fixtures; Ekan-fork trackar upstream, håller glue.

### Privacy-flaggor på kanterna
1. **CV-ingestion Consulting OS → Bidsmith** rör PII (namn, klientuppdrag). Minimiskydd: håll inom Ekans egen infra (Ekan Supabase, EU-residency, DPA), aldrig publika repot. PII-frågan bör vara löst innan firmabred drift.
2. **Bidsmith → Vault-utfall** rör klient-/upphandlings-/konkurrentdata. Minimiskydd: valvet lokalt/Ekan-styrt (Obsidian lokal), ingen molnsync utanför EU.
3. **Alla LLM-anrop** skickar fortfarande rå CV/RFP-text till Anthropic — den olösta PII-frågan gäller tvärs alla tre system.

### Sekvensering
- **Före valvet (Bidsmith-internt):** CV upsert-på-namn, referensbundle→tom mall, pris-/observability-fixar, visa utfall på /bids/[id].
- **Före valvet (Consulting OS):** konsultcv-skill, slutrapport-skill, vault-inbox-format (markdown+frontmatter som filoutput, ingen vault krävs).
- **Blockeras på valvet:** referensval matat från valvet, utfalls-ingestion in i valvet, semantisk sökning över historik.
- **Oberoende av valvet:** utfalls-loopen via offentlighetsprincipen kan starta som manuell "klistra in tilldelningsbeslut" + redan lagrad data.

---

## 5. Topp 5 nästa PR:s (rekommenderad ordning)

1. **Async anbudsgenerering + maxDuration** (P0). Minimum: `export const maxDuration` på POST /api/bids. Egentlig fix: POST skapar bid (`generating`) + returnerar direkt, generering i bakgrund, klient pollar. Enda äkta deploy-stopparen. *Effort M.*
2. **Pris- & enhetsekonomi-pack** (affärsmodell). Rätta ai-cost.ts (Opus $5/$25, lägg in opus-4-8), lägg bid_id på ai_call_logs + tråda ner via BidContext. Avriskar $1.70/anbud-siffran. *Effort L–M.*
3. **Referensbundle → tom mall.** Rippa AI-genereringen i reference.ts, leverera deterministisk tom placeholder. Tar bort den känsligaste hallucinationsrisken i juridiskt skarpt sammanhang. Dubbelt dokumenterat beslut. *Effort L.*
4. **API-härdnings-pack** (samlade billiga P3 correctness/PII). Export-route try/catch, delad UUID-validator, 404 på okänd consultant, droppa `raw_cv_text` ur consultant-select. *Effort L (samlat).*
5. **Matcher-reconciliation** (P2 ✓). Stäm av prefilter-output mot input-poolen så konsulter inte försvinner tyst; default-scora saknade med observability-flagga. *Effort M.*

**Snabba städ-vinster** (kan baka in eller egen mini-PR): `.env.local.example` + 2 vars, radera SESSION-STATUS.md, fixa T15 smoke-path.

---

## 6. Samlade dataskyddsflaggor

| # | Flagga | Var | Minimiskydd |
|---|---|---|---|
| 1 | Full CV-PII (`raw_cv_text`) returneras via `select('*')` till varje inloggad användare | consultants/[id] routes | Mappa bort raw_cv_text ur svaret (mapConsultantRow) eller explicit kolumnlista |
| 2 | Ingen PII-anonymisering före LLM-anrop (two-view/Presidio obyggt) — rå CV+RFP till Anthropic | hela pipelinen | Konstant, inte löst. Validera Ekans faktiska tröskel (DPA/EU-residency) innan firmabred drift |
| 3 | Autentiserad SSRF kan nå internt nät | radar/analyze:33 | Host-allowlist (ted.europa.eu), blockera privata IP, redirect:manual |
| 4 | RFP-fil lagras före validering; ovaliderat filnamn i storage-nyckel | analyze/route.ts:23 | Validera storlek/typ före upload, sanera filnamn till basename |
| 5 | Single-workspace: alla inloggade delar all data (dokumenterat avsiktligt) | RLS `using(true)` | OK för en firma; omvärdera vid firmabred/multi-team |
| 6 | Referensfabrikation i juridiskt skarpa anbud | reference.ts | Tom mall (PR #3 ovan) |
| 7 | Publikt repo — bekräftat inga hemligheter (.env.local.example bara placeholders) | repo-rot | Bibehåll; klientdata/branding aldrig upstream |

---

*Källa: workflow wf_a702beb0-881, körd 2026-06-10. Severity-etiketter = verifierares finalSeverity (↓ = nedgraderad från finder-claim, ✓ = bekräftad).*
