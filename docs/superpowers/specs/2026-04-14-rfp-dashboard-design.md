# RFP Dashboard — Design Spec

## Problem

Startsidan (`/`) är idag bara en upload-form. När en konsult har laddat upp en RFP måste de komma ihåg länken till `/analysis/[id]` — ingen överblick över vad som är på gång, inget sätt att återbesöka gamla RFPs, ingen hook för att logga utfall på skickade anbud.

Konsekvens: ingen data om vunna/förlorade anbud samlas in → ingen feedback-loop till Go/No-Go-modellen → ingen moat byggs.

## Solution

Tvådelad pipeline-rail på startsidan (höger sida, ~260px). Sektion 1 visar *relevanta RFPs, deadline-sorterade* (pipen). Sektion 2 visar *inlämnade anbud med utfallsstatus* (moaten). En "Logga utfall"-sidopanel fångar outcome-data med minimalt friktion.

**Styrprincip:** data-flywheeln är produktens moat. Allt UI runt outcome-loggning optimeras för att få konsulten att fylla i, utan att pressa.

## What stays unchanged

- Upload-hero i main-area på `/` (samma copy och form)
- `/radar` förblir separat vy för TED-browsing
- `/analysis/[id]`, `/bids/[id]`, `/consultants` — orörda
- `documents`, `analyses`, `rfp_opportunities` tabeller — orörda
- `callClaude()`, Zod-schemas, markitdown-js — ingen ändring

## Scope

**In scope:**
- Ny rail-komponent på `/` med sektion 1 (pipen) + sektion 2 (inlämnade)
- Ny "Logga utfall"-side-sheet (expanderar från 440px → 720px vid commit)
- Ny `/api/pipeline` och `/api/bids/outcome`-endpoints
- Migration 007: utöka `bids` med utfalls-metadata + lägg till `cancelled`-state
- Dismissad-drawer (kollapsad längst ner i rail:et)
- Inline flywheel-copy i enrichment-panelen + reciprocity-rad i rail-footern

**Out of scope:**
- Full pipeline-sida på egen route (allt ryms i rail:et)
- Unified vy med `/radar` (radar förblir separat)
- Aggregated analytics / win-rate-dashboard (egen feature)
- Multi-tenant filtrering (vi har bara en organisation i dev)
- Email-notifikationer för outcome-loggning (senare)
- "Markera som inlämnat"-knapp separat från export (antag export = inlämnat)

## Arkitektur

```
Startsida (/) — main + rail
├── Main (1fr): <UploadForm /> — oförändrad
└── Rail (260px): <PipelineRail />
    ├── Section 1: <PipelineList> — relevanta RFPs, deadline-sorterade
    ├── Section 2: <SubmittedList> — inlämnade anbud
    ├── Reciprocity-rad
    └── Dismissed-drawer (kollapsad)

<OutcomeSheet /> — overlay, slide-in från höger
├── Awaiting-lista (1-klick Vunnen/Förlorad/Avbröts)
└── Enrichment-panel per committed bid (valfri)
```

### Sektion 1 — "Pipen" (datakällor)

UNION av två dataset, server-side i `/api/pipeline`:

1. **TED opportunities** (`rfp_opportunities`):
   - `WHERE relevance_score >= 65 AND deadline >= CURRENT_DATE AND status != 'dismissed'`
   - `AND NOT EXISTS (bid via analysis_id WHERE exported_at IS NOT NULL)` — dvs ej redan inlämnat
   - OBS: kolumnen heter `relevance_score`, status är en enum (`'new'|'scored'|'dismissed'|'analyzing'|'analyzed'`)

2. **Egna uppladdningar** (`documents` JOIN `analyses`):
   - Där dokumentet har en analys
   - `AND NOT EXISTS (bid with status = 'exported' on that analysis)` — dvs inte inlämnat än
   - Deadline hämtas från `analyses.analysis->>submission_deadline` (JSONB)

Sortering: `deadline ASC`. Urgency-färg på vänstergränsen:
- `deadline - today < 7d` → röd (#dc2626)
- `7d <= deadline - today < 14d` → orange (#d97706)
- `deadline - today >= 14d` → grön (#10b981)

Row-layout (per mockup, variant C):
```
│  Titel                              6 dagar kvar
│  Egen upload · 20 apr
```
Klick → navigerar till `/analysis/[analysisId]` (egen upload) eller triggar `POST /api/radar/[id]/analyze` (TED, befintlig endpoint) och sedan `/analysis/[id]`.

### Sektion 2 — "Inlämnade anbud" (datakällor)

`bids WHERE exported_at IS NOT NULL`, sorterat server-side:
1. `outcome IS NULL` först (väntar beslut, äldsta först)
2. Sedan loggade utfall, `outcome_logged_at DESC` (nyast först)

Sub-states via vänstergräns-färg:
- Awaiting (grå #94a3b8)
- Won (grön #10b981)
- Lost (röd #dc2626)
- Cancelled (grå #94a3b8 dashed)

Max 8 rader totalt i rail:et. Om fler: "+N äldre →" länk till framtida full-vy (out of scope).

Under listan, om någon är "awaiting":
> 📊 **N anbud väntar på utfall — Logga utfall →**

Längst ner, om det finns loggade utfall:
> *"Du har loggat X utfall — Go/No-Go-rekommendationer är nu kalibrerade mot er firma."*

Om 0 loggat än: *"Logga ditt första utfall för att börja träna modellen mot er firma."*

### Outcome Side-Sheet

Trigger: klick på "Logga utfall"-länken i sektion 2.

**State A — initial (440px)**
- Lista över alla awaiting bids
- Varje rad: titel, meta (inlämningsdatum, team), 3 knappar: **Vunnen / Förlorad / Avbröts**
- Header: "Logga utfall · N väntar"
- Subheader (amber banner): *"📊 Detaljerna här tränar din firmas Go/No-Go-modell — vi lär oss vad ni vinner och förlorar på."*

**State B — efter commit (720px)**
- Raden som just committades ändrar border-färg (grön/röd/grå) och visar outcome-badge
- Expand-panel poppar in under raden med 2-kolumns enrichment-form:
  - *Vem vann?* (text, valfritt)
  - *Varför?* (dropdown: pris / erfarenhet / team / kvalitet / relation / annat, valfritt)
  - *Fri kommentar* (textarea, valfritt, full bredd)
  - Knappar: **Spara** / **Hoppa över**
- Panel-header: *"💡 Valfria detaljer — tränar modellen. Hoppa över om du inte vet."*

Panel-bredden ändras dynamiskt (CSS transition). Stäng återställer till 440px.

### Dismissed Drawer

Placering: längst ner i rail:et, kollapsad default.

Visar: räkningen över dismissade TED-opportunities (`rfp_opportunities WHERE status = 'dismissed'`).
Format: `"N avfärdade →"` — klick navigerar till `/radar` med filter på dismissade (återanvänder befintlig dismiss/undismiss-UX). Ingen egen lista i rail:et i MVP.

**Känt hål:** Uploadade RFPs där Go/No-Go = No ligger kvar i sektion 1 evigt (eftersom de aldrig når `bids.status = 'exported'`). I praktiken = de dyker inte upp i listan förrän deadline passerar och `deadline < today`-filtret rensar ut dem. Acceptabelt för MVP. Framtida lösning: `documents.dismissed_at` eller explicit "Avfärda"-knapp på `/analysis/[id]` när Go/No-Go = No.

## Data model — migration 007

```sql
-- 007_bid_outcome_metadata.sql

-- Utöka bids med outcome-detaljer
ALTER TABLE bids ADD COLUMN competitor_name text;
ALTER TABLE bids ADD COLUMN loss_reason text;
ALTER TABLE bids ADD COLUMN loss_comment text;
ALTER TABLE bids ADD COLUMN outcome_logged_at timestamptz;

-- Validera loss_reason-värden (nullable)
ALTER TABLE bids ADD CONSTRAINT bids_loss_reason_check
  CHECK (loss_reason IS NULL OR loss_reason IN
    ('pris','erfarenhet','team','kvalitet','relation','annat'));

-- Utöka outcome-enum med 'cancelled'
-- OBS: verifiera faktiskt constraint-namn först med:
--   SELECT conname FROM pg_constraint WHERE conrelid = 'bids'::regclass AND contype = 'c';
-- Default-namn för inline column-check är typ "bids_outcome_check" men kan variera.
ALTER TABLE bids DROP CONSTRAINT bids_outcome_check;
ALTER TABLE bids ADD CONSTRAINT bids_outcome_check
  CHECK (outcome IS NULL OR outcome IN ('won','lost','no-bid','cancelled'));

-- Index för dashboarden (sorterar awaiting först, sen per loggningstid)
CREATE INDEX idx_bids_dashboard ON bids (exported_at)
  WHERE exported_at IS NOT NULL;
```

Observera: `exported_at` finns redan i migration 004 och används som "submitted_at" — ingen ny kolumn behövs.

`loss_reason`, `loss_comment`, `competitor_name` är bara meningsfulla när `outcome = 'lost'`. Ej hårt constraint-validerat (för enkelhetens skull), men UI validerar inte heller hårt — fälten syns bara i lost-enrichment-panelen.

## API

### `GET /api/pipeline`
Returnerar sektion 1-data (union av TED + uploads, sorterat på deadline).

Response:
```ts
{
  items: Array<{
    id: string
    source: 'ted' | 'upload'
    title: string
    deadline: string    // ISO date
    daysLeft: number
    urgency: 'urgent' | 'soon' | 'later'
    score?: number       // TED only
    analysisId?: string  // upload only (finns om analyserad)
    opportunityId?: string  // TED only
  }>
}
```

### `GET /api/bids/dashboard`
Returnerar sektion 2-data, förhandssorterat per rail:ets logik (awaiting först, sen nyast loggade).

Response:
```ts
{
  items: Array<BidSummary>   // max 8, ordnad enligt sektion 2-sortering
  stats: {
    awaitingCount: number    // totalt (inte begränsat till 8)
    loggedCount: number
    wonCount: number
    lostCount: number
  }
}

type BidSummary = {
  id: string
  title: string       // från analysis
  exportedAt: string
  teamNames?: string[]   // för sheet:et — konsultnamn från team_consultant_ids
  outcome?: 'won' | 'lost' | 'no-bid' | 'cancelled'
  outcomeLoggedAt?: string
  competitorName?: string
  lossReason?: string
}
```

### `PATCH /api/bids/[id]/outcome`
Body:
```ts
{
  outcome: 'won' | 'lost' | 'cancelled'
  competitorName?: string
  lossReason?: 'pris' | 'erfarenhet' | 'team' | 'kvalitet' | 'relation' | 'annat'
  lossComment?: string
}
```
Sätter fälten + `outcome_logged_at = now()`.

## UI-komponenter

- `<PipelineRail>` — container, fetchar båda dataseten via SWR/fetch på client
- `<PipelineRow>` — sektion 1-rad (colored border, deadline badge, klick → navigate)
- `<SubmittedRow>` — sektion 2-rad (outcome-badge om committed)
- `<OutcomeSheet>` — overlay, expanderbar, hanterar initial list + enrichment-state
- `<OutcomeEnrichmentForm>` — 2-kolumns form

Ny CSS-variabel-set för urgency-färger (lägg i `globals.css`).

## Error handling

- `/api/pipeline` 5xx → rail visar "Kunde inte ladda pipen" + "Försök igen"-länk
- `/api/bids/outcome` 5xx → form behåller värden, visar felmeddelande nära Spara-knappen
- Sektion 1 tom → *"Inga aktuella RFPs. Ladda upp eller kika på [Radar →]"*
- Sektion 2 tom → *"Inga inlämnade anbud än. Exporterar du ett anbud hamnar det här."*
- Båda sektionerna tomma → rail kollapsar till en "Kom igång"-panel med upload-länk
- `deadline < today` rader filtreras bort server-side, visas inte

## Testing

**Unit (vitest):**
- `buildPipelineUnion()` — givet fixtures från båda tabellerna, rätt sortering + filtrering
- `calculateUrgency(deadline)` — 6d → urgent, 10d → soon, 20d → later, -1d → filtreras
- `PATCH /api/bids/[id]/outcome` — happy path + validation errors

**Manuellt:**
- Ladda upp RFP → den dyker upp i sektion 1
- Kör hela workflow till export → den flyttas till sektion 2 som awaiting
- Klicka "Logga utfall" → sheet öppnas, klicka Förlorad → panel expanderar, fyll i → spara → rail uppdateras
- Verifiera att `bids.outcome`, `loss_reason`, `outcome_logged_at` har värden i DB
- Tomt state: rensa DB, ladda sidan → tomma-state-copy visas

## Dependencies

- Migration 007 på Supabase (manuellt via SQL Editor per CLAUDE.md)
- Inga nya npm-paket

## Open questions (tas i plan-fasen)

- Ska TED-rows i sektion 1 trigga analyze-anrop på klick, eller visas som "Öppna preview"? (existerande `/radar` har "Visa analys"-knapp — förmodligen återanvänd samma pattern)
- Övergångs-animation för sheet-breddförändring: rent CSS `transition: width 200ms` — verifiera att formen inte hoppar
- Behöver vi loading skeletons för rail:ets båda sektioner? (MVP: ja, enkla)
