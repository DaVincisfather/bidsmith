-- 008_template_profiles.sql — mall-profiler (mall-uppladdning slice 1)
-- Appliceras manuellt via Supabase SQL Editor.
--
-- En profil per uppladdad mall: mappar varje fillbar slot till HUR den fylls
-- (capability/format/intent/budget). Validering sker app-side via Zod
-- (src/lib/pptx-template/template-profile.ts). Se
-- notes/2026-07-02-template-upload-architecture.md.

create table template_profiles (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references templates(id) on delete cascade,
  -- TemplateProfile (JSON). Validerad i app-lagret; DB håller den ogenomskinlig.
  profile jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- En profil per mall (redigeras, inte dubbleras).
  unique (template_id)
);

alter table template_profiles enable row level security;
create policy template_profiles_authenticated on template_profiles
  for all to authenticated using (true) with check (true);
