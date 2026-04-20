@AGENTS.md

# Agentic Dealflow — CLAUDE.md

> Ärver globala instruktioner från `~/projects/CLAUDE.md`. Här ligger bara projektspecifika tillägg.

---

## Produkten

AI-agent som tar offertförfrågan + konsultprofiler och producerar anbudsutkast. Målgrupp: medelstora konsultfirmor (20-100 konsulter).

**Milstolpar:** M0 Kravanalys -> M1 Matchning -> M1.5 Go/No-Go -> M2 Anbudsgenerering -> M3 RFP-radar

## Modellstrategi

- **Extraction/matchning:** Sonnet — mekaniskt, strukturerar JSON
- **Anbudsskrivning:** Opus — kvalitetskritiskt, här avgörs vinst/förlust
- **Pre-filter (framtida):** Haiku — eliminera irrelevanta CV:n vid 80+ konsulter
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

- `callClaude()` i `ai-client.ts` hanterar retry + JSON-extraktion — använd den, skriv inte egen
- Zod-schemas i `ai-schemas.ts` — validera alla AI-responses, lägg till schema där om det saknas
- markitdown-js för dokumentparsning (PDF, DOCX, PPTX, XLSX) — inte mammoth/pdf-parse
- DB-migreringar: namnge `NNN_beskrivning.sql`, applicera manuellt via Supabase SQL Editor
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
