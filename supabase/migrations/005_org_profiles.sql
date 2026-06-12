-- 005_org_profiles.sql — avsändarprofil + mall-bucket (fas 2, PR C)
-- Appliceras manuellt via Supabase SQL Editor.

create table org_profiles (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  logo_path text,
  -- {"primary":"#7A1F2B","accent":"#0E7C7B"} — används av framtida adapters/UI,
  -- PPTX-färgerna bor i mallen själv
  colors jsonb,
  -- fritext som injiceras i skrivprompternas stabila block
  tonality text,
  boilerplate text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger org_profiles_updated_at
  before update on org_profiles
  for each row execute function trigger_set_updated_at();

alter table org_profiles enable row level security;
create policy org_profiles_authenticated on org_profiles
  for all to authenticated using (true) with check (true);

alter table workspace_settings
  add column active_profile_id uuid references org_profiles(id);

-- Storage-bucket för uppladdade mallar (template-store läser, upload-API:t skriver)
insert into storage.buckets (id, name, public) values ('bid-templates', 'bid-templates', false);

create policy bid_templates_authenticated_all on storage.objects
  for all to authenticated
  using (bucket_id = 'bid-templates') with check (bucket_id = 'bid-templates');
