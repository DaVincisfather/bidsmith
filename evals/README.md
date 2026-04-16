# AI Eval Harness

Verifierar träffsäkerhet i `rfp-analyzer` och `consultant-matcher` via ett fixerat golden set av YAML-fixtures. MVP-primärmål: conviction på att modellen matchar konsulter vars CV:n demonstrerar RFP:ns ska-krav.

## Köra evals

```bash
# Kräver ANTHROPIC_API_KEY i .env.local
source .env.local

npm run eval:analyzer                        # alla analyzer-fixtures
npm run eval:matcher                         # alla matcher-fixtures (mode: isolated)
npm run eval:analyzer -- --fixture _stub     # enskild fixture
```

Output:
- Konsollen: färgmärkt rapport (PASS/WARN/FAIL per metric)
- `evals/runs/<timestamp>-<modul>.json`: komplett run-dump för senare diff/trend

## Lägga till en ny analyzer-fixture

1. Välj en RFP från TED, Opic eller liknande källa. Loggbok: lägg `source_url` i fixturen.
2. Kopiera mallen `evals/fixtures/analyzer/_stub.yaml` till `evals/fixtures/analyzer/<id>.yaml` (id = slugified RFP-namn).
3. Klistra in hela RFP-texten under `rfp_text`.
4. Annotera `golden` manuellt — gå igenom RFP:n och dokumentera vad modellen *borde* producera:
   - `title`, `client`, `deadline`, `domain` — triviala
   - `summary` — 1-2 meningar, vad uppdraget gör
   - `requirements[]` — varje ska/bör-krav, korrekt kategoriserat med priority
   - `evaluationCriteria[]` — vikter ska summa 100
   - `requiredCompetencies[]` — explicit nämnda kompetenser
   - `estimatedScope` — omfattning (månader + procent + budget om angivet)
   - `redFlags[]` — otydligheter, risker, kravkombinationer
5. Kör `npm run eval:analyzer -- --fixture <id>` och granska rapporten.

Annotationstid: ~30-40 min per fixture. Svårast: `requirements[]` (lätt att missa implicita krav).

## Lägga till en ny matcher-fixture

1. Identifiera en analyzer-fixture att återanvända (samma RFP).
2. Välj 4-6 konsulter från `evals/fixtures/consultants/synthetic-pool.yaml`. Spridning:
   - 1-2 "strong-match" (ska hamna top-K)
   - 1-2 "close-call" (testar matcher:s diskrimination)
   - 1-2 "non-match" (ska aldrig vara top-K)
3. Skapa `evals/fixtures/matcher/<id>.yaml`:
   - `analyzer_fixture`: id på analyzer-fixture
   - `consultant_ids`: listan
   - `golden.expected_top_k`: vilka K ska vara i toppen (ordning spelar ingen roll)
   - `golden.must_have_coverage.required_threshold`: oftast 0.80
4. Kör `npm run eval:matcher -- --fixture <id>`.

Annotationstid: ~15 min per fixture (största arbetet: välja konsultpool med rätt spridning).

## Utöka syntetisk konsultpool

Redigera `evals/fixtures/consultants/synthetic-pool.yaml`. Lägg till 1-2 konsulter per körning tills poolen har 8-10 profiler. Viktigt att:

- `cv_text` varierar i format: strukturerade bullets, narrativ, tabeller
- `match_profile.intent` dokumenterar *vad* konsulten är tänkt att testa
- `parsed_profile` motsvarar exakt vad `consultant-extractor` *borde* ha extraherat från `cv_text`

## Kalibrering av Haiku-judge

Första gången du kör en ny fixture: manuellt verifiera 20-30 haiku-equiv-domar i JSON-rapporten (fältet `judgments[]` per fixture i `evals/runs/<timestamp>.json`). 

- Om >90% av domarna känns rätt → Haiku-judge är pålitlig för det fält-paret.
- Om <90% → ändra prompten i `evals/harness/core/judges.ts` (`haikuEquivJudge`), eller migrera fältet till `sonnetMhcJudge`-mönster.

## Judges

| Judge | Modell | Används för | Ungefärlig kostnad/dom |
|---|---|---|---|
| `exact` | — | enum, ISO-datum, numeriska värden, strikt string-jämförelse | $0 |
| `haiku-equiv` | Haiku 4.5 | fält-ekvivalens (title, summary, requirement-description, kompetensnamn) | ~$0.0001 |
| `sonnet-mhc` | Sonnet 4.6 | must-have coverage per (RFP-krav × konsult-CV) | ~$0.001 |

Totalkostnad per full eval-körning: < $0.20 (negligerbart vid nuvarande pris).

## Metrics

**Analyzer:**
- `requirements.recall/precision/f1` — kan vi fånga alla golden-krav?
- `evaluationCriteria.recall/precision/f1` — och utvärderingskriterier?
- `title`, `client`, `domain` — scalars (0/1)

**Matcher:**
- `mhc.<id>` — hur stor andel av RFP:s ska-krav demonstrerar denna top-K-konsult?
- `mhc.mean` — genomsnittlig MHC över alla top-K
- `mhc.pass` — 1 om *alla* top-K ≥ threshold, annars 0
- `hit_at_k` — binärt: innehåller top-K alla `must_contain` från golden?
- `reasoning.good_ratio` — andel motiveringar som bedömdes "good" av Haiku

**Varför MHC är primär matcher-metric (inte hit@K):** MHC mäter om matcher valde konsulter som faktiskt uppfyller kraven. hit@K mäter bara om matcher höll med golden-annotatorn. Båda i grönt = hög conviction.

## Struktur

```
evals/
├── fixtures/
│   ├── analyzer/        # per-RFP YAML + full golden
│   ├── matcher/         # refererar analyzer-fixture + consultant_ids + MHC-förväntan
│   └── consultants/     # delad pool av syntetiska CV:n
├── harness/
│   ├── core/            # domän-agnostisk: runner, judges, metrics, reporter, loader
│   └── configs/         # modul-specifik: analyzer.ts, matcher.ts
├── scripts/             # CLI-wrappers: run-analyzer.ts, run-matcher.ts
├── runs/                # gitignored — per-körning JSON-dumps
├── thresholds.yaml      # grönt/gult/rött-gränser
└── README.md
```

## Lägga till en ny modul-eval (framtida)

1. Lägg fixtures i `evals/fixtures/<modul>/`
2. Skapa `evals/harness/configs/<modul>.ts` — deklarera fält-till-judge-mapping + metrics-funktioner
3. Skapa `evals/scripts/run-<modul>.ts` — 20-rads wrapper (se `run-analyzer.ts` som mall)
4. Lägg till `"eval:<modul>": "tsx evals/scripts/run-<modul>.ts"` i package.json

Ingen ändring i `core/` krävs.

## Kända MVP-begränsningar

- `_stub`-fixtures är bara för pipeline-verifiering — ge ingen riktig conviction
- End-to-end matcher-mode (`mode: end_to_end`) är inte implementerat ännu
- Full-rank evaluation method är i schemat men inte stödd i runnern
- Ingen CI-integration — eval:s körs manuellt
- Ingen historisk trend-visualisering
