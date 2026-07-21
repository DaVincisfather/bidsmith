# Spec: Access-modell — invite-flow (publiceringsblockeraren)

**Datum:** 2026-07-20 · **Branch:** `feat/access-control`

## Bakgrund

Bidsmith är single-workspace: alla tabeller har RLS `for all to authenticated using
(true)` — vem som helst med ett konto ser hela arbetsytan (alla CV:n/PII, RFP:er,
anbud). Idag är signup öppen: `login/page.tsx` kör `supabase.auth.signInWithOtp()` utan
`shouldCreateUser: false`, vilket betyder att vem som helst på nätet kan skapa ett konto
själv och logga in. Det är publiceringsblockeraren — appen kan inte gå live förrän
kontoskapande är stängt och ersatt av en riktig inbjudningsmekanism.

Ingen befintlig tabell modellerar användare/roller (12 migrationer, `created_by`/
`user_id`-kolumner är uttryckligen kommenterade "attribution only, no access control").
Denna spec lägger till den saknade biten: vem får logga in, och hur den första personen
någonsin kommer in på en färsk installation.

## Mål

- Stäng öppen signup: bara inbjudna mejladresser kan logga in.
- Riktig admin-roll i databasen (inte en hårdkodad env-mejladress) som kan bjuda in fler.
- Ett obligatoriskt setup-steg som löser hönan-och-ägget-problemet på en färsk
  installation (ingen är admin än).
- **Explicit utanför scope för v1** (bokförs som backlog-post i `notes/ROADMAP.md`
  istället): återkalla/inaktivera en användares åtkomst från UI, byta roll efter
  skapande, återsända utgånget inbjudningsmejl från UI. Hanteras manuellt via Supabase
  dashboard tills volymen motiverar en UI — samma "manuellt via SQL Editor"-mönster som
  redan gäller på andra ställen i projektet.

## Datamodell

Ny migration `013_access_control.sql` (additiv — redigerar ingen applicerad migration):

```sql
create table app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  status text not null default 'invited' check (status in ('invited', 'active')),
  invited_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger app_users_updated_at
  before update on app_users
  for each row execute function trigger_set_updated_at();

alter table app_users enable row level security;

-- Klienten får bara läsa sin egen rad (räcker för att UI:t ska kunna visa/dölja
-- adminvyn). Inga insert/update/delete-policyer för `authenticated` — alla
-- skrivningar går via createServiceClient() i API-routes (service_role bypassar RLS).
-- Det är den bärande säkerhetsegenskapen: rollen kan bara sättas server-side.
create policy app_users_self_read on app_users
  for select to authenticated using (auth.uid() = id);
```

Ingen ändring av befintliga tabellers RLS — den delade arbetsytans `using (true)`-policy
rör vi inte. Vem som får logga in och vad en inloggad användare sedan får se är två
separata frågor; den här specen löser bara den första.

## Auth-flödet

Allt bygger på en primitiv: `supabase.auth.admin.inviteUserByEmail()` (server-side, via
`createServiceClient()` i `src/lib/supabase.ts`) skapar auth-kontot **och** skickar
inbjudningsmejlet i samma anrop. Bootstrap och vanlig admin-inbjudan återanvänder samma
anrop — bara gaten runt det skiljer.

### `/setup` (ny, publik route)
Vid laddning: `GET /api/setup/status` räknar rader i `app_users` (service-role). 0 rader
→ visa mejlformulär. ≥1 rad → redirect till `/login` (inert från och med första
bootstrap — ytan kan inte återanvändas för att skapa fler admins). Formuläret postar till
`POST /api/setup/bootstrap`: servern kollar räkningen igen, anropar
`inviteUserByEmail`, skapar `app_users`-rad med `role='admin', status='invited'`.

### `/login` (ändras)
`signInWithOtp` får `shouldCreateUser: false`. Finns inget konto → Supabase returnerar
ett fel → UI:t visar "Den här adressen är inte inbjuden. Kontakta din administratör."
istället för dagens generiska felmeddelande. Ingen annan ändring av sidan.

### `/auth/callback` (ändras)
Efter `exchangeCodeForSession` lyckas: slå upp `app_users`-raden för `user.id`.
- Ingen rad hittas → **neka**: logga ut, redirect `/login?error=no_access`. Detta är
  skyddet mot orphan-konton (se Felhantering) — frånvaro av en `app_users`-rad betyder
  alltid nekad åtkomst, aldrig ett tyst default-medlemskap.
- Raden finns och `status='invited'` → flippa till `active`.

Det är hela "acceptera inbjudan"-logiken. Inget separat inbjudningstoken-flöde behövs —
Supabase magic-link-länken är redan engångs- och tidsbegränsad.

### Admin-inbjudan (ny yta: `/arbetsyta/installningar/anvandare`)
Båda routes gör identitetskollen på samma sätt: läs anroparens EGEN `app_users`-rad med
en sessions-bunden Supabase-klient (samma cookie-mönster som `middleware.ts` — funkar
tack vare `app_users_self_read`-policyn) och kräv `role='admin'` (403 annars). Är
anroparen admin, växlar routen till `createServiceClient()` för själva operationen, som
rör rader utanför den egna (self-read-RLS räcker inte där).
- `POST /api/admin/users`: kollar att mejlet inte redan finns i `app_users` (409
  annars), anropar `inviteUserByEmail`, skapar raden med `role='member',
  status='invited'`.
- `GET /api/admin/users`: listar alla rader (för att visa vem som är inbjuden/aktiv).

UI:t hålls minimalt (mejlfält + lista med status); visuell polish itereras separat med
Stefan efteråt, inte en del av denna spec.

### Middleware
`src/middleware.ts` får en rad: `/setup` läggs till i `PUBLIC_PATHS`. Ingen annan
ändring — auktorisering (adminkoll) sker i sidan/API-routen, inte i den delade
middlewaren, som förblir en ren autentiseringsgrind (samma ansvarsfördelning som idag).

## Felhantering & risker

1. **Orphan-konto i callback** (ingen `app_users`-rad hittas): ska vara ouppnåeligt i
   normal drift — konton skapas bara via `/setup` eller admin-invite, och båda skapar
   raden i samma anrop som `inviteUserByEmail`. Om `app_users`-inserten ändå kraschar
   efter att auth-kontot redan skapats nekas access explicit (se ovan) istället för att
   ge default-åtkomst. Kvarvarande orphan-konto städas manuellt via Supabase dashboard.
2. **Bootstrap-race**: två personer som träffar tomma `/setup` samtidigt kan i teorin
   båda hinna bli admin innan någon av dem hunnit committa sin rad (accepterad risk,
   Stefan-beslut 2026-07-20 — matchar existerande "single-operator-risk, låg"-poster i
   backloggen, t.ex. accept utan CAS-guard).
3. **Dubbel-inbjudan**: admin bjuder in ett mejl som redan finns i `app_users` → 409,
   ingen ny `inviteUserByEmail`-anrop.
4. **`shouldCreateUser:false`-felets form**: Supabase har ingen dedikerad felkod för
   "signup inte tillåten" idag — matcha defensivt på felmeddelandets innehåll, fall
   tillbaka till ett generiskt felmeddelande om formen inte känns igen (så ett ändrat
   Supabase-felformat aldrig visar missvisande text).

## Tester

Enhetstester, ingen PowerPoint/COM-beroende (ren auth/DB-logik):
- `/api/setup/status` — 0 rader → `needsSetup:true`, ≥1 rad → `false`
- `/api/setup/bootstrap` — avvisar när räkningen redan är ≥1; skapar admin-raden
  korrekt vid räkning 0
- `/api/admin/users` POST — avvisar icke-admin (403), avvisar dubblett (409), skapar
  `member`-raden med `status='invited'` vid framgång
- `/auth/callback` — flippar `invited→active` vid lyckad matchning; nekar + loggar ut
  vid saknad rad
- `/login` — felmeddelande-mappningen för "ej inbjuden"-felet

## Filer (för implementationsplanen)

**Nya:**
- `supabase/migrations/013_access_control.sql`
- `src/app/setup/page.tsx`
- `src/app/api/setup/status/route.ts`
- `src/app/api/setup/bootstrap/route.ts`
- `src/app/api/admin/users/route.ts`
- `src/app/arbetsyta/installningar/anvandare/page.tsx`
- Motsvarande tester för ovanstående

**Ändrade:**
- `src/app/login/page.tsx` (`shouldCreateUser: false` + felmeddelande)
- `src/app/auth/callback/route.ts` (statusflipp + no-row-nekning)
- `src/middleware.ts` (`/setup` till `PUBLIC_PATHS`)
- `supabase/setup.sql` (regenereras via `npm run gen:setup-sql` — obligatoriskt efter
  ny migration, annars faller drift-testet)
- `notes/ROADMAP.md` (bokför leveransen + backlog-posterna som lämnas utanför v1)
