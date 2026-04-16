# AI Eval Harness — Design Spec

## Problem

AI-pipelinen (`rfp-analyzer`, `consultant-extractor`, `consultant-matcher`, `opportunity-scorer`) producerar strukturerad output som driver hela produkten, men vi har ingen mätbar feedback på träffsäkerhet. Varje prompt-ändring är en gissning — vi vet inte om vi förbättrar eller regredierar. När vi snart introducerar design partners behöver vi conviction på att:

1. **Krav-extraktion** fångar ska-kraven som faktiskt står i RFP:en
2. **Konsult-matchning** placerar konsulter vars CV:n *demonstrerar ska-kraven* i toppen

Specifikt ska-krav-matchning är kärnan i produktens värde. Om modellen rankar en konsult som top-1 utan att CV:t visar att ska-kraven är uppfyllda förlorar kunden anbudet — och vi förlorar trovärdighet.

## Solution

En fristående eval-harness som kör verkliga AI-anrop mot ett fixerat golden set av syntetiska test-case och rapporterar mätbara metrics per modul. Designad för att ge conviction genom:

- **Must-Have Coverage (MHC)** som primär matcher-metric — Sonnet-judge verifierar att varje ska-krav i RFP demonstreras av top-K konsultens CV
- **Ranking quality + MHC som oberoende mätvärden** — skiljer "matcher valde fel" från "golden set var fel"
- **Isolerad + end-to-end eval-lägen** — urkopplar `consultant-extractor` som confounding variable
- **Syntetiska konsulter med avsiktlig spridning** — strong-match, close-call, non-match
- **Generisk harness-arkitektur** — skalar till andra moduler och framtida funktioner utan omskrivning

**Styrprincip:** eval-harnessen ska göra det möjligt att med hög conviction besvara "matchar vi rätt konsulter mot ska-kraven?". Allt annat är sekundärt.

## Scope

**In scope (MVP):**

- Eval-harness för `rfp-analyzer` (fullt output-schema) + `consultant-matcher` (MHC + ranking + reasoning)
- 5 analyzer-fixtures + 5 matcher-fixtures (roadmap till 10+10)
- Syntetiska konsulter (8-10 distinkta profiler) med avsiktlig spridning över match-kvalitet och CV-formatering
- Två matcher-lägen: **isolated** (pre-parsed consultant JSON) i MVP, **end-to-end** (raw CV text → extractor → matcher) som framtida tillägg
- Manuell CLI: `npm run eval:analyzer`, `npm run eval:matcher`
- Console-rapport + JSON-dump per körning
- Threshold-konfigurerbar rapportering (grönt/gult/rött)
- Generisk harness-arkitektur (`core/` + `configs/`) från dag 1

**Out of scope (framtida arbete):**

- `consultant-extractor` och `opportunity-scorer`-evals
- End-to-end matcher-läge (fixture-formatet stöder det, runner-implementationen skjuts)
- CI-integration (GitHub Action på AI-fil-ändringar)
- Historisk trend-visualisering (automatisk diff mellan körningar)
- Full-rank evaluation method för matcher (flagga finns i fixture-schemat, runner-stödet skjuts)
- Snapshot-caching / regression-suite mot lagrade outputs
- Adversarial test-case generation
- Konstnär-loggning / per-fält-trend över tid

## Arkitektur

```
evals/
├── fixtures/
│   ├── analyzer/
│   │   ├── ted-2026-it-consulting.yaml
│   │   ├── ted-2026-hr-advisory.yaml
│   │   └── ... (5 st MVP, 10+ target)
│   ├── matcher/
│   │   ├── it-consulting-match.yaml
│   │   └── ... (5 st MVP, 10+ target)
│   └── consultants/
│       └── synthetic-pool.yaml           # delad pool av 8-10 syntetiska CV:n
├── harness/
│   ├── core/                             # domän-agnostisk
│   │   ├── runner.ts                     # generic runner: (config) → results
│   │   ├── judges.ts                     # exact | haiku-equiv | sonnet-mhc
│   │   ├── metrics.ts                    # recall/precision/F1/hit@K/MHC
│   │   ├── fixture-loader.ts             # YAML parse + validation
│   │   └── reporter.ts                   # console + JSON
│   └── configs/                          # modul-specifik
│       ├── analyzer.ts                   # fält → judge-strategi
│       └── matcher.ts                    # MHC + ranking + reasoning
├── scripts/
│   ├── run-analyzer.ts                   # 20-rads wrapper runt core/runner
│   └── run-matcher.ts                    # 20-rads wrapper runt core/runner
├── runs/                                 # gitignored
│   └── 2026-04-16-14-30-analyzer.json
├── thresholds.yaml                       # per-fält thresholds (grönt/gult/rött)
└── README.md
```

**Flow per körning:**

1. Scripts-wrapper läser modul-config + fixtures
2. `core/runner`: för varje fixture, kör AI-modul (via existerande `callClaude` + `analyzeRfp`/`matchConsultants`) → output
3. För varje fält i outputen: välj judge (exact / haiku-equiv / sonnet-mhc) enligt config, jämför mot golden
4. `core/metrics`: aggregera per fixture + overall
5. `core/reporter`: console-tabell + dump till `runs/<timestamp>-<modul>.json`

**Varför generisk från dag 1:** att lägga till `consultant-extractor`-evals eller evals för function 2 (RFP-utvärdering för kommuner) ska vara "ny config + nya fixtures" — ingen harness-omskrivning.

## Fixture-format

### Analyzer fixture

Placering: `evals/fixtures/analyzer/<id>.yaml`

```yaml
id: ted-2026-it-consulting-stockholm
source_url: https://ted.europa.eu/udl?uri=TED:...
notes: |
  Stockholms stad, digital transformation, 18 mån uppdrag.
  Valet av denna RFP: flera tydliga ska-krav + specifik branschdomän.

rfp_text: |
  Stockholms stad inbjuder härmed till upphandling av...
  [hela RFP-texten, kan vara lång]

golden:
  title: "Strategisk IT-rådgivning för digital transformation"
  client: "Stockholms stad"
  deadline: "2026-06-15"
  domain: "IT"
  summary: "Stockholms stad söker konsult för att leda digital transformation över 18 månader med fokus på molnmigration och medborgartjänster."
  requirements:
    - category: "Kompetens"
      description: "Minst 5 års erfarenhet av digital transformation i offentlig sektor"
      priority: "must"
    - category: "Språk"
      description: "Flytande svenska"
      priority: "must"
    - category: "Metod"
      description: "Erfarenhet av agila metoder (Scrum/SAFe)"
      priority: "should"
  evaluationCriteria:
    - name: "Kvalitet"
      weight: 60
      description: "Metod och leveransplan"
    - name: "Pris"
      weight: 40
      description: "Timarvode"
  requiredCompetencies: ["digital transformation", "molnmigration", "offentlig sektor"]
  estimatedScope: "18 månaders uppdrag, halvtid (~50%)"
  redFlags:
    - "Inget angivet om befintliga system"
    - "Vagt formulerat om förväntade leveranser"
```

### Synthetic consultant pool

Placering: `evals/fixtures/consultants/synthetic-pool.yaml`

Delad pool av 8-10 syntetiska konsulter. Matcher-fixtures refererar via `id`. Varje konsult har:

- Unikt `id` (e.g. `anna_svensson`)
- `cv_text` — rått CV (markdown eller plain text, ska variera i format)
- `parsed_profile` — pre-extraherad strukturerad JSON (för isolated matcher-mode)
- `match_profile` — metadata om avsiktlig spridning

```yaml
consultants:
  - id: anna_svensson
    match_profile:
      intent: "strong-match-it-consulting"     # dokumentation, ej logik
      cv_format: "structured-bullets"
      must_haves_demonstrated: ["digital_transformation_5yr", "public_sector", "svenska"]
    cv_text: |
      Anna Svensson — Senior Management Consultant
      12 års erfarenhet inom digital transformation...
      [syntetisk CV]
    parsed_profile:
      name: "Anna Svensson"
      yearsExperience: 12
      competencies: ["digital transformation", "molnmigration", "offentlig sektor"]
      projects:
        - client: "Stockholms stad"
          role: "Lead konsult"
          years: "2019-2024"
          description: "Ledde molnmigration för 12 förvaltningar..."
      # ... hela ConsultantProfile-schemat

  - id: bertil_larsson
    match_profile:
      intent: "non-match-junior"
      cv_format: "narrative"
      must_haves_demonstrated: []
    cv_text: |
      Bertil Larsson, junior utvecklare...
    parsed_profile:
      name: "Bertil Larsson"
      yearsExperience: 2
      competencies: ["React", "TypeScript"]

  # ... 8-10 totalt med spridning:
  #   - 2-3 strong-match (ska vara top-K)
  #   - 2-3 close-call (ska vara på gränsen — testar matcher:s diskrimination)
  #   - 2-3 non-match (ska ALDRIG vara top-K trots starka CV:n i fel domän)
  #   - 1-2 med stökig CV-formatering (narrativ, tabeller, inkonsekventa rubriker)
```

### Matcher fixture

Placering: `evals/fixtures/matcher/<id>.yaml`

```yaml
id: it-consulting-stockholm-match
analyzer_fixture: ted-2026-it-consulting-stockholm    # återanvänder RFP + requirements

consultant_ids:
  - anna_svensson
  - bertil_larsson
  - cecilia_berg
  - david_holm
  - eva_jonsson

golden:
  evaluation_method: "top_k"         # "top_k" | "full_rank" (framtida)
  expected_top_k:
    k: 2
    must_contain: ["anna_svensson", "cecilia_berg"]

  # Must-Have Coverage förväntningar:
  # För varje konsult som matcher placerar i top-K, ska Sonnet-judge verifiera
  # att CV:n demonstrerar varje `must`-krav i RFP. Detta är oberoende av
  # expected_top_k — fångar om matcher rankade fel person i top-K.
  must_have_coverage:
    enabled: true
    judge_model: "claude-sonnet-4-6"
    required_threshold: 0.80         # minst 80% av ska-krav ska vara täckta per top-K konsult

  reasoning_rubric: |
    För varje konsult som matcher rankar som top-K: är motiveringen
    (a) konkret (refererar specifika CV-punkter),
    (b) sammankopplad med RFP-kraven,
    (c) fri från hallucination?
    Haiku dömer som: "good | weak | bad".

mode: "isolated"                     # "isolated" | "end_to_end" (framtida)
```

## Judging-strategi

| Judge | Modell | Använder | Kostnad/dom |
|---|---|---|---|
| `exact` | — | enum, ISO-datum, numeriska värden | $0 |
| `haiku-equiv` | Haiku 4.5 | fält-ekvivalens (title, summary, requirement-description, kompetens-namn) | ~$0.0001 |
| `sonnet-mhc` | Sonnet 4.6 | must-have coverage per (krav × konsult) | ~$0.001 |

**Varför Sonnet för MHC:** ska-krav-matchning kräver nyanserad bedömning av implicita bevis ("Scrum Master på SEB 2019-2024" → demonstrerar "5 års agil erfarenhet"?). Haiku missar ofta implicita kopplingar. Sonnet är pålitlig här — validerat i tidigare M0-M3-arbete.

**Judge-prompt-principer:**

- Strikt JSON-output via existerande `callClaude` + Zod-schema
- Deterministisk `temperature: 0`
- Prompten innehåller både golden och actual, frågar efter explicit `{match: true | false, reason: "..."}`
- För MHC: `{demonstrated: boolean, evidence: "citat från CV", confidence: "high|medium|low"}`

**Haiku-judge kalibrering (första körning):** innan vi litar på Haiku-judge dömer Stefan manuellt 20-30 domar från första körningen → mäter judge-agreement. Om <90% agreement, stram prompten eller byt till Sonnet för det fältet.

## Metrics

### Analyzer — per fixture + aggregerat

| Fält | Judge | Metric |
|---|---|---|
| `title` | haiku-equiv | 0/1 |
| `client` | exact | 0/1 |
| `deadline` | exact | 0/1 |
| `domain` | exact enum | 0/1 |
| `summary` | haiku-equiv | 0/1 |
| `requirements[]` | haiku-equiv per par | **recall, precision, F1** |
| `evaluationCriteria[]` | haiku-equiv per par + vikts-diff | recall, precision, mean weight error |
| `requiredCompetencies[]` | haiku-equiv per par | recall, precision, F1 |
| `estimatedScope` | haiku-equiv | 0/1 |
| `redFlags[]` | haiku-equiv per par | recall, precision |

**Requirements-matchning är nyckel-metricen:**

- För varje golden requirement: frågar Haiku "finns detta krav i outputen? svara med matchande index eller null"
- Recall = antal golden som hittades / totalt golden
- Precision = antal output-items som matchar golden / totalt output
- F1 = 2·R·P / (R+P)

**Priority-korrektur:** utöver match-existens, verifierar vi att `priority` är samma (must/should/nice). Felaktig priority rapporteras separat — ett ska-krav som klassats som should är värre än ett saknat krav.

### Matcher — per fixture + aggregerat

**Primary: Must-Have Coverage (MHC)**

```
För varje konsult i matcher-output top-K:
  För varje requirement i RFP med priority="must":
    sonnet-judge: demonstrerar CV:n detta krav?
  MHC_consultant = (antal demonstrerade) / (antal must-krav)

MHC_fixture = mean(MHC_consultant för alla top-K)
MHC_pass = alla top-K konsulter >= required_threshold (default 0.80)
```

Rapportering: `MHC: 0.87 (Anna 1.00, Cecilia 0.75)` — per-konsult-siffror för att pin-pointa var det brister.

**Secondary: Ranking quality**

- `hit@K` — är alla `must_contain` i output top-K? Binärt pass/fail.
- (Framtida: full-rank → Spearman rank correlation mot golden.)

**Tertiary: Reasoning quality**

- För varje top-K konsult: Haiku-judge på motiveringen → `good | weak | bad`
- Rapporterar distribution per fixture (e.g. "3 good, 1 weak, 0 bad")

**Varför MHC är primary, inte ranking:** hit@K mäter "matcher höll med golden-annotatorn". MHC mäter "matcher valde konsulter som faktiskt uppfyller RFP:ns ska-krav". Om MHC passerar men hit@K failar → golden-set har fel (annotator valde suboptimal konsult). Om hit@K passerar men MHC failar → matcher valde rätt person enligt golden, men den personen uppfyller ändå inte kraven (= matcher är oenig med sig själv eller golden är skev). Båda passerar = hög conviction.

### Overall-rapport

```
$ npm run eval:matcher

Running 5 matcher fixtures (mode: isolated)...

  ✓ it-consulting-stockholm
      MHC: 0.90 (Anna 1.00, Cecilia 0.80)
      hit@2: PASS
      reasoning: 2 good, 0 weak, 0 bad

  ✗ hr-advisory-goteborg
      MHC: 0.55 (David 0.60, Eva 0.50)         ← FAIL (threshold 0.80)
      hit@2: PASS
      reasoning: 1 good, 1 weak, 0 bad
      ↳ Must-have saknas: "erfarenhet av HR-transformation i offentlig sektor"

  ... (3 st till)

Overall:
  MHC pass-rate: 3/5 (60%)
  hit@K pass-rate: 5/5 (100%)
  reasoning: 8 good, 2 weak, 0 bad

Result: evals/runs/2026-04-16-14-30-matcher.json
```

**Thresholds** (`evals/thresholds.yaml`, konfigurerbar):

```yaml
analyzer:
  requirements_f1:
    green: 0.85
    yellow: 0.70
  evaluationCriteria_f1:
    green: 0.80
    yellow: 0.65
matcher:
  mhc:
    green: 0.90
    yellow: 0.80        # = required_threshold
  hit_at_k:
    green: 1.00
    yellow: 0.80
```

## Invocation & output

**CLI-kommandon:**

```bash
npm run eval:analyzer             # kör alla analyzer-fixtures
npm run eval:matcher              # kör alla matcher-fixtures (mode: isolated)
npm run eval:analyzer -- --fixture ted-2026-it-consulting    # enskild fixture
npm run eval:matcher -- --verbose                            # per-fält-detaljer
```

**Miljö:**

- Kräver `ANTHROPIC_API_KEY` i `.env.local`
- Existerande `callClaude()` används — inga nya retry/timeout-policies
- Judge-anrop går via `callClaude()` med egna prompts + schemas

**Output:**

- Konsoll: rapport som ovan, färgkodad enligt thresholds
- JSON-dump: `evals/runs/YYYY-MM-DD-HH-MM-<modul>.json` — hela eval-körningens råa data + metrics, för senare diff/trend-analys

## Error handling

| Scenario | Beteende |
|---|---|
| LLM-call fail (även efter `callClaude` retries) | Markera fixture som `error` (ej `fail`), fortsätt med resten |
| Judge-call fail (unparseable output) | Markera fält-dom som `judge_error`, räkna ej i metrics, flagga i rapport |
| Malformed YAML-fixture | Fail early med filnamn + radnummer |
| Saknade golden-fält | Fail fixture med tydligt meddelande ("missing `golden.requirements`") |
| RFP-text > prompt-budget | Varna + skippa fixture |
| Saknad `ANTHROPIC_API_KEY` | Fail omedelbart innan någon fixture körs |
| Saknad consultant-referens i matcher-fixture | Fail fixture ("unknown consultant_id: xyz") |

## Skalbarhet

**Ny modul (t.ex. `consultant-extractor` eller framtida function 2):**

1. Lägg till fixtures i `evals/fixtures/<modul>/`
2. Skapa `evals/harness/configs/<modul>.ts` — deklarera fält → judge-strategi + metrics
3. Lägg till npm-script som wrapper (20 rader runt `core/runner`)
4. Ingen harness-ändring

**Nya judges:** lägg till funktion i `core/judges.ts` — existerande signatur `(golden, actual) => { match: boolean, confidence?: number }`. Configs refererar till judge-namn.

**Nya metrics:** lägg till funktion i `core/metrics.ts` — används av config.

**Nya funktioner i produkten (function 2 — kommun-utvärdering):** samma harness, nya fixtures + configs. Golden-set-strategin (RFP + förväntad output + LLM-judged correctness) är agnostisk mot problem-domän.

## Öppna frågor

Inga för MVP-implementationen. Följande beslut medvetet deferrade till framtida iterationer:

- **End-to-end matcher-mode** — fixture-formatet stöder det (`mode: "end_to_end"`), men runner-implementation skjuts. Aktiveras när vi vill mäta extractor+matcher som pipeline.
- **Full-rank för matcher** — `evaluation_method: "full_rank"` finns i schemat, runner-stöd skjuts. Aktiveras när vi har riktig pilot-feedback som kalibreringspunkt.
- **Historisk trend-analys** — varje körning dumpas som JSON, men diff/trend-script är separat framtida arbete.
- **CI-integration** — GitHub Action på PR som rör AI-filer. Beslut skjuts till vi sett hur ofta vi faktiskt ändrar prompts i praktiken.

## Antaganden

- Stefan skriver själv första golden-annotationerna (~30-40 min per analyzer-fixture, ~15 min per matcher-fixture) — estimerad MVP-annotation-budget: 4-6 timmar total
- Haiku 4.5 som judge är pålitlig nog för fält-ekvivalens — valideras genom 20-30 manuella dom-checks i första körningen
- Sonnet 4.6 som judge för MHC är pålitlig baserat på erfarenhet från M0-M3
- Kostnad per komplett eval-körning < $0.20 (försumbar)
- `evals/runs/` är gitignored — lokal historik, ej delad
- Test-fixturer är committed till repot — delas mellan bidragsgivare
