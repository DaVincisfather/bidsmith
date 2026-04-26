# Organisation-dropdown + Inställningar — Design Spec

## Problem

Top-nav-länken `Din organisation` går idag direkt till `/organisation` (en index-sida med två cards: Konsulter, Team). Det finns inget snabbsätt att hoppa direkt till en sub-vy från nav:et, och det finns ingen yta där en super_user kan sätta organisationens egna brand-attribut (display-namn, logo, accentfärg) — något som behövs för att tenant-känslan ska sätta sig i produkten och för att framtida PPTX-export ska kunna brandas per kund.

Junto är produktens varumärke och visuella DNA. Tenanten är en överlappning på det DNA:t — de ska känna att produkten är deras utan att Junto-identiteten försvinner.

## Solution

Tre relaterade ändringar som hör ihop konceptuellt:

1. **Dropdown under `Din organisation`** med children Översikt / Konsulter / Team / Inställningar. Parent-länken navigerar inte; menyn är enda vägen in.
2. **Banner-headern på `/organisation`** introducerar tenant-overlay: en kompakt rad med tenantens 28px-logo + display-namn + subtitle "Din organisation".
3. **Ny sub-route `/organisation/settings`** där super_users sätter display-namn, logo och accentfärg.

**Styrprincip:** Junto-DNA är basen överallt (top-nav, login, marketing). Tenant-overlay förekommer på exakt tre ytor: `/organisation`-banner, `/organisation/settings`-preview och PPTX-export. Inget annat.

## What stays unchanged

- Junto top-nav, dess logo och dess design — ALDRIG ersatt med tenant-logo
- Login- och marketing-flöden — alltid Junto
- `/organisation` som sida finns redan; vi byter ut header och utökar cards-grid:en från 2 till 3
- `/organisation/team` (befintlig invite-flow + roll-toggle) — orörd
- `/organisation/consultants` (befintlig konsultlista) — orörd
- Befintlig RLS, server actions, role-guards och `withOrgGuard`-mönster — återanvänds
- PPTX-renderaren — denna spec rör INTE renderaren; tenant-accent in i PPTX är en separat senare spec

## Scope

**In scope:**
- Dropdown-komponent i top-nav under `Din organisation` (hover eller klick öppnar; parent navigerar inte)
- Översikts-länk i dropdown leder till `/organisation`
- Banner-header på `/organisation` (28px logo + display-namn + subtitle)
- Tredje card "Inställningar" i `/organisation`-grid
- Ny route `/organisation/settings` (sub-route, hierarkiskt)
- Migration 011: `organizations.display_name`, `logo_url`, `accent_color`
- Supabase Storage-bucket `org-assets` med RLS (members READ, super_user WRITE)
- Server action: uppdatera display-namn, logo-URL, accent
- File-upload-flow för logo (PNG/SVG via drag-drop eller browse)
- Curated swatch-palett (5 färger) + hex-input
- Live-preview av accent på PPTX-snippet i `/settings`

**Out of scope:**
- PPTX-rendering med tenant-accent (separat spec — kräver template-stack-koppling)
- User-level settings (notifikationer, profil-bild) — ej kund-efterfrågat
- Mobil hamburger-meny för dropdown — desktop-first; mobile får enkel kollapsad lista i M0-state
- Logo-cropping/resizing-UI — vi sparar filen som-den-är, max 2 MB
- Custom-färg utanför hex (gradients, opacity) — håll det enkelt
- Multi-logo (light/dark variant) — en logo per org

## Arkitektur

```
Top-nav (Junto-DNA)
└── <OrgDropdown>                          ny komponent, top-nav
    ├── Trigger: "Din organisation ▾"      hover eller klick öppnar
    └── Menu:
        ├── Översikt        → /organisation
        ├── Konsulter       → /organisation/consultants
        ├── Team            → /organisation/team
        └── Inställningar   → /organisation/settings  (super_user only)

/organisation                              befintlig sida, header bytt
├── <OrgBanner>                            ny: 28px logo + namn + "Din organisation"
└── Cards-grid (3 st)
    ├── Konsulter           befintlig
    ├── Team                befintlig
    └── Inställningar       ny, hidden om role !== "super_user"

/organisation/settings                     ny route
└── <SettingsForm>
    ├── Display-namn                       text input
    ├── Logo                                drag-drop zon + preview
    ├── Accentfärg                          5 swatches + hex-input
    └── Live-preview                        liten PPTX-snippet
```

**Tenant-overlay-modellen:**

| Yta | Branding |
|---|---|
| Top-nav, login, marketing | Junto |
| `/organisation`-banner | Tenant logo + display-namn |
| `/organisation/settings`-preview | Tenant logo + accent |
| PPTX-export (senare spec) | Tenant logo + accent |
| Allt annat | Junto |

## Datamodell

**Migration 011 — `011_organisation_branding.sql`:**

```sql
ALTER TABLE organizations
  ADD COLUMN display_name text,
  ADD COLUMN logo_url text,
  ADD COLUMN accent_color text DEFAULT '#1F2937';
```

- `display_name` är NULLABLE — fallback till `organizations.name` (befintlig kolumn) i UI om null
- `logo_url` är NULLABLE — fallback till en text-platshållare med initialer i UI om null
- `accent_color` har default `#1F2937` (neutral slate) — sätts på alla existerande rader. Bytte från Ekan-teal eftersom det är kund-specifikt; revideras när Junto-branding finns klar

**Storage-bucket `org-assets`:**

- Public bucket (signerade URLs är overkill för publika logos)
- Path-konvention: `org-assets/<org_id>/logo-<timestamp>.<ext>` — timestamp i namnet ger cache-busting och slipper PUT-overwrite-problem
- Max 2 MB, accepterar PNG, SVG och JPEG
- RLS:
  - SELECT: alla autentiserade members av org:et
  - INSERT/UPDATE/DELETE: bara super_users i org:et

## Komponentstruktur

**`<OrgDropdown>` (client-component, top-nav):**
- State: `open: boolean`
- Trigger: keyboard + mouse (Enter/Space på trigger, hover öppnar, klick utanför stänger)
- Items lazy-renderas (ingen prefetch om inte visat)
- "Inställningar"-itemet hidden om `profile.role !== "super_user"` — fetchas server-side i layout, propagas via context eller props

**`<OrgBanner>` (server-component, `/organisation`):**
- Tar `organization`-row som prop
- Renderar `<img src={logo_url}>` om finns, annars `<InitialsBadge name={display_name ?? name}>`
- 28px logo, 14px display-namn, 11px subtitle "Din organisation"
- Reagerar inte på accent_color — banner är neutral

**`<SettingsForm>` (client-component, `/organisation/settings`):**
- Server-rendered initial state (display_name, logo_url, accent_color)
- Form-actions:
  - `updateOrgName(formData)` — server action, validerar med Zod, uppdaterar row
  - `uploadLogo(formData)` — server action, laddar upp till storage, uppdaterar `logo_url`
  - `updateAccent(color)` — server action, uppdaterar `accent_color`
- Live-preview-snippet uppdateras client-side på swatch-klick (innan save) — visar accent som vertikal stapel på en mini-PPTX-*mock-up*. Detta är ett HTML/CSS-element som illustrerar hur färgen kommer se ut, INTE en riktig PPTX-rendering — riktig export-integration är separat spec.

**Curated palett:**
```ts
const ACCENT_PRESETS = [
  { hex: "#1F2937", label: "Slate" },    // default, neutral
  { hex: "#2E5C8A", label: "Navy" },
  { hex: "#5A6F4A", label: "Sage" },
  { hex: "#8B2635", label: "Oxblood" },
  { hex: "#C9A86A", label: "Gold" },
];
```
Hex-input bredvid swatchar — användaren kan klistra in egen färg utanför paletten. Paletten roteras/utökas när Junto har egen branding.

## Auth & RBAC

- `/organisation/settings` skyddas med samma `withOrgGuard`-mönster som `/team` — kräver inloggning + samma org
- Server actions kräver super_user — om `profile.role !== "super_user"` → return error, ingen DB-write
- Inställningar-cardet på `/organisation` är `hidden: profile.role !== "super_user"` på samma sätt som Team-cardet idag
- Dropdown-itemet "Inställningar" hidden för icke-super_users

## Data flow

**Läsväg (`/organisation/settings`):**
1. Layout-route fetchar `organization`-row + `profile`
2. Om `role !== "super_user"` → redirect till `/organisation`
3. Server-component renderar `<SettingsForm initial={org}>`

**Skrivväg (display-namn):**
1. User submit `<form action={updateOrgName}>`
2. Server action: Zod-validera (1-64 chars), `UPDATE organizations SET display_name = $1 WHERE id = $orgId`
3. `revalidatePath("/organisation")` + `revalidatePath("/organisation/settings")`

**Skrivväg (logo):**
1. User dropper fil eller väljer via browse
2. Client validerar (PNG/SVG, max 2 MB)
3. Server action `uploadLogo(formData)`:
   - Auth-check + role-check
   - Uppload till `org-assets/<org_id>/logo-<timestamp>.<ext>`
   - `UPDATE organizations SET logo_url = <publicUrl>`
   - Cleanup-pass: lista bucket, ta bort gamla logos för samma org (behåll bara senaste 2 så vi har en undo-marginal)
4. `revalidatePath` på relevanta routes

**Skrivväg (accent):**
1. User klickar swatch eller skriver hex
2. Client uppdaterar live-preview lokalt
3. På "Spara"-klick: server action `updateAccent`, samma Zod + UPDATE som ovan

## Felhantering

- **Logo > 2 MB:** Client-side reject innan upload, visa felmeddelande
- **Fel filformat:** Client-side reject, visa accepterade format
- **Storage-upload misslyckas:** Server action returnerar fel, form visar "Kunde inte ladda upp, försök igen"
- **Hex är ogiltig:** Zod-validering på server (`/^#[0-9A-Fa-f]{6}$/`), rejecta med felmeddelande
- **Icke-super_user försöker skriva:** 403 från server action, UI visar "Du har inte behörighet" — bör inte hända i happy path eftersom UI gömmer kontrollen
- **Race condition på samtidiga uploads:** timestamp i filnamn löser overwrite — varje upload skapar ny fil

## Testning

**Unit / integration:**
- Server actions för display_name, logo, accent — happy path + Zod-fel + role-check
- Dropdown-komponent: hover öppnar, klick på item navigerar, "Inställningar" gömt för user-rollen
- Banner: renderar `<img>` när logo_url finns, initials annars

**Manuell:**
- Verifiera dropdown i Chrome + Firefox (hover-funktion)
- Logga in som super_user → ladda upp logo → verifiera den syns i banner
- Logga in som user → verifiera Inställningar gömt i nav + på `/organisation`
- Lite RLS-check via Supabase SQL: kan en user UPDATE:a `accent_color`? (svar: nej)

**Out of scope för testning:**
- Mobile-vyer (vi gör desktop-first; mobil-polish senare)
- A11y-fullaudit (men keyboard-navigation på dropdown ska fungera)

## Bygg-sekvens — 3 PRs

Hierarkisk URL-struktur (`/organisation/settings`) gör att vi kan bygga inkrementellt utan att flytta filer mellan PRs.

**PR 1: Dropdown + /organisation banner**
- `<OrgDropdown>` i top-nav
- `<OrgBanner>` på `/organisation`
- Tredje card "Inställningar" på `/organisation` (länkar till `/organisation/settings` som ger 404 i denna PR)
- Ingen DB-ändring
- `display_name` och `logo_url` läses från befintlig `organizations.name` som fallback (`logo_url` är inte i schemat ännu — banner visar bara initials)
- ~150 rader, lågrisk

**PR 2: /settings — namn + logo**
- Migration 011 (alla tre kolumner adderade i en migration, bara name + logo aktiveras i UI)
- Storage-bucket `org-assets` + RLS
- `/organisation/settings`-route med form för display-namn + logo
- Server actions: `updateOrgName`, `uploadLogo`
- `<OrgBanner>` läser nu `logo_url` korrekt
- Accent-UI byggs men disablad ("Kommer i nästa version")
- ~400-500 rader

**PR 3: Accentfärg aktiverad**
- Aktivera accent-UI i `<SettingsForm>`
- Live-preview-snippet
- Server action `updateAccent`
- INGEN PPTX-integration (separat senare spec — kräver template-stack-arbete)
- ~150 rader

Tre PRs gör review-storleken hanterbar och låter PR-routinen flagga varje steg separat.

## Öppna frågor

Inga öppna frågor kvar — alla beslut bekräftade 2026-04-26:
- Default-accent: `#1F2937` (neutral slate) tills Junto har egen branding
- Logo-format: PNG, SVG, JPEG
- Logo-versioning: timestamp i filnamn + cleanup till senaste 2 räcker

## Anti-goals

- Bygg INTE PPTX-tenant-rendering i denna spec — det är en egen spec efter PR 3
- Inför INTE tenant-branding på fler ytor än de tre tabellen listar (top-nav är HELIG Junto-yta)
- Designa INTE mobil-hamburger nu — kommer i en separat polish-pass
- Lös INTE alla edge-cases för logo-cropping — håll det enkelt, accepterar filen som den är
- Bygg INTE en general-purpose theming-motor — accent_color är ett fält, inte ett system

## Sammanfattning

3 PRs som etablerar tenant-overlay-mönstret utan att röra Junto-DNA:t. Migration 011 lägger 3 kolumner på `organizations`, ny Storage-bucket `org-assets` med RLS, dropdown ger snabb navigering, banner ger tenant-känsla på `/organisation`, settings-sidan låter super_users branda. PPTX-integration kommer i en separat spec när vi vet exakt hur template-stacken ska ta in tenant-accent.
