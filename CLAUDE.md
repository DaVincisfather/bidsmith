@AGENTS.md

# Bidsmith — CLAUDE.md

> Ärver globala instruktioner från `~/projects/CLAUDE.md`. Här ligger bara projektspecifika tillägg.

---

## Produkten

AI-agent som tar offertförfrågan + konsultprofiler och producerar anbudsutkast. Målgrupp: medelstora konsultfirmor (20-100 konsulter).

**Milstolpar:** M0 Kravanalys -> M1 Matchning -> M1.5 Go/No-Go -> M2 Anbudsgenerering -> M3 RFP-radar

## Modellstrategi

- **`src/lib/models.ts` är enda sanningskällan** — roller (extraction/prefilter/matching/
  gonogo/radar/writing/writingSupport/writingGeneric/writingChallenger/judge), aldrig
  hårdkodade modellsträngar. Varje modell måste ha prisrad i `ai-cost.ts` (testat i
  `models.test.ts`).
- **Grind per modellbyte (policy ändrad 2026-07-03, Stefan):** samma modellfamilj uppåt
  (t.ex. Sonnet 4-6 → 5) = enradsändring + smoke + stickprov på outputs, ingen eval.
  Familjebyte eller ändring av `writing`-rollen = eval-körning (fas 1-lärdomen: bättre
  modell på pappret ≠ bättre anbudstext). **Undantag: `judge` byts ALDRIG utan
  omkalibrering mot blindfacit-paren** — kalibreringen är modellbunden.
- **Skrivbundles:** Opus 4.8 (`MODELS.writing`) — FAS 1-BESLUT 2026-06-12: behållen efter
  A/B mot Fable 5 (mänsklig blindgranskning Opus 7–1; LLM-judgen sa Fable 50–1 = belagd
  stilbias, se `evals/results-bid-model-comparison.md`)
- **LLM-judge-tally får ingen beslutsvikt** utan validering mot blindfacit-paren
  (kalibreringsdata från fas 1 — 8 människomärkta par)
- **Extraction (Sonnet 5) körs med temperature 0** sedan fas 1 — samma underlag ska ge
  samma kravlista (reproducerbarhet gäller INOM en modellversion); **matchning/go-no-go/
  writingSupport/writingGeneric:** Sonnet 5 (sedan 2026-07-03); **prefilter/radar:** Haiku;
  **judge:** Sonnet 4-6 (kalibreringsbunden, se grind-policyn)
- **Princip:** Varje steg får föregående stegs komprimerade output, inte rådokumenten

## Arbetsregler

### Goal-Driven Execution (inspirerat av Karpathy)

Varje uppgift ska ha verifierbara framgångskriterier INNAN implementation startar.

Omformulera vaga mål:
- "Fixa PPTX:en" -> "Slides ska ha konsekvent padding, logo i header, och matchande färger mot StyleGuide — verifiera via manuell PPTX-export"
- "Lägg till validering" -> "Skriv test för ogiltiga inputs, implementera tills testerna passerar"
- "Refaktorera X" -> "Alla befintliga tester passerar före och efter"

Vid flerstegsuppgifter, formulera plan som:
```
1. [Steg] -> verifiera: [kontroll]
2. [Steg] -> verifiera: [kontroll]
```

Tydliga kriterier = autonomt arbete. Vaga kriterier = stanna och fråga.

### Surgical Changes

Vid ändringar i befintlig kod:
- Rör BARA det som uppgiften kräver. Varje ändrad rad ska spåras till requestet.
- "Förbättra" inte angränsande kod, kommentarer, eller formatering.
- Matcha befintlig stil, även om du hade gjort annorlunda.
- Om dina ändringar skapar orphans (oanvända imports/variabler) — städa dem. Men rör inte pre-existing dead code om det inte efterfrågas.

### Projektspecifika gotchas

- `callClaude()` i `ai-client.ts` hanterar retry + structured outputs (`output_config.format`
  ur Zod-schemat, nödlucka `BIDSMITH_STRUCTURED_OUTPUTS=off`) — använd den, skriv inte egen
- `callClaude` tar `cachedContext` för delad kontext (cachat system-block). OBS:
  `output_config.format` deltar i cache-prefixet — anrop med olika scheman delar ALDRIG
  cache; prewarm utan format värmer inget (se fas 0-resultatdokumentet). Cachen ger
  träff vid retries/regenerering med samma schema.
- Zod-schemas i `ai-schemas.ts` — validera alla AI-responses, lägg till schema där om det saknas
- markitdown-js för dokumentparsning (PDF, DOCX, PPTX, XLSX) — inte mammoth/pdf-parse
- DB-migreringar: namnge `NNN_beskrivning.sql`, applicera manuellt via Supabase SQL Editor
- **Redigera ALDRIG en applicerad migration** — skriv en ny migration med `ALTER` istället. Att ändra historik orsakar drift mellan dev/prod schema.
- Filstorlek-gräns: 20MB i document-parser
- Rate limits: håll koll vid externa API-anrop
- Encoding: explicit UTF-8 för alla strängoperationer med svenska tecken

## Tech-stack

Next.js 16 (App Router), Tailwind v4, Supabase (PostgreSQL + Storage), pptx-automizer, Vercel.

## Viktiga filer

```
src/lib/ai-client.ts       # Centraliserad Claude-anrop med retry
src/lib/ai-schemas.ts       # Zod-schemas för AI-responses
src/lib/document-parser.ts  # markitdown-js wrapper
src/lib/bid-generator.ts    # M2: parallella AI-anrop, PPTX-rendering
docs/architecture.html       # Arkitekturöversikt
```
