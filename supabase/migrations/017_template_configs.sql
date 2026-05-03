-- Migration 017: template_configs table for PPTX corrector pipeline
-- Spec: docs/superpowers/specs/2026-05-03-pptx-corrector-design.md
-- Plan: docs/superpowers/plans/2026-05-03-pptx-corrector.md (Task 1)

create table template_configs (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  budgets jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table template_configs enable row level security;

-- Read: authenticated users (bid-generator behöver läsa budgets vid generation)
create policy "template_configs_read"
  on template_configs for select
  to authenticated
  using (true);

-- Inga write-policies via API. Stefan editerar via SQL Editor (service_role bypass:ar RLS).
-- När onboarding-spåret kommer: lägg till INSERT/UPDATE-policy med customer_id-scope.

-- Seed: båda kända templates med initiala budgets.
-- anbudsmall-colors seedas med samma värden som v2 — kalibreras separat när stress-fixturen
-- körs mot den och ser att de färgade textboxarna har annan kapacitet (förmodligen).
insert into template_configs (name, budgets) values
  ('anbudsmall-v2', jsonb_build_object(
    'phases[*].objective', 120,
    'phases[*].activities[*]', 120,
    'phases[*].deliverables[*]', 100,
    'phases[*].decisions[*]', 100,
    'phases[*].name', 40,
    'phases[*].period', 10,
    'checkpoints[*]', 80,
    'certs[*].description', 80
  )),
  ('anbudsmall-colors', jsonb_build_object(
    'phases[*].objective', 120,
    'phases[*].activities[*]', 120,
    'phases[*].deliverables[*]', 100,
    'phases[*].decisions[*]', 100,
    'phases[*].name', 40,
    'phases[*].period', 10,
    'checkpoints[*]', 80,
    'certs[*].description', 80
  ));
