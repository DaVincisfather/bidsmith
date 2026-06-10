# Fas 1 — A/B-harness Opus 4.8 vs Fable 5: Implementationsplan

> **För agentiska arbetare:** OBLIGATORISK SUB-SKILL: Använd superpowers:subagent-driven-development
> (rekommenderat) eller superpowers:executing-plans för att exekvera denna plan task-för-task.
> Steg använder checkbox-syntax (`- [ ]`) för spårning.

**Mål:** Datadrivet beslut om `MODELS.writing` (Opus 4.8 vs Fable 5) via en permanent
jämförelserigg på **riktiga svenska förfrågningsunderlag från TED** — varje framtida
modellrelease körs genom samma jämförelse (`npm run eval:bid-compare`).

**Arkitektur:** Tre PR:ar. **PR A** bygger det riggen står på: 4 riktiga RFP-fixtures
(TED-underlag → markitdown → golden via granskad analyzer-output), utökad syntetisk
konsultpool, och eval-kalibreringen ur fas 0-backloggen (hallucination-judgens
datum/allokerings-blindspots, equiv-judgens strikthet, språk-som-kompetens,
overflow-metrik i harnessen). **PR B** bygger själva riggen: modell-override via env,
529-resiliens, parvis blind LLM-judge med positionsbyte, jämförelserunner som spawnar
barnprocess per modell, rapport- och blindgranskningsgenerator. **PR C** är beslutet:
körning, Stefans blindgranskning, beslutsrapport, ev. registerändring.

**Tech-stack:** TypeScript strict, vitest, tsx-skript i `evals/scripts/` (samma mönster som
`run-bid-generator.ts`), markitdown-js för dokumentparsning. Inga nya beroenden.

**Grind för hela fasen:** `npx vitest run` grönt efter varje task. Evals och
jämförelsekörningar kostar pengar — de körs bara vid de markerade grindarna
(Task 7, Task 16). Uppskattad totalkostnad för fasen: **$40–80**
(18 anbudsgenereringar på riktiga underlag + ~90 parvisa judge-anrop + fixture-grindar).

**Stefan-gates (manuella steg, kan inte automatiseras):**
1. Task 1: ladda ner underlag från upphandlingsplattformarna (kan kräva gratiskonto).
2. Task 6: granska/rätta golden-utkast mot källdokumenten.
3. Task 17: blindgranska N=10 utkastpar.

---

## Branchstrategi

- **PR A** — Task 0–8 på `fas-1a-fixtures-kalibrering`: fixtures + kalibrering.
  Grindas av full eval-körning på riktiga fixtures (Task 7).
- **PR B** — Task 9–15 på `fas-1b-compare-harness`, från `main` EFTER att PR A mergats:
  riggen. Helt offline-testbar (mockade SDK-anrop); ingen eval-grind.
- **PR C** — Task 16–18 på `fas-1c-beslut`, från `main` EFTER att PR B mergats:
  körning + beslut. Innehåller beslutsrapporten och ev. enradsändringen i `models.ts`.

En commit per avslutat task-steg enligt commitstegen.

---

## Valda upphandlingar (sökta i TED 2026-06-10, CPV 794xx/72224000, buyer-country=SWE)

| # | TED-id | Köpare | Uppdrag | Deadline | Roll i fixturesetet |
|---|---|---|---|---|---|
| 1 | [361188-2026](https://ted.europa.eu/sv/notice/-/detail/361188-2026) | Upphandlingsmyndigheten | Konsulttjänster inom verksamhetsanalys och digital design | öppen | Kärnprofil: verksamhetsanalys |
| 2 | [361465-2026](https://ted.europa.eu/sv/notice/-/detail/361465-2026) | Arbetsförmedlingen | Organisations- och ledarskapsutveckling | öppen | Klassisk managementkonsulting |
| 3 | [394206-2026](https://ted.europa.eu/sv/notice/-/detail/394206-2026) | Region Sörmland & Västmanland | Ramavtal verksamhetsstöd och administrativa tjänster | 2026-06-26 | Ramavtal (annan anbudsform) |
| 4 | [360200-2026](https://ted.europa.eu/sv/notice/-/detail/360200-2026) | Region Örebro län | Utredning av kränkande särbehandling | 2026-08-17 | Utredningsuppdrag, längst deadline |
| R1 | [362535-2026](https://ted.europa.eu/sv/notice/-/detail/362535-2026) | Formas | Impact evaluation, öppna utlysningar | 2026-06-27 | Reserv (möjligen engelskspråkig) |
| R2 | [357693-2026](https://ted.europa.eu/sv/notice/-/detail/357693-2026) | Chalmers | Affärsutveckling HealthTech | 2026-06-24 | Reserv |

Kriterier bakom urvalet: öppen deadline (dokumenten åtkomliga), svensk köpare,
managementkonsult-kärna (inte bygg/IT/kommunikation), spridning över uppdragstyp
(analys, ledarskap, ramavtal, utredning). Faller en bort (inloggningskrav, indragen
upphandling) ersätts den med reserv — 3 fixtures är minimum, 4 är målet.

---

## PR A — Fixtures & kalibrering

### Task 0: Förutsättningar

**Filer:** inga ändringar.

- [ ] **Steg 0.1:** Ny worktree: `git -C ~/projects/bidsmith-main worktree add ~/projects/bidsmith-fas1a -b fas-1a-fixtures-kalibrering bidsmith/main` + kopiera `.env.local` + `npm install`.
- [ ] **Steg 0.2:** `npx vitest run` → grönt (baslinje). Rött = STOPPA och rapportera.

### Task 1: Hämta underlagen (STEFAN-GATE)

**Filer:**
- Skapa: `evals/fixtures/source-docs/.gitkeep`
- Ändra: `.gitignore` (rad: `evals/fixtures/source-docs/*` + undantag `!**/.gitkeep`)

- [ ] **Steg 1.1:** Lägg till i `.gitignore`:

```
# Nedladdade upphandlingsdokument — committas inte (storlek); extraherad text hamnar i fixture-yaml
evals/fixtures/source-docs/*
!evals/fixtures/source-docs/.gitkeep
```

- [ ] **Steg 1.2 (Stefan):** För varje vald upphandling i tabellen: öppna TED-länken →
  följ länken till upphandlingsplattformen (Mercell/TendSign/Kommers/e-Avrop) → ladda ner
  **huvuddokumentet** (förfrågningsunderlag/upphandlingsdokument) och **kravbilagan** om
  separat. Spara som `evals/fixtures/source-docs/<ted-id>-<kortnamn>/`.
  Hoppa över avtalsmallar, ESPD och administrativa bilagor — de är brus för analysen.
  Kräver plattformen konto: skapa gratiskonto eller ersätt upphandlingen med reserv.
- [ ] **Steg 1.3:** Verifiera: minst 3 mappar med PDF/DOCX finns. `git status` visar inga
  source-docs (ignorerade). Commit `.gitignore`-ändringen:

```bash
git add .gitignore evals/fixtures/source-docs/.gitkeep
git commit -m "chore: gitignorerad katalog for nedladdade upphandlingsdokument"
```

### Task 2: Extraktionsskript för rfp_text

**Filer:**
- Skapa: `evals/scripts/extract-rfp-text.ts`

Återanvänder produktionens dokumentparser (markitdown-wrappern) så fixture-texten går
genom exakt samma väg som en uppladdad fil i appen.

- [ ] **Steg 2.1:** Skapa skriptet:

```typescript
// evals/scripts/extract-rfp-text.ts
// Konverterar nedladdade upphandlingsdokument till text via produktionens
// dokumentparser. Användning:
//   npx tsx evals/scripts/extract-rfp-text.ts evals/fixtures/source-docs/361188-verksamhetsanalys
// Skriver <mapp>/extracted.txt — klistras sedan in som rfp_text i fixture-yaml.
import fs from "fs/promises";
import path from "path";
import { parseDocument } from "@/lib/document-parser";

async function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error("Ange katalog med underlagsdokument.");
    process.exit(1);
  }
  const files = (await fs.readdir(dir)).filter((f) => /\.(pdf|docx|pptx|xlsx)$/i.test(f));
  if (files.length === 0) {
    console.error(`Inga dokument i ${dir}`);
    process.exit(1);
  }
  const parts: string[] = [];
  for (const f of files.sort()) {
    const buf = await fs.readFile(path.join(dir, f));
    const text = await parseDocument(buf, f);
    parts.push(`=== ${f} ===\n${text}`);
  }
  const out = path.join(dir, "extracted.txt");
  await fs.writeFile(out, parts.join("\n\n"), "utf-8");
  console.log(`Skrev ${out} (${parts.join("").length} tecken)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

OBS: verifiera `parseDocument`-signaturen mot `src/lib/document-parser.ts` vid
implementation (heter funktionen något annat eller tar den File/Blob — anpassa anropet,
inte parsern).

- [ ] **Steg 2.2:** Kör mot en nedladdad mapp. Förväntat: `extracted.txt` med läsbar
  svensk text (stickprov: åäö korrekta, rubriker synliga).
- [ ] **Steg 2.3:** Commit:

```bash
git add evals/scripts/extract-rfp-text.ts
git commit -m "feat(evals): extraktionsskript underlag -> rfp_text via dokumentparsern"
```

### Task 3: Språk som kompetens (prod-ändring, minimal)

Fas 0-fyndet: "Flytande svenska"-kravet kunde inte beläggas eftersom språk bara fanns i
`cv_text`, som generatorn aldrig ser. Ingen schemaändring behövs — språk är en kompetens.

**Filer:**
- Ändra: `src/lib/consultant-extractor.ts` (SYSTEM_PROMPT)
- Test: `src/lib/__tests__/consultant-extractor.test.ts` (skapa om den saknas)

- [ ] **Steg 3.1: Failande test**

```typescript
// src/lib/__tests__/consultant-extractor.test.ts
import { describe, it, expect } from "vitest";
import { SYSTEM_PROMPT } from "@/lib/consultant-extractor";

describe("consultant-extractor prompt", () => {
  it("instruerar att språkkunskaper extraheras som kompetens", () => {
    // Promptar är data: testet låser kontraktet att språk inte tappas bort —
    // fas 0 visade att coverage-judgen annars inte kan belägga språkkrav.
    expect(SYSTEM_PROMPT).toMatch(/[Ss]pråk/);
  });
});
```

Kräver att `SYSTEM_PROMPT` exporteras: `export const SYSTEM_PROMPT = ...` (idag lokal konstant).

- [ ] **Steg 3.2:** Kör: `npx vitest run src/lib/__tests__/consultant-extractor.test.ts` → FAIL.
- [ ] **Steg 3.3:** I `consultant-extractor.ts`: exportera konstanten och lägg till en regel
  i prompten under "Regler:":

```
- Extrahera språkkunskaper som kompetenser med nivå i namnet, t.ex.
  { "competency": "Svenska (modersmål)", "category": "domain" } — språkkrav är ofta
  ska-krav i offentliga upphandlingar och får inte tappas bort.
```

- [ ] **Steg 3.4:** `npx vitest run` → grönt.
- [ ] **Steg 3.5:** Commit: `git commit -m "fix: extractorn behandlar sprak som kompetens — coverage-judgen kan belagga sprakkrav"`

### Task 4: Judge-kalibrering (hallucination + equiv)

**Filer:**
- Ändra: `evals/harness/core/judges.ts` (två promptar)
- Test: `evals/harness/core/__tests__/judges-prompts.test.ts` (skapa)

Fas 0-fynden: (a) hallucination-judgen flaggar deterministiskt anbudsdatum och teamets
allokeringar (genereras per design, finns aldrig i källan), (b) equiv-judgen dömde
"Flytande svenska i tal och skrift" ≠ "Flytande svenska".

- [ ] **Steg 4.1: Failande tester**

```typescript
// evals/harness/core/__tests__/judges-prompts.test.ts
import { describe, it, expect } from "vitest";
import { HALLUCINATION_SYSTEM, EQUIV_SYSTEM } from "../judges";

describe("judge-promptar (kalibrering fas 1)", () => {
  it("hallucination-judgen undantar dokumentdatum och teamallokeringar", () => {
    expect(HALLUCINATION_SYSTEM).toMatch(/anbudsdatum|dokumentdatum/i);
    expect(HALLUCINATION_SYSTEM).toMatch(/omfattning|allokering/i);
  });

  it("equiv-judgen tolererar specificerande omformulering", () => {
    expect(EQUIV_SYSTEM).toMatch(/specificerad|mer detaljerad/i);
  });
});
```

Kräver att de två system-promptarna lyfts ut till exporterade konstanter
(`export const HALLUCINATION_SYSTEM`, `export const EQUIV_SYSTEM`) — ren lyftning,
funktionerna använder konstanterna.

- [ ] **Steg 4.2:** Kör → FAIL (konstanterna finns inte).
- [ ] **Steg 4.3:** Lyft ut promptarna och lägg till:

I hallucination-promptens steg 1 (extraktionen), ny mening:

```
Extrahera INTE: dokument-/anbudsdatum (sätts deterministiskt av systemet, inte av källan)
och teamets bemanningsallokeringar — omfattning i procent, timmar, totaler (de SKAPAS i
anbudet per design och kan aldrig finnas i källmaterialet).
```

I equiv-promptens regler, ny rad:

```
Match = true även när ena värdet är en mer specificerad variant av samma sak
(t.ex. "Flytande svenska" vs "Flytande svenska i tal och skrift").
```

- [ ] **Steg 4.4:** `npx vitest run` → grönt.
- [ ] **Steg 4.5:** Commit: `git commit -m "fix(evals): kalibrera hallucination- och equiv-judge enligt fas 0-fynden"`

### Task 5: Overflow-metrik i harnessen

Fas 0-observationen (Stefan): harnessen kastar bort `overflowFlags` — grinden är blind
för overflow oavsett utfall.

**Filer:**
- Ändra: `evals/harness/configs/bid-generator.ts` (runModule + computeBidGeneratorMetrics)
- Ändra: `evals/thresholds.yaml`
- Test: `evals/harness/configs/__tests__/bid-generator-metrics.test.ts` (skapa om den saknas; finns en — utöka)

- [ ] **Steg 5.1: Failande test**

```typescript
import { describe, it, expect } from "vitest";
import { computeBidGeneratorMetrics } from "../bid-generator";

describe("overflow-metrik", () => {
  it("overflow.pass = 0 när overflowFlags finns, 1 annars", () => {
    const judgments: never[] = [];
    expect(computeBidGeneratorMetrics(judgments, 2)["overflow.pass"]).toBe(0);
    expect(computeBidGeneratorMetrics(judgments, 2)["overflow.count"]).toBe(2);
    expect(computeBidGeneratorMetrics(judgments, 0)["overflow.pass"]).toBe(1);
  });
});
```

- [ ] **Steg 5.2:** Kör → FAIL (funktionen tar inte overflow-argumentet).
- [ ] **Steg 5.3:** Implementera:
  - `runModule` returnerar `{ output: sections, context: { ...context, overflowCount: overflowFlags.length } }`
    (behåll `const { sections, overflowFlags } = await generateAllSections(...)`).
  - `computeBidGeneratorMetrics(judgments, overflowCount = 0)`: lägg sist
    `metrics["overflow.count"] = overflowCount; metrics["overflow.pass"] = overflowCount === 0 ? 1 : 0;`
  - `computeFixtureMetrics`-callbacken trär igenom `context.overflowCount`.
    Verifiera mot `EvalConfig`-typen i `evals/harness/core/types.ts` hur context når
    callbacken — om signaturen är `(judgments, fixture)` utan context: utöka typen med
    valfri tredje parameter `context` (bakåtkompatibelt, övriga configs orörda).
  - `thresholds.yaml` under `bid-generator:`: `overflow.pass: { green: 1.00, yellow: 1.00 }`
    (highre-är-bättre som övriga; `overflow.count` lämnas otröskad = informativ).
- [ ] **Steg 5.4:** `npx vitest run` → grönt.
- [ ] **Steg 5.5:** Commit: `git commit -m "feat(evals): overflow-metrik i bid-generator-grinden — harnessen var blind for overflow"`

### Task 6: Utökad konsultpool + analyzer-fixtures med golden (STEFAN-GATE)

**Filer:**
- Ändra: `evals/fixtures/consultants/synthetic-pool.yaml` (4 nya profiler + språkkompetens i befintliga)
- Skapa: `evals/scripts/draft-analyzer-golden.ts`
- Skapa: `evals/fixtures/analyzer/<id>.yaml` × 4 (t.ex. `umv-verksamhetsanalys.yaml`,
  `af-ledarskapsutveckling.yaml`, `sormland-verksamhetsstod.yaml`, `orebro-utredning.yaml`)

- [ ] **Steg 6.1: Nya konsultprofiler.** Generera 4 syntetiska profiler matchade mot
  upphandlingarnas domäner med denna prompt till Claude (granska att namn/bolag är
  påhittade — INGA riktiga personer):

```
Skapa 4 syntetiska svenska managementkonsultprofiler i samma YAML-format som befintliga
poster i evals/fixtures/consultants/synthetic-pool.yaml (id, match_profile, cv_text,
parsed_profile). Profiler: (1) senior verksamhetsanalytiker offentlig sektor med
tjänstedesign-erfarenhet, (2) expert organisations-/ledarskapsutvecklare med
ledningsgruppserfarenhet i myndighet, (3) intermediate förändringsledare/projektledare
ramavtalsvana, (4) senior utredare med arbetsmiljö/HR-utredningar i regioner.
Alla: påhittade namn och klienter (svenska myndighetsliknande men fiktiva), 8-20 års
erfarenhet, språkkompetens som kompetensobjekt (t.ex. "Svenska (modersmål)", category
"domain"), 2-4 projekt vardera med år/roll/sektor. cv_text och parsed_profile ska vara
konsistenta med varandra.
```

  Lägg även till språkkompetens (`Svenska (modersmål)` eller motsvarande) i
  `parsed_profile.competencies` på Anna/Bertil/Cecilia så hela poolen är konsekvent
  (Bertil kan få `Svenska (modersmål)` men behåller sin svaga matchprofil i övrigt).
- [ ] **Steg 6.2:** `npx vitest run` → grönt (poolen schemavalideras av befintliga tester
  via `ConsultantPoolSchema`; om inget test laddar poolen: lägg ett som gör
  `loadConsultantPool` på filen och förväntar success).
- [ ] **Steg 6.3:** Commit: `git commit -m "feat(evals): 4 nya syntetiska konsultprofiler + sprak som kompetens i poolen"`
- [ ] **Steg 6.4: Golden-utkastskript:**

```typescript
// evals/scripts/draft-analyzer-golden.ts
// Kör produktions-analyzern på extracted.txt och skriver ett fixture-UTKAST.
// Utkastet är INTE golden förrän det granskats mot källdokumentet (Stefan-gate) —
// annars förankras facit i modellens egen output och evalen mäter ingenting.
//   npx tsx evals/scripts/draft-analyzer-golden.ts evals/fixtures/source-docs/361188-verksamhetsanalys umv-verksamhetsanalys
import fs from "fs/promises";
import path from "path";
import { analyzeRfp } from "@/lib/rfp-analyzer";

async function main() {
  const [dir, fixtureId] = [process.argv[2], process.argv[3]];
  if (!dir || !fixtureId) {
    console.error("Användning: draft-analyzer-golden.ts <source-doc-katalog> <fixture-id>");
    process.exit(1);
  }
  const rfpText = await fs.readFile(path.join(dir, "extracted.txt"), "utf-8");
  const analysis = await analyzeRfp(rfpText);
  const draft = {
    id: fixtureId,
    source_url: "FYLL I TED-URL",
    notes: "UTKAST — golden ej granskad ännu. Granska varje fält mot källdokumentet.",
    rfp_text: rfpText,
    golden: analysis,
  };
  const out = path.resolve("evals/fixtures/analyzer", `${fixtureId}.draft.yaml`);
  const yaml = await import("js-yaml");
  await fs.writeFile(out, yaml.dump(draft, { lineWidth: 100 }), "utf-8");
  console.log(`Skrev ${out} — GRANSKA innan .draft tas bort ur filnamnet.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

  (Verifiera att `js-yaml` finns — harnessen läser yaml-fixtures, så ett yaml-lib finns;
  matcha det som `fixture-loader.ts` använder.)
- [ ] **Steg 6.5:** Kör skriptet för alla 4 underlag (kräver `ANTHROPIC_API_KEY`;
  kostnad ~4 Sonnet-anrop på stora inputs ≈ $1–2).
- [ ] **Steg 6.6 (Stefan):** Granska varje `.draft.yaml` MOT KÄLLDOKUMENTET, inte mot
  modellens output: saknade ska-krav läggs till, fel prioritet rättas, titel/summary/
  domän justeras till vad underlaget faktiskt säger. Döp om till `<id>.yaml` när golden
  är fastställd. Riskpåminnelse: golden förankrad i modellens egen output ger en eval
  som alltid "passar" — granskningen är det som gör fixtures till facit.
- [ ] **Steg 6.7:** `npx vitest run` → grönt. Commit:

```bash
git add evals/scripts/draft-analyzer-golden.ts evals/fixtures/analyzer/
git commit -m "feat(evals): 4 analyzer-fixtures fran riktiga TED-underlag med granskad golden"
```

### Task 7: Bid-generator-fixtures + eval-grind på riktiga underlag

**Filer:**
- Skapa: `evals/fixtures/bid-generator/<id>.yaml` × 4 (samma id:n som analyzer-fixtures)
- Behåll: `_stub.yaml` (smoke-fixture, kostar nästan inget)

- [ ] **Steg 7.1:** Skapa en bid-generator-fixture per analyzer-fixture. Mall (anpassa
  consultant_ids till profilerna från Task 6 — välj 2–3 konsulter som RIMLIGT matchar
  uppdraget plus gärna en svagare, så go/no-go-resonemanget får något att arbeta med):

```yaml
id: umv-verksamhetsanalys
analyzer_fixture: umv-verksamhetsanalys
consultant_ids:
  - <verksamhetsanalytiker-id>
  - <forandringsledare-id>
golden:
  mandatory_sections:
    - cover
    - understanding-current
    - understanding-assignment
    - understanding-vision
    - phases
    - quality-assurance
    - requirement-matrix-v2
    - team-pricing
    - reference-v2
    - confidentiality
    - certifications
  requirement_coverage:
    must_cover: []          # aggregerad coverage.recall används (se bid-generator.ts)
    should_cover_threshold: 0.8
  hallucination_allowlist:
    - "anbudsdatum"         # deterministisk cover-stämpel (bälte+hängslen utöver judge-kalibreringen)
    - "omfattning"
    - "timmar"
```

- [ ] **Steg 7.2: EVAL-GRIND (kostar pengar, ~$5–10):** `npm run eval:analyzer` →
  granska per fixture. Förväntan på riktiga, granskade golden: `title`/`client` gröna,
  f1-mått ≥ yellow. Under yellow = felsök med superpowers:systematic-debugging — börja
  med judge-utlåtandena i run-dumpen (är det modellen eller golden som är fel?).
- [ ] **Steg 7.3:** `npm run eval:bid-generator` → structure 1.00, overflow.pass
  rapporterad (ny metrik), hallucination.pass 1.00 nu när kalibreringen är inne
  (kvarstående äkta hallucinationer dokumenteras — de är RIKTIGA fynd på riktiga
  underlag och ska inte allowlistas bort).
- [ ] **Steg 7.4:** Dokumentera baslinjesiffrorna (kostnad/anbud per modul ur
  `ai_call_logs`, jämför fas 0:s $0.373-stub-baslinje) i PR-beskrivningen.
- [ ] **Steg 7.5:** Commit + öppna **PR A** mot `main`. Invänta review-routinens
  kommentar; åtgärda correctness-fynd före merge.

### Task 8: (utgår — sammanslagen i 7.5)

---

## PR B — Jämförelseriggen

> `git checkout main && git pull && git checkout -b fas-1b-compare-harness` EFTER PR A-merge.

### Task 9: 529-resiliens i callClaude

Fas 0: `overloaded_error` fällde phases-bundlen i 2 av 3 eval-körningar trots 3 försök
med 1s/2s-backoff. Jämförelsekörningen gör 18 generationer — hål i datamatrisen
förstör jämförelsen.

**Filer:**
- Ändra: `src/lib/ai-client.ts`
- Test: `src/lib/__tests__/ai-client.test.ts`

- [ ] **Steg 9.1: Failande test** (samma mockmönster som befintliga — `mockStream` + APIError):

```typescript
describe("callClaude — overloaded-resiliens", () => {
  const schema = z.object({ a: z.number() });
  const baseArgs = {
    maxTokens: 100, system: "sys", userContent: "user",
    label: "test", model: "claude-sonnet-4-6", schema,
  };

  it("ger 529 fem försök istället för tre", async () => {
    vi.useFakeTimers();
    const { APIError } = await import("@anthropic-ai/sdk");
    const overloaded = () => ({
      finalMessage: () => Promise.reject(new (APIError as never as { new (s: number, m: string): Error })(529, "Overloaded")),
    });
    mockCreate
      .mockReturnValueOnce(overloaded())
      .mockReturnValueOnce(overloaded())
      .mockReturnValueOnce(overloaded())
      .mockReturnValueOnce(overloaded())
      .mockReturnValueOnce(streamOf({ content: [{ type: "text", text: '{"a": 1}' }], usage: {} }));

    const promise = callClaude({ ...baseArgs });
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toEqual({ a: 1 });
    expect(mockCreate).toHaveBeenCalledTimes(5);
    vi.useRealTimers();
  });
});
```

  (Justera APIError-konstruktionen till testfilens befintliga mockklass — den tar
  `(status, message)`; använd den direkt istället för import om enklare.)
- [ ] **Steg 9.2:** Kör → FAIL (ger upp efter 3).
- [ ] **Steg 9.3:** Implementera i `callClaude`: bryt ut `isOverloaded(error)`
  (`error instanceof APIError && error.status === 529`); loopvillkoret blir
  `attempt < (sawOverload ? OVERLOAD_MAX_RETRIES : MAX_RETRIES)` med
  `const OVERLOAD_MAX_RETRIES = 5;` och backoff för overload `5000 * Math.pow(2, attempt)`
  (5s/10s/20s/40s) istället för `BASE_DELAY_MS`. Övriga felklasser oförändrade.
- [ ] **Steg 9.4:** `npx vitest run` → grönt.
- [ ] **Steg 9.5:** Commit: `git commit -m "fix: langre backoff och fler forsok vid 529 Overloaded — fas 0 tappade bundles"`

### Task 10: Modell-override via env i models.ts

Riggen måste kunna köra samma kod med två olika skrivmodeller. Bundlarna läser
`MODELS.writing` vid anrop — en env-override vid modulinit + barnprocess per modell
(Task 13) ger isolering utan att röra bundle-signaturer.

**Filer:**
- Ändra: `src/lib/models.ts`
- Test: `src/lib/__tests__/models.test.ts`

- [ ] **Steg 10.1: Failande test**

```typescript
it("BIDSMITH_WRITING_MODEL överstyr writing-rollen (för eval:bid-compare)", async () => {
  vi.stubEnv("BIDSMITH_WRITING_MODEL", "claude-fable-5");
  vi.resetModules();
  const { MODELS: overridden } = await import("@/lib/models");
  expect(overridden.writing).toBe("claude-fable-5");
  vi.unstubAllEnvs();
  vi.resetModules();
});
```

- [ ] **Steg 10.2:** Kör → FAIL.
- [ ] **Steg 10.3:** I `models.ts`:

```typescript
  // Kvalitetskritiska skrivbundles: understanding, phases, quality.
  // Env-overriden finns för eval:bid-compare (barnprocess per modell) —
  // sätt den ALDRIG i produktion; default är beslutet från A/B-testet.
  writing: process.env.BIDSMITH_WRITING_MODEL ?? "claude-opus-4-8",
```

- [ ] **Steg 10.4:** `npx vitest run` → grönt (befintligt registry-test asserterar
  defaulten — env är osatt i vitest).
- [ ] **Steg 10.5:** Commit: `git commit -m "feat: BIDSMITH_WRITING_MODEL-override for jamforelseriggen"`

### Task 11: Parvis blind judge

**Filer:**
- Skapa: `evals/harness/core/pairwise-judge.ts`
- Test: `evals/harness/core/__tests__/pairwise-judge.test.ts`

**Design:** Judgen (Sonnet via `MODELS.judge` — aldrig en deltagare) får två anonyma
utkast av samma sektionstyp. Varje par döms TVÅ gånger med bytt position; olika svar =
oavgjort (positionsbias-skydd). Rubrik: klarhet, övertygelse, konkretion, svensk ton,
frihet från AI-floskler.

- [ ] **Steg 11.1: Failande tester** (mocka `@/lib/ai-client` — ingen API-kostnad):

```typescript
// evals/harness/core/__tests__/pairwise-judge.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai-client", () => ({ callClaude: vi.fn() }));
import { callClaude } from "@/lib/ai-client";
import { judgePairBlind } from "../pairwise-judge";

beforeEach(() => vi.mocked(callClaude).mockReset());

describe("judgePairBlind", () => {
  it("samstämmiga domar ger vinnaren", async () => {
    // Pass 1: A först (A = modellA) → "A". Pass 2: positioner bytta → "B" pekar på samma text.
    vi.mocked(callClaude)
      .mockResolvedValueOnce({ winner: "A", motivering: "tydligare" })
      .mockResolvedValueOnce({ winner: "B", motivering: "tydligare" });
    const r = await judgePairBlind({
      sectionType: "phases", textA: "text-1", textB: "text-2",
    });
    expect(r.winner).toBe("A");
    expect(vi.mocked(callClaude)).toHaveBeenCalledTimes(2);
    // Pass 2 ska ha texterna i omvänd ordning i prompten.
    const secondPrompt = vi.mocked(callClaude).mock.calls[1][0].userContent;
    expect(secondPrompt.indexOf("text-2")).toBeLessThan(secondPrompt.indexOf("text-1"));
  });

  it("oense domar ger oavgjort", async () => {
    vi.mocked(callClaude)
      .mockResolvedValueOnce({ winner: "A", motivering: "x" })
      .mockResolvedValueOnce({ winner: "A", motivering: "y" }); // efter byte = motsägelse
    const r = await judgePairBlind({ sectionType: "phases", textA: "t1", textB: "t2" });
    expect(r.winner).toBe("tie");
  });

  it("explicit oavgjort i något pass ger oavgjort", async () => {
    vi.mocked(callClaude)
      .mockResolvedValueOnce({ winner: "tie", motivering: "likvärdiga" })
      .mockResolvedValueOnce({ winner: "B", motivering: "x" });
    const r = await judgePairBlind({ sectionType: "phases", textA: "t1", textB: "t2" });
    expect(r.winner).toBe("tie");
  });
});
```

- [ ] **Steg 11.2:** Kör → FAIL (modulen finns inte).
- [ ] **Steg 11.3:** Implementera:

```typescript
// evals/harness/core/pairwise-judge.ts
import { z } from "zod";
import { callClaude } from "@/lib/ai-client";
import { MODELS } from "@/lib/models";

const VerdictSchema = z.object({
  winner: z.enum(["A", "B", "tie"]),
  motivering: z.string(),
});

export interface PairInput {
  sectionType: string;
  textA: string; // alltid modell A:s text (basmodellen)
  textB: string; // alltid modell B:s text (utmanaren)
}

export interface PairVerdict {
  sectionType: string;
  winner: "A" | "B" | "tie"; // i modelltermer, inte positionstermer
  motiveringar: string[];
}

const SYSTEM = `Du jämför två anonyma utkast av samma anbudssektion för en svensk
offentlig upphandling. Döm vilken text som är bättre på: klarhet, övertygelse,
konkretion (specifika åtaganden, inte floskler), naturlig svensk ton, och frihet från
AI-floskler ("i dagens snabbrörliga värld", "robust", "sömlös" osv).
Svara med JSON { "winner": "A" | "B" | "tie", "motivering": string }.
"A" = första utkastet, "B" = andra. Döm ENDAST på texten — anta inget om avsändare.`;

async function judgeOnce(first: string, second: string, sectionType: string) {
  return callClaude({
    model: MODELS.judge,
    maxTokens: 500,
    system: SYSTEM,
    userContent: `Sektionstyp: ${sectionType}

=== Utkast A ===
${first}

=== Utkast B ===
${second}`,
    schema: VerdictSchema,
    label: `pairwise-judge(${sectionType})`,
  });
}

// Två pass med bytta positioner. Pass 1: (A,B). Pass 2: (B,A) — där betyder
// svaret "B" alltså modell A. Samstämmighet i MODELLTERMER krävs; annars tie.
export async function judgePairBlind(input: PairInput): Promise<PairVerdict> {
  const p1 = await judgeOnce(input.textA, input.textB, input.sectionType);
  const p2 = await judgeOnce(input.textB, input.textA, input.sectionType);

  const inModelTerms = (v: "A" | "B" | "tie", swapped: boolean): "A" | "B" | "tie" =>
    v === "tie" ? "tie" : swapped ? (v === "A" ? "B" : "A") : v;

  const v1 = inModelTerms(p1.winner, false);
  const v2 = inModelTerms(p2.winner, true);
  return {
    sectionType: input.sectionType,
    winner: v1 === v2 ? v1 : "tie",
    motiveringar: [p1.motivering, p2.motivering],
  };
}
```

- [ ] **Steg 11.4:** `npx vitest run` → grönt.
- [ ] **Steg 11.5:** Commit: `git commit -m "feat(evals): parvis blind judge med positionsbyte"`

### Task 12: Sektionstext-rendering + aggregation (rena funktioner)

**Filer:**
- Skapa: `evals/harness/core/compare-core.ts`
- Test: `evals/harness/core/__tests__/compare-core.test.ts`

- [ ] **Steg 12.1: Failande tester**

```typescript
import { describe, it, expect } from "vitest";
import { renderSectionText, aggregateVerdicts, WRITING_SECTION_KEYS } from "../compare-core";

describe("renderSectionText", () => {
  it("plattar ut content till läsbar text (strängar, arrayer, nästlat)", () => {
    const section = {
      key: "phases", title: "Genomförande",
      content: { intro: "Vi gör X.", phases: [{ name: "Fas 1", activities: ["a", "b"] }] },
    };
    const text = renderSectionText(section as never);
    expect(text).toContain("Vi gör X.");
    expect(text).toContain("Fas 1");
    expect(text).toContain("a");
    expect(text).not.toMatch(/[{}"]/); // ingen rå JSON till judgen
  });
});

describe("aggregateVerdicts", () => {
  it("räknar vinstandel per sektionstyp i modelltermer", () => {
    const verdicts = [
      { sectionType: "phases", winner: "A" as const, motiveringar: [] },
      { sectionType: "phases", winner: "B" as const, motiveringar: [] },
      { sectionType: "phases", winner: "tie" as const, motiveringar: [] },
      { sectionType: "quality-assurance", winner: "B" as const, motiveringar: [] },
    ];
    const agg = aggregateVerdicts(verdicts);
    expect(agg["phases"]).toEqual({ a: 1, b: 1, tie: 1 });
    expect(agg["quality-assurance"]).toEqual({ a: 0, b: 1, tie: 0 });
  });
});

describe("WRITING_SECTION_KEYS", () => {
  it("omfattar exakt de sektioner skrivmodellen producerar", () => {
    expect(WRITING_SECTION_KEYS).toEqual([
      "understanding-current", "understanding-assignment", "understanding-vision",
      "phases", "quality-assurance",
    ]);
  });
});
```

- [ ] **Steg 12.2:** Kör → FAIL.
- [ ] **Steg 12.3:** Implementera:

```typescript
// evals/harness/core/compare-core.ts
import type { BidSection } from "@/lib/types";

// Sektioner producerade av MODELS.writing — det är bara dessa A/B-testet jämför.
// (team/requirement-matrix skrivs av writingSupport och är inte med i testet.)
export const WRITING_SECTION_KEYS = [
  "understanding-current", "understanding-assignment", "understanding-vision",
  "phases", "quality-assurance",
] as const;

// Rekursiv utplattning av section.content till judge-läsbar text — judgen ska
// bedöma prosa, inte JSON-syntax.
function flatten(value: unknown, out: string[]): void {
  if (typeof value === "string") { out.push(value); return; }
  if (typeof value === "number") { out.push(String(value)); return; }
  if (Array.isArray(value)) { for (const v of value) flatten(v, out); return; }
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) flatten(v, out);
  }
}

export function renderSectionText(section: BidSection): string {
  const out: string[] = [];
  flatten(section.content, out);
  return out.join("\n");
}

export interface SectionVerdict {
  sectionType: string;
  winner: "A" | "B" | "tie";
  motiveringar: string[];
}

export type WinTally = Record<string, { a: number; b: number; tie: number }>;

export function aggregateVerdicts(verdicts: SectionVerdict[]): WinTally {
  const tally: WinTally = {};
  for (const v of verdicts) {
    tally[v.sectionType] ??= { a: 0, b: 0, tie: 0 };
    if (v.winner === "A") tally[v.sectionType].a++;
    else if (v.winner === "B") tally[v.sectionType].b++;
    else tally[v.sectionType].tie++;
  }
  return tally;
}
```

  (`content.format`-fältet plattas med — om det stör judgen: filtrera bort nyckeln
  `format` i `flatten`; avgör vid implementation med ett stickprov.)
- [ ] **Steg 12.4:** `npx vitest run` → grönt.
- [ ] **Steg 12.5:** Commit: `git commit -m "feat(evals): compare-core — sektionsrendering och aggregation"`

### Task 13: Jämförelserunner

**Filer:**
- Skapa: `evals/scripts/run-bid-model-compare.ts` (förälder)
- Skapa: `evals/scripts/run-bid-single-model.ts` (barn)
- Ändra: `package.json` (script `"eval:bid-compare": "tsx evals/scripts/run-bid-model-compare.ts"`)

**Design:** Modulkonstanten `MODELS` läses vid init → en PROCESS per modell
(`BIDSMITH_WRITING_MODEL` i env), inte två modeller i samma process. Barnet kör alla
fixtures × reps för SIN modell och skriver en JSON-dump per körning till
`evals/runs/compare/<modell>/<fixture>-rep<i>.json` (sections + tidsstämplar + latens).
Föräldern spawnar barnen sekventiellt (delad rate limit), läser dumparna, kör
pairwise-judgen på rep-parade sektioner och skriver rapporten.

- [ ] **Steg 13.1:** Implementera barnet:

```typescript
// evals/scripts/run-bid-single-model.ts
// Kör alla bid-generator-fixtures × N reps med skrivmodellen från env
// (BIDSMITH_WRITING_MODEL sätts av föräldern). En dump per körning.
// Dumpar skrivs inkrementellt — en 529-krasch mitt i kan köras om utan att
// färdiga körningar går förlorade (befintliga dumpar skrivs över per fil).
import fs from "fs/promises";
import path from "path";
import { MODELS } from "@/lib/models";
import { bidGeneratorConfig } from "../harness/configs/bid-generator";

const REPS = Number(process.env.BIDSMITH_COMPARE_REPS ?? 3);

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY saknas"); process.exit(1);
  }
  const model = MODELS.writing; // = env-overriden när föräldern satt den
  const outDir = path.resolve("evals/runs/compare", model);
  await fs.mkdir(outDir, { recursive: true });

  const dir = bidGeneratorConfig.fixtureDir;
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".yaml") && !f.startsWith("_stub"));

  for (const file of files) {
    const fixture = await bidGeneratorConfig.loadFixture(path.join(dir, file));
    for (let rep = 1; rep <= REPS; rep++) {
      const startedAt = new Date().toISOString();
      // runModule = harnessens befintliga väg (laddar kontext + generateAllSections)
      // — jämförelsen kör EXAKT samma kod som eval:bid-generator.
      const { output } = await bidGeneratorConfig.runModule(fixture);
      const dump = {
        model, fixtureId: fixture.id, rep, startedAt,
        finishedAt: new Date().toISOString(),
        sections: output,
      };
      const outPath = path.join(outDir, `${fixture.id}-rep${rep}.json`);
      await fs.writeFile(outPath, JSON.stringify(dump, null, 1), "utf-8");
      console.log(`${model} ${fixture.id} rep${rep} klar`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
```

  OBS: `runModule` returnerar `{ output, context }` (och efter Task 5 även
  `overflowCount` i context) — dumpa gärna `overflowCount` med i dumpen så rapporten
  kan redovisa overflow per modell.
- [ ] **Steg 13.2:** Implementera föräldern:

```typescript
// evals/scripts/run-bid-model-compare.ts
// Spawnar ett barn per modell (env-override), parar dumparna rep-vis och kör
// parvis blind judge på skrivsektionerna. Resultat: evals/runs/compare/verdicts.json
import { execFileSync } from "child_process";
import fs from "fs/promises";
import path from "path";
import { MODELS } from "@/lib/models";
import { judgePairBlind } from "../harness/core/pairwise-judge";
import { renderSectionText, aggregateVerdicts, WRITING_SECTION_KEYS } from "../harness/core/compare-core";
import type { BidSection } from "@/lib/types";

const MODEL_A = MODELS.writing;            // bas (Opus 4.8)
const MODEL_B = MODELS.writingChallenger;  // utmanare (Fable 5)

async function main() {
  for (const model of [MODEL_A, MODEL_B]) {
    console.log(`=== Genererar med ${model} ===`);
    execFileSync("npx", ["tsx", "evals/scripts/run-bid-single-model.ts"], {
      stdio: "inherit",
      shell: process.platform === "win32",
      env: { ...process.env, BIDSMITH_WRITING_MODEL: model },
    });
  }

  const dirA = path.resolve("evals/runs/compare", MODEL_A);
  const dumpsA = (await fs.readdir(dirA)).filter((f) => f.endsWith(".json"));
  const verdicts = [];
  for (const file of dumpsA) {
    const a = JSON.parse(await fs.readFile(path.join(dirA, file), "utf-8"));
    const bPath = path.resolve("evals/runs/compare", MODEL_B, file);
    const b = JSON.parse(await fs.readFile(bPath, "utf-8"));
    for (const key of WRITING_SECTION_KEYS) {
      const secA = (a.sections as BidSection[]).find((s) => s.key === key);
      const secB = (b.sections as BidSection[]).find((s) => s.key === key);
      if (!secA || !secB) {
        console.warn(`Hoppar ${file}/${key} — sektion saknas (kontrollera 529-hål)`);
        continue;
      }
      const v = await judgePairBlind({
        sectionType: key,
        textA: renderSectionText(secA),
        textB: renderSectionText(secB),
      });
      verdicts.push({ ...v, pairFile: file });
      console.log(`${file} ${key}: ${v.winner}`);
    }
  }
  const tally = aggregateVerdicts(verdicts);
  await fs.writeFile(
    path.resolve("evals/runs/compare/verdicts.json"),
    JSON.stringify({ modelA: MODEL_A, modelB: MODEL_B, verdicts, tally }, null, 1),
    "utf-8",
  );
  console.log(JSON.stringify(tally, null, 1));
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Steg 13.3:** Lägg till npm-scriptet. Torrtest UTAN pengar: kör föräldern med
  `BIDSMITH_COMPARE_REPS=0`... reps=0 ger inga dumps — kör istället barnets
  fixture-uppräkning mot en tom compare-katalog och verifiera att föräldern ger
  begripligt fel när dumps saknas (inte krasch utan "Hoppar ..."-varningar + tom tally).
- [ ] **Steg 13.4:** `npx vitest run` → grönt (runnern är skript, inte testfil — men
  compare-core/pairwise-tester täcker logiken).
- [ ] **Steg 13.5:** Commit: `git commit -m "feat(evals): eval:bid-compare — barnprocess per modell + parvis domslut"`

### Task 14: Rapport + blindgranskningsunderlag

**Filer:**
- Skapa: `evals/scripts/build-compare-report.ts`
- Skapa: `evals/harness/core/compare-report.ts` (rena renderingsfunktioner)
- Test: `evals/harness/core/__tests__/compare-report.test.ts`

- [ ] **Steg 14.1: Failande tester** för de rena delarna:

```typescript
import { describe, it, expect } from "vitest";
import { renderReportMd, pickBlindPairs } from "../compare-report";

describe("pickBlindPairs", () => {
  it("väljer N par deterministiskt givet seed och anonymiserar ordningen", () => {
    const pairs = [
      { pairFile: "f1-rep1.json", sectionType: "phases", textA: "a1", textB: "b1" },
      { pairFile: "f1-rep2.json", sectionType: "phases", textA: "a2", textB: "b2" },
      { pairFile: "f2-rep1.json", sectionType: "quality-assurance", textA: "a3", textB: "b3" },
    ];
    const r1 = pickBlindPairs(pairs, 2, 42);
    const r2 = pickBlindPairs(pairs, 2, 42);
    expect(r1.map((p) => p.id)).toEqual(r2.map((p) => p.id)); // reproducerbart
    expect(r1).toHaveLength(2);
    for (const p of r1) {
      expect(["A-först", "B-först"]).toContain(p.facit.ordning);
      expect(p.utkast1).not.toBe("");
      expect(p.utkast2).not.toBe("");
    }
  });
});

describe("renderReportMd", () => {
  it("innehåller vinstandelar per sektionstyp och kostnadstabell", () => {
    const md = renderReportMd({
      modelA: "claude-opus-4-8", modelB: "claude-fable-5",
      tally: { phases: { a: 2, b: 1, tie: 0 } },
      costs: [{ model: "claude-opus-4-8", totalUsd: 2.1, perBid: 0.7 }],
    });
    expect(md).toContain("phases");
    expect(md).toContain("claude-fable-5");
    expect(md).toContain("0.7");
  });
});
```

- [ ] **Steg 14.2:** Kör → FAIL.
- [ ] **Steg 14.3:** Implementera `compare-report.ts`:
  - `pickBlindPairs(pairs, n, seed)`: deterministisk PRNG (mulberry32 — 6 rader, inlinea
    den med kommentar) som väljer n par och slumpar visningsordning per par; returnerar
    `{ id, sectionType, utkast1, utkast2, facit: { ordning: "A-först"|"B-först", pairFile } }`.
  - `renderReportMd({modelA, modelB, tally, costs})`: markdown med vinstandelstabell per
    sektionstyp (a/b/tie och andel exkl. tie), kostnads-/latensrad per modell, och en
    tom mall för beslutsavsnittet.
  - Kostnadsdata: hämtas i skriptet (inte i den rena funktionen) ur `ai_call_logs` via
    `createServiceClient` mellan barnens start-/sluttider (dumparnas `startedAt`/`finishedAt`),
    summerat per modell på `label LIKE '% bundle'`.
- [ ] **Steg 14.4:** Implementera `build-compare-report.ts` (skript): läser
  `verdicts.json` + dumps → skriver `evals/results-bid-model-comparison.md` (rapporten,
  committas), `evals/runs/compare/blind-review.md` (10 par, "Utkast 1/Utkast 2" + tom
  kolumn `Vinnare (1/2/oavgjort)`) och `evals/runs/compare/blind-facit.json`
  (gitignorerad — `evals/runs/` ligger redan i .gitignore, verifiera).
- [ ] **Steg 14.5:** `npx vitest run` → grönt.
- [ ] **Steg 14.6:** Commit + öppna **PR B**. Invänta review-routinen; åtgärda
  correctness-fynd före merge.

### Task 15: (utgår — sammanslagen i 14.6)

---

## PR C — Körning & beslut

> `git checkout main && git pull && git checkout -b fas-1c-beslut` EFTER PR B-merge.

### Task 16: Jämförelsekörningen (KOSTNADSGRIND ~$30–60)

- [ ] **Steg 16.1:** Ladda env (`.env.local`) och kör `npm run eval:bid-compare`.
  4 fixtures × 3 reps × 2 modeller = 24 generationer + ~120 judge-par à 2 anrop.
  Förväntad väggtid: 1–2 h (sekventiella barn). 529-hål: barnet kan köras om för en
  enskild modell — dumparna är per körning och skrivs inkrementellt.
- [ ] **Steg 16.2:** Kontrollera datamatrisen komplett: `evals/runs/compare/<modell>/`
  innehåller 12 dumpar per modell, `verdicts.json` utan "Hoppar"-varningar i loggen.
  Hål = kör om den modellens barn (samma kommando, det skriver över).
- [ ] **Steg 16.3:** Kör `npx tsx evals/scripts/build-compare-report.ts` →
  `evals/results-bid-model-comparison.md` + blindgranskningsfilerna.

### Task 17: Mänsklig blindgranskning (STEFAN-GATE)

- [ ] **Steg 17.1 (Stefan):** Öppna `evals/runs/compare/blind-review.md`. Fyll i
  `Vinnare`-kolumnen (1/2/oavgjort) för alla 10 par. Titta INTE i `blind-facit.json`
  före ifyllnad.
- [ ] **Steg 17.2:** Skapa `evals/scripts/score-blind-review.ts` + den rena parsern i
  `evals/harness/core/compare-report.ts` (TDD — testet först):

```typescript
// Tillägg i compare-report.ts:
// Parsar Stefans ifyllda blind-review.md. Rader på formen:
// | par-3 | phases | ... | 2 |
export function parseBlindReviewMarks(md: string): Array<{ id: string; mark: "1" | "2" | "oavgjort" }> {
  const marks: Array<{ id: string; mark: "1" | "2" | "oavgjort" }> = [];
  for (const line of md.split("\n")) {
    const m = line.match(/^\|\s*(par-\d+)\s*\|.*\|\s*(1|2|oavgjort)\s*\|\s*$/);
    if (m) marks.push({ id: m[1], mark: m[2] as "1" | "2" | "oavgjort" });
  }
  return marks;
}
```

```typescript
// Test (compare-report.test.ts):
it("parsar ifyllda vinnarmarkeringar ur blind-review.md", () => {
  const md = `| Par | Sektion | Utkast 1 | Utkast 2 | Vinnare (1/2/oavgjort) |
|---|---|---|---|---|
| par-1 | phases | ... | ... | 2 |
| par-2 | quality-assurance | ... | ... | oavgjort |`;
  expect(parseBlindReviewMarks(md)).toEqual([
    { id: "par-1", mark: "2" },
    { id: "par-2", mark: "oavgjort" },
  ]);
});
```

  Skriptet läser blind-review.md + blind-facit.json, översätter 1/2 → modell via
  facitets `ordning`-fält, räknar människans vinstandel per modell och
  människa-vs-judge-överensstämmelse (samma par, samma vinnare?), och appenderar
  resultatet till rapportens beslutsavsnitt.

### Task 18: Beslut + verkställande

**Beslutsregel (ur masterplanen):** byt `MODELS.writing` till Fable 5 ENDAST om
mänsklig blindgranskning OCH judge samstämmigt visar bättre text där det är
affärskritiskt (understanding-sektionerna + quality). Kostnadsskillnaden
(~$0,75 vs ~$1,50–3 per anbud) är försumbar mot anbudets värde — kvalitet avgör.
Oavgjort eller spretigt = behåll Opus 4.8 (ingen ändring utan tydlig signal).

- [ ] **Steg 18.1:** Fyll i beslutsavsnittet i `evals/results-bid-model-comparison.md`:
  rekommendation + motivering förankrad i vinstandelar, spridning mellan reps,
  människa-judge-överensstämmelse, kostnad och latens.
- [ ] **Steg 18.2:** Om bytet motiveras: ändra `writing`-defaulten i `src/lib/models.ts`
  + uppdatera `CLAUDE.md` §Modellstrategi (beslut + datum + hänvisning till rapporten).
  Om inte: uppdatera CLAUDE.md med "A/B 2026-06: Opus 4.8 behålls — se rapporten".
- [ ] **Steg 18.3:** `npx vitest run` → grönt (registry-testets writing-assertion
  uppdateras BARA om beslutet är byte — testet ÄR beslutsdokumentationen i kod).
- [ ] **Steg 18.4:** Commit + öppna **PR C** med rapporten som kärna. Invänta
  review-routinen → merge.

---

## Definition of done (hela fas 1)

1. ≥3 (mål 4) analyzer- + bid-generator-fixtures från riktiga TED-underlag med
   manuellt granskad golden; `_stub` kvar som smoke.
2. Kalibreringen ur fas 0-backloggen genomförd: hallucination-judgen blind för
   datum/allokeringar, equiv-judgen tål specificering, språk når generatorn,
   overflow-metrik grindar (`overflow.pass`).
3. `npm run eval:bid-compare` körbart som permanent regressionsverktyg; rapport med
   ≥3 fixtures × ≥3 körningar × 2 modeller finns i `evals/results-bid-model-comparison.md`.
4. Mänsklig blindgranskning genomförd (≥10 par) och människa-vs-judge-överensstämmelse
   rapporterad.
5. Beslut om `MODELS.writing` dokumenterat och genomfört; CLAUDE.md uppdaterad.
6. `npx vitest run` grönt; alla tre befintliga evals gröna/dokumenterade på de nya
   fixturerna.

## Kända risker

| Risk | Hantering |
|---|---|
| Underlag bakom inloggning/borttagna | 6 kandidater för 4 platser + reserver; Stefan-gate i Task 1 tidigt så stoppet syns direkt |
| Golden förankras i modellens egen output | Task 6.6: granskning MOT källdokument är obligatorisk gate, utkasten heter `.draft.yaml` tills dess |
| 529 Overloaded ger hål i datamatrisen | Task 9 (resiliens) + inkrementella dumpar + omkörbart barn per modell |
| LLM-judge-bias | Positionsbyte med samstämmighetskrav (Task 11), judge ≠ deltagare, människa som gold (Task 17) |
| Judge-kalibreringen maskar äkta hallucinationer | Undantagen är smala (datum, allokeringar); äkta fynd på riktiga underlag allowlistas INTE bort (Task 7.3) |
| Run-variansen större än modellskillnaden | ≥3 reps per cell; rapporten redovisar spridning; spretigt = behåll Opus (beslutsregeln) |
| Fable 5:s longa outputs spränger teckenbudgetar | overflow.pass-metriken (Task 5) fångar det per modell — en modell som inte håller budget förlorar på det |
| `loadContext`/`runModule`-återanvändning kräver export-ändringar i config | Ren lyftning utan beteendeändring; orchestrator-testerna grindar |
