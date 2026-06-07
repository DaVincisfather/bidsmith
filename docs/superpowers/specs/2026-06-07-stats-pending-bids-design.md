# Statistik: pågående anbud — design

**Datum:** 2026-06-07
**Branch:** `feat/stats-pending-bids`
**Status:** Godkänd-pending (väntar Stefans spec-review)

## Problem

Statistik-sidan (`/arbetsyta/statistik`) räknar bara anbud där `outcome` är satt
(`won`/`lost`/`no-bid`/`cancelled`) — queryn filtrerar `bids` med
`.not("outcome", "is", null)`. Ett genererat anbudsutkast har `outcome = null`, så
arbete som pågår syns inte alls i statistiken. Stefan vill se pågående anbud, både som
en total och per person.

## Definition: "pågående anbud"

Ett anbud räknas som pågående när:
- `outcome IS NULL`, **och**
- `status IN ('draft', 'exported')`

Dvs. genererade utkast (draft) **och** exporterade/inlämnade anbud som väntar på besked.
`status = 'generating'` exkluderas (transient under genereringen).

Detta är något bredare än dashboardens "awaiting" (som bara tar `exported_at IS NOT NULL`),
medvetet: "jag har fått ett utkast" hinner före export.

## Period-beteende

Pågående **ignorerar** period-knappen (Allt / 30d / i år). Ett öppet anbud från 60 dagar
sedan är precis det man vill jaga; att gömma det under "30 dgr" vore fel. Kostnad och
win-rate fortsätter respektera perioden exakt som idag.

## Datalager — `src/lib/stats.ts`

### Nya typer
```ts
export interface PendingBid {
  id: string;
  title: string;            // RFP-titel från analysis, fallback "Namnlös RFP"
  status: "draft" | "exported";
}
```
- `UserStats` får `pending: PendingBid[]`.
- `WorkspaceStats` får `pendingCount: number`.

### Ny rad-typ för queryn
```ts
export interface PendingRow {
  id: string;
  created_by: string | null;
  status: string;           // "draft" | "exported"
  title: string;
}
```

### `aggregate()` utökas
- Ny parameter `pendingRows: PendingRow[]`.
- Varje pending-rad bucketas på `created_by` (null → `UNKNOWN_USER`, samma "Okänd"-fallback
  som idag) in i den användarens `pending`-lista.
- `pendingCount` = totalt antal pending-rader.
- Befintlig per-user-sortering (kostnad fallande) oförändrad. En användare som *bara* har
  pågående anbud (ingen kostnad/outcome ännu) ska ändå dyka upp i listan via `ensure()`.

### `getWorkspaceStats()` utökas
- Ny query (service-klient, som resten av filen):
  ```ts
  supabase
    .from("bids")
    .select("id, created_by, status, analyses!inner(analysis)")
    .is("outcome", null)
    .in("status", ["draft", "exported"]);
  ```
  **Ingen** `created_at`-periodfiltrering på denna query (se Period-beteende).
- Mappa varje rad → `PendingRow` med `title` från `analyses.analysis.title`
  (fallback `"Namnlös RFP"`, samma mönster som `dashboard/route.ts`).
- Skicka in i `aggregate()`.

## UI — `/arbetsyta/statistik`

### Sammanfattningsrad
Lägg en pågående-plutt sist i den befintliga raden:

`Total: $X · N anbud · win-rate Y% (W / L) · {pendingCount} pågående`

### Per-användartabell — tabell + expander
Tabellen behålls. Två förändringar:
1. Ny kolumn **Pågående** (höger om Win-rate) som visar `u.pending.length`. Om > 0 visas
   raden som klickbar (chevron-affordance ▸/▾); om 0 ingen affordance.
2. Klick på en rad med pågående anbud fäller ut en full-bredds rad under användarraden med
   anbudens chips: RFP-titel + liten status-badge (*Utkast* / *Exporterat*). Varje chip är
   en `<Link href={`/bids/${id}`}>` (samma destination som dashboardens `SubmittedRow`).

### Komponentstruktur
- `page.tsx` förblir server-komponent: hämtar `getWorkspaceStats(period)`, renderar rubrik +
  periodväljare + sammanfattningsrad, och delegerar tabellen.
- Ny klientkomponent `StatsTable` (`"use client"`) tar emot `perUser` och håller
  expand/collapse-state (`useState<Set<string>>` på `userId`). Ren presentational —
  ingen egen datahämtning.

## Test — `src/lib/stats.test.ts` (utöka befintliga)
- `aggregate()` bucketar pending-rader per `created_by`; `pendingCount` = total.
- Pending med `created_by = null` → "Okänd"-bucketen.
- En användare som bara har pending (ingen kostnad/outcome) syns i `perUser`.
- Pending påverkar **inte** `bidsSubmitted`/`wins`/`losses`/`winRate`.
- (Statusfiltrering testas på query-nivå, inte i `aggregate()` — `aggregate()` litar på att
  queryn bara skickar draft/exported, som dagens outcome-filter.)

## Utanför scope
- Cost-per-bid (kräver `bid_id` på `ai_call_logs`, finns inte).
- Designpolish av Arbetsyta-ytan (separat, funktionellt först).
- Ändringar i dashboarden eller pipeline-vyn.
</content>
</invoke>
