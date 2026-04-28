# AI Eval Harness

Verifierar träffsäkerhet i `rfp-analyzer`, `consultant-matcher` och `bid-generator` via ett fixerat golden set av YAML-fixtures. MVP-primärmål: conviction på att modellen matchar konsulter vars CV:n demonstrerar RFP:ns ska-krav.

## Köra evals

```bash
# Kräver ANTHROPIC_API_KEY i .env.local
source .env.local

npm run eval:analyzer                        # alla analyzer-fixtures
npm run eval:matcher                         # alla matcher-fixtures (mode: isolated)
npm run eval:bid-generator                   # alla bid-generator-fixtures
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

## bid-generator-evaluator

Offline-evaluator för `generateAllSections()` — tre dimensioner:

1. **Struktur** (deterministisk): alla obligatoriska sektioner finns, giltiga v2-slot-format, inga tomma required-fält.
2. **Coverage** (Sonnet): per-krav-check att anbudet visar hur kravet uppfylls.
3. **Hallucination** (Sonnet): extraktion av faktapåståenden + källverifiering mot RFP + CV.

### Köra

```bash
npm run eval:bid-generator                       # alla fixtures
npm run eval:bid-generator -- --fixture <id>    # enskild fixture
```

Varje körning skriver `evals/runs/<timestamp>-bid-generator.json` och printar en thresholdad konsoll-rapport.

### Kostnad

Cirka **$0.25–0.45 per fixture** (Opus-generering + Sonnet-judges). OK för manuella körningar; revidera innan CI-integration.

### Kalibreringsflöde (första riktiga fixturen)

Judges är medvetet naiva out-of-the-box — de behöver kalibreras mot en riktig RFP innan metrics blir tillförlitliga.

1. Välj en analyzer-fixture du redan annoterat (t.ex. en TED-RFP).
2. Kopiera `evals/fixtures/bid-generator/_stub.yaml` till `evals/fixtures/bid-generator/<rfp-id>.yaml`. Sätt `golden.hallucination_allowlist` till de certifieringar/standarder som ditt företag alltid hävdar (t.ex. `["ISO 27001", "ISO 9001"]`). Annotera även `golden.requirement_coverage.must_cover` med krav-ID:n som *måste* adresseras (t.ex. `["req_0", "req_3"]`) — fältet är reserverat för framtida hård gating; nuvarande version rapporterar bara aggregerad `coverage.recall`.
3. Kör evaluatorn: `npm run eval:bid-generator -- --fixture <rfp-id>`
4. Öppna JSON-rapporten. För varje judge-fält med `match: false`, läs `evidence` och avgör: hade judgen rätt?
5. Om judgen gjorde fel — redigera prompten i `evals/harness/core/judges.ts` och kör om.
6. Stoppa när ≥90% av domarna matchar din manuella läsning. (Specens "weak QA → iterate"-loop.)

Räkna med ~45–60 minuter på första kalibreringspasset per fixture.

### Arkitekturnoteringar

- `scoredConsultants` och `goNoGoResult` i bid-context är *stubbade* (rangordnar efter input-ordning, fast "go"-rekommendation). Evaluatorn bedömer bid-generator-output, inte uppströms matcher/go-no-go-pipelinen.
- `must_cover`-ID:n använder syntetiska identifierare `req_<index>` baserat på ordningen av krav i analyzer-fixturen.
- Hallucination-judgen använder en `allowlist` för kända sanna påståenden (t.ex. ISO-certifieringar) som inte skulle dyka upp i RFP/CV-källmaterialet.

### Out of scope (se spec för backlog)

- Tone/style-dimension
- Runtime-evaluator-integration (planerad som punkt C)
- CI-integration
- Sprint-contract / pre-generation-testbara kriterier (planerad som punkt B)

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
| `bid-coverage` | Sonnet 4.6 | per RFP-krav: täcks det av anbudsutkastet? | ~$0.0025 |
| `bid-hallucination` | Sonnet 4.6 | extraherar faktapåståenden från anbud + verifierar mot källa (RFP+CV) | ~$0.01 per anbud |

Totalkostnad per full eval-körning: < $0.20 för analyzer + matcher (negligerbart). bid-generator ändrar profilen — räkna ~$0.25–0.45 per fixture (Opus-generering + Sonnet-judges).

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
│   ├── bid-generator/   # refererar analyzer-fixture + must_cover + hallucination_allowlist
│   └── consultants/     # delad pool av syntetiska CV:n
├── harness/
│   ├── core/            # domän-agnostisk: runner, judges, metrics, reporter, loader
│   └── configs/         # modul-specifik: analyzer.ts, matcher.ts, bid-generator.ts
├── scripts/             # CLI-wrappers: run-analyzer.ts, run-matcher.ts, run-bid-generator.ts
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
