-- 013_access_control.sql — access-modell: app_users (invite-flow, publiceringsblockeraren)
-- Appliceras manuellt via Supabase SQL Editor.
--
-- Stänger single-workspace-appens öppna signup: bara mejladresser som fått en
-- app_users-rad (via /setup för första admin, eller admin-invite) kan logga in.
-- Rollen kan ENBART sättas server-side via service-rollen — klienten får bara
-- läsa sin egen rad (self-read-policyn nedan).

create table app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  status text not null default 'invited' check (status in ('invited', 'active')),
  invited_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per email, case-insensitive. Backs the app-level duplicate check in
-- createInvite (findAppUserByEmail) with a DB guarantee, so a concurrent
-- double-invite fails at the database instead of creating two rows for the same
-- address. Emails are compared lower-cased to match that check's ilike lookup.
create unique index app_users_email_lower_idx on app_users (lower(email));

create trigger app_users_updated_at
  before update on app_users
  for each row execute function trigger_set_updated_at();

alter table app_users enable row level security;

-- Till skillnad från övriga tabellers `for all to authenticated using (true)`:
-- klienten får bara läsa sin EGEN rad (räcker för att UI:t ska kunna visa/dölja
-- adminvyn). Inga insert/update/delete-policyer för `authenticated` — alla
-- skrivningar (bjuda in, flippa status) går via createServiceClient() i
-- API-routes (service_role bypassar RLS). Det är den bärande säkerhetsegenskapen:
-- rollen kan aldrig sättas från klienten.
create policy app_users_self_read on app_users
  for select to authenticated using (auth.uid() = id);
