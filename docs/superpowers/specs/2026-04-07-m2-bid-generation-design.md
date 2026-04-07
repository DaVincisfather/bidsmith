# M2: Anbudsgenerering — Design Spec

**Datum:** 2026-04-07
**Status:** Godkänd
**Föregående milstolpe:** M1.5 Go/No-Go (mergad till master)

---

## Syfte

Generera ett redigerbart anbudsutkast (PowerPoint) baserat på RFP-analys, låst team och Go/No-Go-bedömning. Användaren ska kunna granska sektioner, regenerera enskilda delar, och sedan ladda ner en .pptx-fil att redigera vidare i PowerPoint.

## Övergripande flöde

```
Go/No-Go ✓ → "Gå vidare till anbud"
  → Bid skapas (POST /api/bids)
  → AI genererar sektioner (Opus 4.6, en per sektion)
  → Preview-vy: sektionsöversikt med titel + nyckelinnehåll
  → Användaren kan regenerera enskilda sektioner
  → "Ladda ner PowerPoint" → .pptx genereras och laddas ner
```

Anbudsflödet är en ny fas i samma analysis-vy, efter Go/No-Go.

## Sektionstyper

Tre kategorier:

| Typ | Genereras av | Sektioner |
|-----|-------------|-----------|
| **AI-genererad** | Opus 4.6, separat anrop per sektion | Uppdragsförståelse, Genomförandeplan (faser), Team-presentationer, Referensuppdrag, Sammanfattning |
| **Data-driven** | Template + strukturerad data | Framsida, Kravmatris (konsult x krav), Innehållsförteckning |
| **Placeholder** | Tom slide med instruktion | Pris & omfattning, Sekretess/certifieringar, Kontakt |

### AI-genererade sektioner — kontext

Varje Opus-anrop får samma kontext:

- RFP-analys (strukturerad JSON från M0)
- Låst team med individuella scores och reasoning (från M1)
- Go/No-Go-bedömning: styrkor, luckor, vinstchans (från M1.5)
- Konsulters CV-data: kompetenser, referensuppdrag

Varje anrop har en **sektionsspecifik systemprompt** med instruktioner om ton, längd och vad som ska framhävas.

### AI-output format

Varje sektion returnerar strukturerad JSON (inte PowerPoint-instruktioner):

```typescript
interface BidSection {
  type: "ai" | "data" | "placeholder";
  key: string;           // t.ex. "understanding", "execution-plan"
  title: string;         // Slide-rubrik
  content: BidSectionContent;
  generatedAt: string;   // ISO timestamp
}

// Varierar per sektionstyp
type BidSectionContent =
  | { format: "prose"; text: string }
  | { format: "bullets"; items: string[] }
  | { format: "phases"; phases: ExecutionPhase[] }
  | { format: "team"; members: TeamPresentation[] }
  | { format: "references"; references: BidReference[] }
  | { format: "requirement-matrix"; rows: RequirementRow[] }
  | { format: "cover"; title: string; client: string; date: string }
  | { format: "placeholder"; instruction: string };
```

PPTX-renderingen mappar varje `format` till en slide-layout.

### Sub-typer

```typescript
interface ExecutionPhase {
  name: string;          // "Fas 1: Nulägesanalys"
  objective: string;     // Vad fasen ska uppnå
  activities: string[];  // Konkreta aktiviteter
  deliverables: string[];// Leverabler
  duration: string;      // "2 veckor"
}

interface TeamPresentation {
  consultantId: string;
  name: string;
  role: string;          // Roll i detta uppdrag
  relevantExperience: string; // Filtrerat mot RFP:ns krav
  keyCompetencies: string[];
}

interface BidReference {
  title: string;
  client: string;
  year: number;
  description: string;
  relevance: string;     // Varför detta referensuppdrag är relevant för RFP:n
}

interface RequirementRow {
  requirement: string;
  priority: "must" | "should" | "nice-to-have";
  coverage: Record<string, boolean>; // consultantId → uppfyllt
}
```

### Sektionsdefinitioner

| # | Key | Typ | Format | Beskrivning |
|---|-----|-----|--------|-------------|
| 1 | `cover` | data | cover | Framsida: titel, kund, datum, logotyp |
| 2 | `toc` | data | bullets | Innehållsförteckning (genererad från sektionstitlar) |
| 3 | `understanding` | ai | prose | Uppdragsförståelse — "så här tolkar vi ert behov" |
| 4 | `value-proposition` | ai | bullets | Identifierat värde, kopplat till uppdragsförståelsen |
| 5+ | `execution-phase-N` | ai | phases | Genomförandeplan, en slide per fas. AI:n bestämmer antal faser baserat på RFP:ns komplexitet (typiskt 3-5). |
| 10 | `quality` | ai | prose | Kvalitetssäkring och samverkan |
| 11 | `risks` | ai | bullets | Risker och hantering |
| 12 | `team` | ai | team | Team-presentation med relevant erfarenhet per konsult |
| 13 | `requirement-matrix` | data | requirement-matrix | Kravmatris: konsult x ska/bör-krav |
| 14 | `references` | ai | references | Relevanta referensuppdrag, cherry-pickade mot RFP-domän |
| 15 | `summary` | ai | prose | Sammanfattning — varför oss |
| 16 | `pricing` | placeholder | placeholder | Pris & omfattning (firman fyller i) |
| 17 | `confidentiality` | placeholder | placeholder | Sekretess, certifieringar (framtida standardslides) |
| 18 | `contact` | placeholder | placeholder | Kontaktuppgifter |

Antalet slides anpassas efter RFP:ns komplexitet. Enkla RFP:er kan ge ~10 slides, komplexa ~25.

## Modellstrategi

**Opus 4.6** för alla AI-genererade sektioner. Anbudstexten är kvalitetskritiskt — här avgörs vinst/förlust.

Varje sektion genereras i ett separat anrop. Fördelar:
- Högre kvalitet per sektion (ingen kvalitetstapp mot slutet)
- Regenerering av enskild sektion utan att allt görs om
- Parallelliserbar (flera sektioner kan genereras samtidigt)

## PowerPoint-generering

### Bibliotek

`pptxgenjs` — Node.js-bibliotek för programmatisk .pptx-generering.

### Brandingprofil

Lagras i `organizations.style_guide` (jsonb, redan i schemat):

```json
{
  "colors": {
    "primary": "#1A2B4A",
    "primaryLight": "#2D4A7A",
    "secondary": "#E8913A",
    "secondaryLight": "#F4B76E",
    "accent": "#2E8B57",
    "dark": "#1A1A1A",
    "light": "#F5F5F0",
    "muted": "#6B7280"
  },
  "font": "Calibri",
  "logoUrl": "https://..."
}
```

### Slide-layouts

Byggs programmatiskt baserat på `format`:

- **cover** — centrad titel, kund, datum, logotyp, primary-bakgrund
- **prose** — rubrik (primary) + löpande text (dark)
- **bullets** — rubrik + punktlista
- **phases** — fasnamn, mål, aktiviteter, leverabler per fas
- **team** — namn, roll, sammanfattning, nyckelkompetenser per konsult
- **references** — uppdragstitel, kund, år, relevans-koppling
- **requirement-matrix** — tabell med konsulter som kolumner, krav som rader, check/cross
- **placeholder** — rubrik + instruktionstext i muted-färg

## Datamodell

### Ny tabell: `bids`

```sql
create table bids (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid references analyses(id) not null,
  assessment_id uuid references go_no_go_assessments(id),
  organization_id uuid references organizations(id),
  team_consultant_ids uuid[] not null,
  sections jsonb not null default '[]',
  status text not null default 'generating'
    check (status in ('generating', 'draft', 'exported')),
  outcome text check (outcome in ('won', 'lost', 'no-bid')),
  exported_at timestamptz,
  created_at timestamptz default now() not null
);

create index idx_bids_analysis on bids(analysis_id);
create index idx_bids_org on bids(organization_id);
```

**Fält:**
- `sections`: JSON-array av `BidSection`-objekt. Regenerering uppdaterar enskilt element.
- `status`: `generating` → `draft` (alla sektioner klara) → `exported` (pptx laddad ner)
- `outcome`: feedback-loop — firman rapporterar vinst/förlust. Kopplar till data-flywheel.

## API-endpoints

| Metod | Route | Beskrivning |
|-------|-------|-------------|
| POST | `/api/bids` | Skapar bid, triggar generering av alla sektioner |
| GET | `/api/bids/[id]` | Hämtar bid med alla sektioner |
| POST | `/api/bids/[id]/regenerate/[sectionKey]` | Regenererar en specifik sektion (nytt Opus-anrop) |
| GET | `/api/bids/[id]/export` | Genererar och returnerar .pptx-fil |
| PATCH | `/api/bids/[id]` | Uppdaterar status/outcome |

### POST /api/bids — request body

```json
{
  "analysisId": "uuid",
  "assessmentId": "uuid",
  "teamConsultantIds": ["uuid", "uuid"]
}
```

### POST /api/bids — response

```json
{
  "id": "uuid",
  "status": "generating",
  "sections": []
}
```

Sektionerna genereras sekventiellt i `POST /api/bids`-handlern (Opus-anrop tar ~5-15s per sektion). Klienten streamas inte — den pollar `GET /api/bids/[id]` tills `status === "draft"`. Varje sektion sparas till DB direkt efter generering, så klienten ser progressiv uppdatering vid polling.

**Vercel-timeout:** Vercel Hobby har 60s timeout, Pro har 300s. Med ~8 AI-sektioner à ~10s = ~80s behövs Pro-plan eller att genereringen körs i bakgrund. Initialt: generera sektioner sekventiellt i route handlern. Om timeout blir problem, bryt ut till en edge function eller kö-baserad lösning.

### GET /api/bids/[id]/export — response

Binary .pptx-fil med `Content-Disposition: attachment`.

## UI-design

### Preview-vy

Ny komponent `BidPreview` renderas i analysis-sidan efter Go/No-Go:

```
┌──────────────────────────────────────────┐
│ Anbud                        Genereras...│
├──────────────────────────────────────────┤
│ ✓  Framsida                              │
│ ✓  Uppdragsförståelse        [Regenerera]│
│    "Vi förstår att ni söker..."          │
│ ✓  Genomförandeplan          [Regenerera]│
│    "Fas 1: Nuläge — Fas 2: ..."         │
│ ✓  Teamet                   [Regenerera] │
│    "Anna Svensson, Erik..."              │
│ ✓  Kravmatris                            │
│ ✓  Referensuppdrag           [Regenerera]│
│ ⬜  Pris & omfattning (placeholder)      │
│ ⬜  Sekretess (placeholder)              │
├──────────────────────────────────────────┤
│          [Ladda ner PowerPoint]          │
└──────────────────────────────────────────┘
```

- AI-sektioner visar en kort preview (första ~100 tecken)
- "Regenerera"-knapp på varje AI-sektion
- Laddningsstatus per sektion under generering
- "Ladda ner PowerPoint" aktiveras när status === "draft"

### Integration med befintlig vy

`analysis-match-section.tsx` har redan `proceedToBid()` som placeholder. Denna utökas till att:
1. Skapa bid via `POST /api/bids`
2. Visa `BidPreview`-komponenten
3. Polla tills alla sektioner genererats

## Ny fil-struktur

```
src/lib/
  bid-generator.ts          — orchestrator: skapar sektioner, anropar Opus
  bid-section-prompts.ts    — systemprompts per sektionstyp
  pptx-renderer.ts          — bygger .pptx från sektioner + branding
  types.ts                  — utökas med BidSection, etc.

src/app/api/bids/
  route.ts                  — POST (skapa bid)
  [id]/
    route.ts                — GET (hämta bid), PATCH (uppdatera)
    regenerate/
      [sectionKey]/
        route.ts            — POST (regenerera sektion)
    export/
      route.ts              — GET (generera pptx)

src/components/
  bid-preview.tsx           — preview-vy med sektionslista
  bid-section-card.tsx      — enskild sektion med preview + regenerera

supabase/migrations/
  004_bids.sql              — bids-tabell
```

## Avgränsningar (utanför M2)

- Ingen WYSIWYG-redigering av sektionsinnehåll i appen
- Ingen egen PPT-mall-uppladdning
- Inga standardslides per organisation (placeholder-slides istället)
- Inget pris-kalkyleringsverktyg
- Ingen Gantt-generering (text-baserad fasöversikt istället)
- Inget UI för att redigera brandingprofil (seedas manuellt)
