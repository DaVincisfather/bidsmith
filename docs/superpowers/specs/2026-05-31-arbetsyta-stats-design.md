# Arbetsyta-hub + org-statistik — Design

**Datum:** 2026-05-31
**Status:** Godkänd, redo för implementeringsplan
**Branch:** `feat/arbetsyta-stats`

## Bakgrund och syfte

Efter M4-teardownet (single-workspace) spårar `user_id` enbart attribution: vem
skapade ett anbud, vems API-kostnad. Den datan är idag oanvänd i UI. Samtidigt
blev Konsultbanken hemlös som en lös navlänk när `OrgDropdown` togs bort.

Denna feature gör två saker:

1. **Arbetsyta-hub** — en samlingssida (`/arbetsyta`) som ger Konsulter ett hem
   igen och blir hemvist för framtida arbetsyte-grejer (inställningar, mall-
   uppladdning, CPV-koder). Detta är **informationsarkitektur**, inte återinförd
   multi-tenancy — M4-tenancy förblir rivet.
2. **Org-statistik** — gör `user_id`-attributionen nyttig: token-kostnad,
   lämnade anbud och win-rate, både per användare och org-total. Ger Stefan
   pitch-ammunition till Ekan-ledningen.

Ingen schemaändring krävs — all data finns redan i `ai_call_logs` och `bids`.

## Beslut

- **Användaridentitet:** email via `supabase.auth.admin.listUsers()` (service-role).
  Ingen `profiles`-tabell.
- **"Lämnat anbud":** `bids.outcome IS NOT NULL`.
- **Win-rate:** `won / (won + lost)` — `no-bid` och `cancelled` exkluderas (de är
  inte konkurrensförluster). `null` när nämnaren är 0.
- **Tidsperiod:** enkel toggle `Allt / 30 dgr / I år`, via `?period=`.
- **Hub-IA:** landningssida med kort som länkar till egna sidor (inte flikar).
- **Render:** Server Components som queryar Supabase direkt; toggle = `searchParams`
  → server-rerender. Inga klient-fetch, inga JSON-endpoints, inget loading-state.

## Arkitektur

### Routes & filer

| Fil | Typ | Roll |
|---|---|---|
| `src/lib/stats.ts` | NY | Aggregeringslogik, typer, period, formatters |
| `src/app/arbetsyta/page.tsx` | NY | Landningssida (Server Component): två kort |
| `src/app/arbetsyta/statistik/page.tsx` | NY | Statistikvy (Server Component, läser `searchParams.period`) |
| `src/lib/__tests__/stats.test.ts` | NY | Enhetstester för aggregeringen |
| `src/app/layout.tsx` | EDIT | Nav: byt `Konsulter`-länken mot `Arbetsyta` |

`/consultants` är oförändrad — den nås nu via Konsulter-kortet på `/arbetsyta`
istället för toppnavet.

### Datamodul `src/lib/stats.ts`

```ts
type StatsPeriod = "all" | "30d" | "ytd";

interface UserStats {
  userId: string;
  email: string;          // listUsers(); fallback: userId-prefix
  costUsd: number;
  bidsSubmitted: number;  // outcome IS NOT NULL
  wins: number;           // outcome = 'won'
  losses: number;         // outcome = 'lost'
  winRate: number | null; // wins/(wins+losses); null om nämnare = 0
}

interface WorkspaceStats {
  period: StatsPeriod;
  totalCostUsd: number;
  bidsSubmitted: number;
  wins: number;
  losses: number;
  winRate: number | null;
  perUser: UserStats[];   // sorterad på costUsd desc
}

function periodStart(period: StatsPeriod, now?: Date): string | null;
async function getWorkspaceStats(period: StatsPeriod): Promise<WorkspaceStats>;
function formatUsd(n: number): string;
function formatPct(n: number | null): string;  // null → "—"
```

**Aggregeringsstrategi:** hämta rader och reducera i JS (inte SQL GROUP BY).
Supabase-JS saknar enkel GROUP BY utan RPC, och datavolymen är liten (demo). Två
queries via `createServiceClient()`:

- `ai_call_logs.select("user_id, cost_usd")` filtrerad på `created_at >= start`
- `bids.select("created_by, outcome")` med `outcome IS NOT NULL` och `created_at >= start`

Båda filtrerar på respektive **`created_at`** (= "aktivitet skapad i perioden").
`listUsers({ perPage: 1000 })` mappar `id → email`. Per-user-map = unionen av
user_ids från båda queries.

> Skalningsnot (kommenteras i koden): om radvolymen växer, flytta aggregeringen
> till en Postgres-vy/RPC. För demo räcker reduce-i-JS.

`periodStart`:
- `all` → `null` (ingen filtrering)
- `30d` → `now - 30 dygn` (ISO)
- `ytd` → 1 januari innevarande år (ISO)

`now` är en injicerbar parameter (default `new Date()`) så perioderna kan testas
mot en fast tidpunkt.

## UI

### `/arbetsyta` (landning)

Två server-renderade kort:

```
┌─ Konsulter ────┐   ┌─ Statistik ─────┐
│ 10 konsulter   │   │ $42.10 · 14 anbud│
│ →              │   │ →                │
└────────────────┘   └──────────────────┘
```

- Konsulter-kortet: antal konsulter (`count`-query) → länkar `/consultants`.
- Statistik-kortet: all-time total cost + lämnade anbud (`getWorkspaceStats("all")`)
  → länkar `/arbetsyta/statistik`.

Plain Tailwind, matchar befintlig stil (gråa ramar, `text-sm`).

### `/arbetsyta/statistik`

```
Statistik          [ Allt ] [ 30 dgr ] [ I år ]   ← länkar, ?period=

Total: $42.10 · 14 anbud · win-rate 36% (5 W / 9 L)

Användare        Kostnad   Anbud   W / L   Win-rate
stefan@…         $38.20    12      4 / 7    36%
kollega@…        $3.90     2       1 / 0   100%
Okänd            $0.00     0       –        –
```

- Period-toggle = tre `<Link>` som sätter `?period=`. Aktiv period markeras.
- Org-total överst, per-user-tabell sorterad på kostnad desc.
- Win-rate visas `—` när nämnaren är 0.

## Edge cases

- **Ingen data** → nollor, tom tabell, win-rate `—`.
- **Kostnad utan anbud (eller tvärtom)** → rad med nollor på saknad sida (union).
- **`user_id`/`created_by` = null** (kolumnerna är nullable) → bucketas som rad
  "Okänd", räknas in i total.
- **`listUsers()` misslyckas** → degradera: visa `userId`-prefix istället för
  email, krascha inte sidan.
- **`listUsers()`-paginering** → `perPage: 1000` i ett anrop; kommentar om att
  loopa sidor om användarantalet växer (YAGNI för demo).
- **Ogiltig `?period=`** → faller tillbaka till `"all"`.

## Testning

`src/lib/__tests__/stats.test.ts` — mockar `createServiceClient` (samma mönster
som `ai-call-logger.test.ts`):

- `periodStart()`: `30d` / `ytd` / `all` mot injicerat fast `now`.
- Reduce: kostnad-bara-användare, anbud-bara-användare, blandad användare;
  win-rate nämnare 0 → `null`; null-user bucketas till "Okänd"; total = summan
  av per-user.
- `listUsers()`-fel → email-fallback till userId-prefix.

Ingen UI-komponenttest i v1 (funktionellt först, matchar befintlig minimal
coverage på sidor).

**Verifiering före "klar":** `npm run build` + `npm test` gröna, samt manuell
smoke av `/arbetsyta` och period-toggle på `/arbetsyta/statistik`.

## Avgränsningar (YAGNI / framtida)

- Ingen kostnad-per-anbud — `ai_call_logs` saknar `bid_id`. Bara aggregerad
  kostnad per användare/total. (Skulle kräva bid_id-plumbing genom bid-gen.)
- Ingen full datumväljare — bara tre fasta perioder.
- Ingen `profiles`-tabell / visningsnamn — email räcker.
- Inga workspace-inställningar än — hubben är bara förberedd för dem.
- Kapacitetsgap-kartan, referens-ROI och utfalls-loopen är separata framtida
  features (se roadmap-pitch), inte del av denna spec.
