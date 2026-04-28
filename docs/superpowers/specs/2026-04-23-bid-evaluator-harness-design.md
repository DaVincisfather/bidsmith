# Bid-Generator Evaluator + Harness-Backlog

**Datum:** 2026-04-23
**Status:** Godkänd design för punkt A. Punkt B/C/D är backlog-stubbar.
**Inspiration:** [Anthropic — Harness Design for Long-Running Applications](https://www.anthropic.com/engineering/harness-design-long-running-apps)
**Beroende:** Implementationen startar efter att PPTX textbox-polish (se `memory/project_pptx_textbox_polish.md`) är mergad till master.

---

## Bakgrund

Artikeln beskriver en generator-evaluator-arkitektur där en separat agent granskar generatorns output mot testbara kontrakt. Kärninsikten: modeller berömmer sitt eget arbete även när kvaliteten är medelmåttig — oberoende evaluering krävs.

Agentic Dealflow har idag:
- En **bid-generator** som kör 6 AI-bundles parallellt (`src/lib/bid-generator/index.ts` via `generateAllSections()`)
- En **eval-harness** för offline golden-fixture-testing av `analyzer` och `matcher` (`evals/`)
- **Ingen evaluator** som granskar bid-output

Denna spec designar en offline evaluator för bid-output (punkt A), och dokumenterar tre fler utvecklingspunkter från artikeln som backlog (B/C/D).

---

## A. Bid-Generator Offline Evaluator (godkänd design)

### Mål

En ny modul i eval-harness som kör `generateAllSections()` mot en RFP-fixture och scorar output mot tre dimensioner. Ska följa befintligt `analyzer`/`matcher`-mönster exakt.

### Tre dimensioner

1. **Requirement coverage** — täcker bidet alla ska/bör-krav från RFP:en? (Sonnet-MHC-liknande judge.)
2. **Faktakorrekthet / hallucinationsdetektor** — refererar bidet kompetenser, projekt eller siffror som inte finns i källmaterialet? (Sonnet-judge som jämför claims mot CV:n + RFP.)
3. **Struktur & completeness** — alla förväntade sektioner present (cover + 3 deterministic + bundles som flattenas via `BidSection[]`), rätt slot-format, inga tomma fält, text-längd inom intervall. (Deterministiska asserts, ingen AI.)

Ton/stil (dimension 4 i brainstormet) är explicit utanför scope — läggs till när 1-3 är kalibrerade och vi sett output gå fel på sätt som motiverar det.

### Arkitektur

```
evals/
├── fixtures/bid-generator/
│   ├── _stub.yaml                 # pipeline-verifiering
│   └── <rfp-id>.yaml              # refererar analyzer-fixture + consultant_ids
├── harness/configs/
│   └── bid-generator.ts            # judge-mapping + metrics
└── scripts/
    └── run-bid-generator.ts        # CLI-wrapper (mönstermall: run-analyzer.ts)
```

Inga ändringar i `evals/harness/core/`. Nya judges läggs till `core/judges.ts` om de inte kan uttryckas med befintliga.

### Flöde

1. Loader läser fixture → hämtar refererad analyzer-fixture + consultant-fixtures → bygger `BidContext` enligt `src/lib/bid-generator/context.ts`
2. Runner anropar `generateAllSections(ctx)` → får `BidSection[]` tillbaka
3. Evaluator kör tre dimensioner parallellt mot output
4. Reporter: färgmärkt konsol-rapport (PASS/WARN/FAIL per metric) + JSON-dump till `evals/runs/<timestamp>-bid-generator.json`

**Vad vi inte rör:** `src/lib/bid-generator/` är black-box för evaluatorn. Det låter oss iterera på evaluator-prompts utan regressioner i produktionsflödet.

### Fixtureformat

```yaml
id: <rfp-slug>
analyzer_fixture: <analyzer-fixture-id>   # återanvänder RFP + requirements-annotation
consultant_ids: [c1, c2, c3]              # 3-4 konsulter för teamet
golden:
  mandatory_sections:                      # struktur-dimension
    - cover
    - understanding
    - phases
    - quality
    - requirement_matrix
    - team
    - reference
    - confidentiality
    - certifications
  requirement_coverage:                    # coverage-dimension
    must_cover: [req_id_1, req_id_2]       # krav som MÅSTE täckas (pass=1 endast om alla covered)
    should_cover_threshold: 0.80           # soft target för övriga requirements (warn-nivå)
  hallucination_allowlist:                 # hallucination-dimension
    - "ISO 27001"                          # substring-match; termer som får förekomma trots att de inte finns i källmaterial
```

### Metrics

**Coverage:**
- `coverage.must_cover_recall` — andel `must_cover`-requirements som demonstreras i bid-text (pass=1 endast om 1.0)
- `coverage.should_cover_recall` — andel övriga requirements demonstrerade (warn om under `should_cover_threshold`)
- `coverage.pass` — 1 om `must_cover_recall == 1.0`, annars 0

**Hallucination:**
- `hallucination.count` — antal unsupported claims funna
- `hallucination.pass` — 1 om count = 0, annars 0

**Struktur:**
- `structure.all_sections_present` — 1 om alla förväntade sektioner levererade (jämfört mot fixturens `mandatory_sections`)
- `structure.slot_format_valid` — 1 om alla sektioner matchar v2 slot-format
- `structure.empty_fields` — antal tomma textfält
- `structure.pass` — 1 om alla tre ovan är gröna

### Judges

| Judge | Modell | Användning |
|---|---|---|
| `exact` | — | Struktur-asserts (befintlig) |
| `bidCoverageJudge` | Sonnet 4.6 | Requirement coverage (ny, mönster från `sonnetMhcJudge`) |
| `hallucinationJudge` | Sonnet 4.6 | Claim-extraction + verifiering mot källa (ny) |

### Kostnad per körning

Grov estimate per bid-fixture:
- ~30 requirements × coverage-judge ≈ $0.03
- ~10 claims × hallucination-judge ≈ $0.02
- Bid-generation själv (Opus 4.7) ≈ $0.20-0.40

Totalt **~$0.25-0.45 per körning**. Acceptabelt för manuell körning, måste revideras om vi kör i CI.

### Kalibreringsflöde (artikelns "weak QA → iterate")

Från artikeln: evaluatorn är naivt snäll out-of-the-box. Den måste kalibreras genom att iterera prompten mot divergeringspunkter i logs.

1. **Pipeline-verifiering:** Kör `_stub`-fixture. Verifierar bara att runner/loader/reporter hänger ihop.
2. **Annotera första riktiga fixturen:** ~45-60 min manuellt. Välj RFP från befintlig analyzer-fixture, markera `must_cover` + `hallucination_allowlist`.
3. **Första körningen:** Jämför judge-output med egen bedömning per dimension.
4. **Iterera prompten** i `evals/harness/core/judges.ts` tills >90% av bedömningar matchar manuell annotering.
5. **Bredda fixture-poolen:** 2-3 fixtures till för conviction.

### Implementation-ordning (ingen skarpt plan än — skrivs i separat writing-plans-pass)

1. Struktur-dimension (deterministisk) + pipeline end-to-end med `_stub`
2. Coverage-judge + kalibrering på första riktiga fixture
3. Hallucination-judge + kalibrering
4. Bredda fixture-pool

Estimerad total tid: 6-9 timmar, dvs 3-6 sessions för Stefan.

### Out-of-scope för A

- Runtime-integration i `src/lib/bid-generator/` (se punkt C nedan)
- Ton/stil-dimension
- Full-rank evaluation eller end-to-end-mode över flera RFP:er
- CI-integration
- Trend-visualisering i Dashboard

---

## B. Sprint-kontrakt för bid-generator (backlog-stub)

### Idé

Innan Opus genererar bidet: generera explicit krav-checklista från RFP:en (testbara kriterier i artikelns mening). Evaluator från punkt A betar sedan av samma checklista efteråt. Formaliserar kontraktet mellan generator och evaluator.

### Varför intressant

Artikelns exempel använder 27+ testbara kriterier per sprint. Idag är `analyzer.requirements[]` närmast en sån checklista, men den är beskrivande — inte skriven som "bidet måste demonstrera X". Omformulering kunde förbättra både generator-prompt och evaluator-prompt.

### Öppna frågor

- Ska kontraktet genereras av analyzer (ny output-fält) eller av en ny "contract-generator"-modul?
- Tillräckligt värde för egen modul, eller bättre att låta evaluatorn härleda implicit från `analyzer.requirements[]`?
- Hur hanteras kriterier som spänner över flera sektioner (t.ex. "ska visa förståelse för säkerhetsklass SUA")?

### Nästa steg

Brainstormas separat när A är i produktion och vi sett vilka coverage-problem som faktiskt förekommer.

---

## C. Runtime evaluator (backlog-stub, efterträdare till A)

### Idé

Lyft ut judges från A och integrera dem i `src/lib/bid-generator/` så varje riktig bid-generering produceras med evaluator-pass. Resultat sparas i DB, visas i Dashboard.

### Varför intressant

A ger conviction i utveckling men inget skydd i produktion. Runtime-evaluator ger Stefan signal innan han läser bidet att något är uppenbart fel (saknade krav, hallucinationer).

### Förutsättning

Judges i A måste vara stabilt kalibrerade (>90% match med manuell bedömning) innan runtime-integration är meningsfull. Annars ger runtime-evaluator falska larm och Stefan börjar ignorera den.

### Öppna frågor

- Synkront (blockerar sparande tills evaluator klar) eller asynkront (evaluator körs i bakgrunden, skriver till DB när klar)?
- Latency-budget? Dagens bid-generation är redan minutlång.
- Hur visas fail/warn i Dashboard — gating, notis, eller bara indikator?
- Påverkan på kostnad per bid (~$0.05 extra per generering)?

### Nästa steg

Designas efter att A är kalibrerad på minst 3 fixtures.

---

## D. Modell-ladder-review (backlog-stub, processförändring)

### Idé

Artikelns observation: när nya modeller landar ska scaffolding omprövas. Opus 4.7 kan göra saker som Sonnet 4.6 inte kunde. Systematisk nedtrappning från Opus → Sonnet → Haiku där det funkar, mätt mot eval-harness.

### Varför intressant

- Direkt kostnadseffekt — LLM-kostnad < 30% av intäkt är mål (`memory/project_pricing_model.md`)
- Eval-harness ger redan conviction-mätning för analyzer/matcher. Post-A får vi det även för bid-generator.
- Ingen kod krävs initialt — det är en återkommande review-process.

### Första kandidat

Redan idag: testa om Sonnet 4.7 (när den landar) klarar bid-generation lika bra som Opus 4.7, mätt via eval-harness. Cost-delta är ~5x.

### Nästa steg

Formaliseras som återkommande routine (t.ex. `/schedule` en modell-ladder-review efter varje större modell-release). Inte en spec som kräver implementation — snarare en checklista.

---

## Beslut att spara från dagens session

- Punkt A är godkänd design. Implementation startar efter PPTX-polish-merge.
- Punkt B/C/D är backlog-stubbar — ingen spec-detalj förrän de prioriteras upp.
- Ingen kod ändras i `src/lib/bid-generator/` i A. Evaluator konsumerar generator som black-box.
- Dimension 4 (ton/stil) avsiktligt utanför scope för A.
- Kalibreringsloopen (punkt "weak QA → iterate") är där 80% av värdet sitter — därför lämpar sig inte parallellkörning med PPTX-polish.
