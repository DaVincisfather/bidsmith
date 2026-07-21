-- ============================================================================
-- Bidsmith setup.sql — KOMPLETT schema för en NY installation.
--
-- NY installation:  klistra in HELA denna fil i Supabase SQL Editor och kör EN
--                   gång. Klart — inga manuella bucket-steg behövs.
-- BEFINTLIG installation: kör INTE denna fil. Fortsätt applicera filerna i
--                   supabase/migrations/ inkrementellt i nummerordning.
--
-- Genererad av scripts/generate-setup-sql.ts — redigera INTE för hand;
-- kör "npm run gen:setup-sql" efter varje ny migration.
-- ============================================================================


-- ===== 001_initial_schema.sql =====
-- =============================================================================
-- Bidsmith — single-workspace baseline schema
-- Squashed from 001–019. Single workspace, no multi-org layer.
-- All tables share one workspace; RLS grants full access to authenticated role.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Utility trigger function: auto-update updated_at on row UPDATE
-- ---------------------------------------------------------------------------
create or replace function trigger_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- documents: uploaded RFPs (PDF/DOCX) and synthetic TED-sourced docs
-- file_url is nullable — TED rows have no storage object (use file_path)
-- file_path: path inside rfp-documents bucket: <user_id>/<timestamp>-<name>
-- ---------------------------------------------------------------------------
create table documents (
  id uuid default gen_random_uuid() primary key,
  file_name text not null,
  file_url text,
  file_path text,
  raw_text text,
  created_at timestamptz default now() not null
);

-- ---------------------------------------------------------------------------
-- analyses: structured JSON analysis of an RFP document
-- ---------------------------------------------------------------------------
create table analyses (
  id uuid default gen_random_uuid() primary key,
  document_id uuid references documents(id) on delete cascade not null,
  analysis jsonb not null,
  created_at timestamptz default now() not null
);

create index idx_analyses_document_id on analyses(document_id);

-- ---------------------------------------------------------------------------
-- consultants: consultant profiles in the shared workspace
-- ---------------------------------------------------------------------------
create table consultants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  level text not null check (level in ('junior', 'intermediate', 'senior', 'expert')),
  years_experience int,
  summary text,
  raw_cv_text text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index idx_consultants_level on consultants(level);

-- ---------------------------------------------------------------------------
-- consultant_competencies: tagged competencies per consultant
-- ---------------------------------------------------------------------------
create table consultant_competencies (
  id uuid primary key default gen_random_uuid(),
  consultant_id uuid references consultants(id) on delete cascade not null,
  competency text not null,
  category text not null check (category in ('technical', 'domain', 'methodology', 'certification'))
);

create index idx_competencies_consultant on consultant_competencies(consultant_id);

-- ---------------------------------------------------------------------------
-- consultant_references: past project references per consultant
-- ---------------------------------------------------------------------------
create table consultant_references (
  id uuid primary key default gen_random_uuid(),
  consultant_id uuid references consultants(id) on delete cascade not null,
  title text not null,
  description text,
  year int,
  sector text check (sector in ('public', 'private'))
);

create index idx_references_consultant on consultant_references(consultant_id);

-- ---------------------------------------------------------------------------
-- matches: team proposals generated for an RFP analysis
-- ---------------------------------------------------------------------------
create table matches (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid references analyses(id) not null,
  team_proposal jsonb not null,
  team_evaluation jsonb,
  created_at timestamptz default now() not null
);

create index idx_matches_analysis on matches(analysis_id);

-- ---------------------------------------------------------------------------
-- go_no_go_assessments: Go/No-Go decisions per analysis + team composition
-- ---------------------------------------------------------------------------
create table go_no_go_assessments (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid references analyses(id) not null,
  team_consultant_ids uuid[] not null,
  result jsonb not null,
  decision text not null default 'pending' check (decision in ('pending', 'go', 'no-go')),
  decision_at timestamptz,
  created_at timestamptz default now() not null
);

create index idx_go_no_go_analysis on go_no_go_assessments(analysis_id);

-- ---------------------------------------------------------------------------
-- bids: generated bid documents
-- created_by: nullable auth user id (attribution only, no access control)
-- overflow_flags: OverflowFlag[] from the PPTX corrector pipeline
-- structure_eval: runtime structure-judge output badge
-- ---------------------------------------------------------------------------
create table bids (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid references analyses(id) not null,
  assessment_id uuid references go_no_go_assessments(id),
  team_consultant_ids uuid[] not null,
  sections jsonb not null default '[]',
  status text not null default 'generating'
    check (status in ('generating', 'draft', 'exported')),
  outcome text check (outcome is null or outcome in ('won', 'lost', 'no-bid', 'cancelled')),
  competitor_name text,
  loss_reason text,
  loss_comment text,
  outcome_logged_at timestamptz,
  exported_at timestamptz,
  structure_eval jsonb,
  overflow_flags jsonb not null default '[]'::jsonb,
  created_by uuid,
  created_at timestamptz default now() not null,
  constraint bids_loss_reason_check
    check (loss_reason is null or loss_reason in
      ('pris','erfarenhet','team','kvalitet','relation','annat'))
);

create index idx_bids_analysis on bids(analysis_id);
create index idx_bids_dashboard on bids(exported_at desc)
  where exported_at is not null;

-- ---------------------------------------------------------------------------
-- rfp_opportunities: TED procurement notices fetched by the radar cron
-- ---------------------------------------------------------------------------
create table rfp_opportunities (
  id uuid primary key default gen_random_uuid(),
  ted_notice_id text not null unique,
  title text not null,
  buyer text,
  country text not null default 'SWE',
  cpv_codes text[] not null default '{}',
  deadline timestamptz,
  estimated_value numeric,
  summary text,
  ted_url text,
  raw_xml text,
  relevance_score integer,
  relevance_reasoning text,
  status text not null default 'new'
    check (status in ('new', 'scored', 'dismissed', 'analyzing', 'analyzed')),
  analysis_id uuid references analyses(id),
  fetched_at timestamptz not null default now(),
  scored_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_opportunities_status on rfp_opportunities(status);
create index idx_opportunities_score on rfp_opportunities(relevance_score desc nulls last);

-- ---------------------------------------------------------------------------
-- organization_competencies: radar competency areas for matching TED notices
-- NOTE: table name kept as-is for now; Pass 2 renames it to workspace_competencies.
-- organization_id column intentionally omitted (single-workspace).
-- ---------------------------------------------------------------------------
create table organization_competencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null,
  keywords text[] not null default '{}',
  cpv_codes text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- ai_call_logs: per-call cost + latency tracking for Claude API calls
-- user_id: nullable auth user id (null for cron/background calls)
-- ---------------------------------------------------------------------------
create table ai_call_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  model text not null,
  label text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_creation_tokens integer not null default 0,
  cost_usd numeric(10, 6) not null default 0,
  latency_ms integer not null default 0,
  error text,
  created_at timestamptz not null default now()
);

create index idx_ai_call_logs_user_created
  on ai_call_logs(user_id, created_at desc);
create index idx_ai_call_logs_label_created
  on ai_call_logs(label, created_at desc);

-- ---------------------------------------------------------------------------
-- template_configs: PPTX template field-budget configurations
-- budgets: FieldBudgets jsonb — keyed by field path, value = char budget
-- ---------------------------------------------------------------------------
create table template_configs (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  budgets jsonb not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create trigger template_configs_updated_at
  before update on template_configs
  for each row
  execute function trigger_set_updated_at();

-- Required seed: both known templates with initial field budgets.
-- The bid-generator throws TemplateConfigMissingError without these rows.
-- anbudsmall-colors is seeded with the same values as v2 until calibrated separately.
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

-- ---------------------------------------------------------------------------
-- workspace_settings: single-row table for workspace-wide configuration
-- style_guide: StyleGuide jsonb consumed by the bid editor
-- ---------------------------------------------------------------------------
create table workspace_settings (
  id uuid primary key default gen_random_uuid(),
  style_guide jsonb,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create trigger workspace_settings_updated_at
  before update on workspace_settings
  for each row
  execute function trigger_set_updated_at();

-- =============================================================================
-- Row Level Security
-- Single-workspace model: all authenticated users share one workspace.
-- Each table gets RLS enabled + one permissive policy for the authenticated role.
-- Service role bypasses RLS by default (used by cron, bid-generator, etc).
-- =============================================================================

alter table documents enable row level security;
create policy documents_authenticated on documents
  for all to authenticated using (true) with check (true);

alter table analyses enable row level security;
create policy analyses_authenticated on analyses
  for all to authenticated using (true) with check (true);

alter table consultants enable row level security;
create policy consultants_authenticated on consultants
  for all to authenticated using (true) with check (true);

alter table consultant_competencies enable row level security;
create policy consultant_competencies_authenticated on consultant_competencies
  for all to authenticated using (true) with check (true);

alter table consultant_references enable row level security;
create policy consultant_references_authenticated on consultant_references
  for all to authenticated using (true) with check (true);

alter table matches enable row level security;
create policy matches_authenticated on matches
  for all to authenticated using (true) with check (true);

alter table go_no_go_assessments enable row level security;
create policy go_no_go_assessments_authenticated on go_no_go_assessments
  for all to authenticated using (true) with check (true);

alter table bids enable row level security;
create policy bids_authenticated on bids
  for all to authenticated using (true) with check (true);

alter table rfp_opportunities enable row level security;
create policy rfp_opportunities_authenticated on rfp_opportunities
  for all to authenticated using (true) with check (true);

alter table organization_competencies enable row level security;
create policy organization_competencies_authenticated on organization_competencies
  for all to authenticated using (true) with check (true);

alter table ai_call_logs enable row level security;
create policy ai_call_logs_authenticated on ai_call_logs
  for all to authenticated using (true) with check (true);

alter table template_configs enable row level security;
create policy template_configs_authenticated on template_configs
  for all to authenticated using (true) with check (true);

alter table workspace_settings enable row level security;
create policy workspace_settings_authenticated on workspace_settings
  for all to authenticated using (true) with check (true);

-- ===== 002_bid_async_generation.sql =====
-- ---------------------------------------------------------------------------
-- Async bid generation: POST /api/bids now returns 202 before generation
-- finishes, so failure state must live on the bids row instead of in the
-- HTTP response.
--
-- - status gains 'failed' (infra failure, total bundle wipeout, or the
--   stale-generating watchdog in GET /api/bids/[id])
-- - generation_error: human-readable failure cause
-- - failed_bundles: FailedBundle[] for partial drafts — which sections
--   failed and need regeneration (previously only returned over HTTP and
--   lost afterwards)
-- ---------------------------------------------------------------------------

-- bids_status_check is the Postgres auto-generated name for 001's inline
-- column check. If this DROP fails on an older database lineage, find the
-- actual name first:
--   select conname from pg_constraint
--   where conrelid = 'bids'::regclass and contype = 'c';
alter table bids drop constraint bids_status_check;
alter table bids add constraint bids_status_check
  check (status in ('generating', 'draft', 'exported', 'failed'));

alter table bids add column generation_error text;
alter table bids add column failed_bundles jsonb not null default '[]'::jsonb;

-- ===== 003_ai_call_logs_bid_id.sql =====
-- ---------------------------------------------------------------------------
-- Per-bid AI call attribution: bid-generation calls now log which bid they
-- belong to, so cost per bid ($/anbud) is queryable directly instead of
-- only as total cost / bid count. Null for calls outside bid generation
-- (analysis, matching, go/no-go, radar).
-- ---------------------------------------------------------------------------

alter table ai_call_logs
  add column bid_id uuid references bids(id) on delete set null;

create index idx_ai_call_logs_bid_created
  on ai_call_logs(bid_id, created_at desc)
  where bid_id is not null;

-- ===== 004_templates.sql =====
-- 004_templates.sql — mallar som data (fas 2, PR B)
-- Appliceras manuellt via Supabase SQL Editor.

create table templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version int not null default 1,
  -- null = bundlad mall som läses från repo-disk (templates/<name>.pptx);
  -- annars sökväg i storage-bucketen bid-templates (skapas i migration 005)
  storage_path text,
  manifest jsonb not null,
  created_at timestamptz not null default now(),
  unique (name, version)
);

alter table templates enable row level security;
create policy templates_authenticated on templates
  for all to authenticated using (true) with check (true);

alter table workspace_settings
  add column active_template_id uuid references templates(id);

-- Vilken mall bidet genererades mot — export/editor måste använda samma
-- (budgetarna beräknades för den). null = legacy-bid → anbudsmall-v2 v1.
alter table bids
  add column template_id uuid references templates(id);

-- Seeda den bundlade designmallen ur templates/anbudsmall-v2.manifest.json (PR A).
insert into templates (name, version, storage_path, manifest) values (
  'anbudsmall-v2',
  1,
  null,
  $manifest$
{
  "manifestVersion": 1,
  "name": "anbudsmall-v2",
  "slides": [
    {
      "source": 1,
      "type": "cover",
      "placeholders": [
        "{Bolagsnamn}",
        "{Anbudsdatum}",
        "{Kundnamn}",
        "{Upphandlingens namn}",
        "{Diarienummer}"
      ]
    },
    {
      "source": 2,
      "type": "toc",
      "placeholders": [
        "{Bolagsnamn}",
        "{Diarienummer}"
      ]
    },
    {
      "source": 3,
      "type": "prose",
      "variant": "kunden-idag",
      "placeholders": [
        "{Nuläge}",
        "{Smärtpunkter}",
        "{Bolagsnamn}",
        "{Diarienummer}"
      ]
    },
    {
      "source": 4,
      "type": "prose",
      "variant": "uppdraget",
      "placeholders": [
        "{Stycken}",
        "{Bolagsnamn}",
        "{Diarienummer}"
      ]
    },
    {
      "source": 5,
      "type": "prose",
      "variant": "vision",
      "placeholders": [
        "{Utmaningar}",
        "{Värden}",
        "{Bolagsnamn}",
        "{Diarienummer}"
      ]
    },
    {
      "source": 6,
      "type": "phases-overview",
      "itemCaps": {
        "phases": 4
      },
      "placeholders": [
        "{Fas 1 — namn}",
        "{Fas 1 — kort beskrivning. Detaljer på nästa slide.}",
        "{Fas 2 — namn}",
        "{Fas 2 — beskrivning}",
        "{Fas 3 — namn}",
        "{Fas 3 — beskrivning}",
        "{Fas 4 — namn}",
        "{Fas 4 — beskrivning}",
        "{M1–M2}",
        "{Fas 1}",
        "{M2–M5}",
        "{Fas 2}",
        "{M5–M9}",
        "{Fas 3}",
        "{M9–M12}",
        "{Fas 4}",
        "{Bolagsnamn}",
        "{Diarienummer}"
      ]
    },
    {
      "source": 7,
      "type": "phase-detail",
      "cloneFrom": "phases",
      "itemCaps": {
        "activities": 4,
        "deliverables": 3,
        "decisions": 3
      },
      "placeholders": [
        "{Fas 1 — namn}",
        "{M1–M2}",
        "{Antal veckor}",
        "{Aktiviteter}",
        "{Leveranser}",
        "{Beslut}",
        "{Bolagsnamn}",
        "{Diarienummer}",
        "{Mål}",
        "{Risker}"
      ]
    },
    {
      "source": 11,
      "type": "quality-assurance",
      "placeholders": [
        "{QA-process}",
        "{Kvalitetsledare}",
        "{Eskalering}",
        "{Avstämning 1 — tidpunkt och innehåll}",
        "{Avstämning 2}",
        "{Avstämning 3}",
        "{Avstämning 4}",
        "{Bolagsnamn}",
        "{Diarienummer}"
      ]
    },
    {
      "source": 12,
      "type": "team-pricing",
      "placeholders": [
        "{Konsult 1 — namn}",
        "{Roll 1}",
        "{Omfattning 1 %}",
        "{Timpris 1}",
        "{Timmar 1}",
        "{Total 1}",
        "{Konsult 2 — namn}",
        "{Roll 2}",
        "{Omfattning 2 %}",
        "{Timpris 2}",
        "{Timmar 2}",
        "{Total 2}",
        "{Konsult 3 — namn}",
        "{Roll 3}",
        "{Omfattning 3 %}",
        "{Timpris 3}",
        "{Timmar 3}",
        "{Total 3}",
        "{Konsult 4 — namn}",
        "{Roll 4}",
        "{Omfattning 4 %}",
        "{Timpris 4}",
        "{Timmar 4}",
        "{Total 4}",
        "{Konsult 5 — namn}",
        "{Roll 5}",
        "{Omfattning 5 %}",
        "{Timpris 5}",
        "{Timmar 5}",
        "{Total 5}",
        "{Summa timmar}",
        "{Anbudspris totalt}",
        "{Bolagsnamn}",
        "{Diarienummer}"
      ]
    },
    {
      "source": 13,
      "type": "requirement-matrix",
      "placeholders": [
        "{Ska-krav 1 — formulering enligt upphandlingsunderlag}",
        "{Hur krav 1 uppfylls — konkret beskrivning}",
        "{CV/ref 1}",
        "{Ska-krav 2}",
        "{Hur krav 2 uppfylls}",
        "{CV/ref 2}",
        "{Ska-krav 3}",
        "{Hur krav 3 uppfylls}",
        "{CV/ref 3}",
        "{Ska-krav 4}",
        "{Hur krav 4 uppfylls}",
        "{CV/ref 4}",
        "{Ska-krav 5}",
        "{Hur krav 5 uppfylls}",
        "{CV/ref 5}",
        "{Ska-krav 6}",
        "{Hur krav 6 uppfylls}",
        "{CV/ref 6}",
        "{Bolagsnamn}",
        "{Diarienummer}"
      ]
    },
    {
      "source": 14,
      "type": "reference",
      "cloneFrom": "references",
      "placeholders": [
        "{Referens 1 — kundnamn}",
        "{Referens 1 — kort kontextrad, t.ex. ”Digitalisering av ärendehantering”}",
        "{Vänster}",
        "{Höger}",
        "{Bolagsnamn}",
        "{Diarienummer}"
      ]
    },
    {
      "source": 16,
      "type": "confidentiality",
      "placeholders": [
        "{Bolagsnamn}",
        "{OSL kap X §Y}",
        "{Slide/Bilaga 1}",
        "{Uppgift som omfattas av sekretess}",
        "{Varför — skadan som uppstår vid utlämnande}",
        "{Slide/Bilaga 2}",
        "{Uppgift som omfattas}",
        "{Motivering}",
        "{Slide/Bilaga 3}",
        "{Slide/Bilaga 4}",
        "{Diarienummer}"
      ]
    },
    {
      "source": 17,
      "type": "certifications",
      "placeholders": [
        "{Certifikatnummer}",
        "{Giltighetstid}",
        "{Övrig relevant certifiering}",
        "{Beskrivning}",
        "{Bolagsnamn}",
        "{Diarienummer}"
      ]
    }
  ],
  "budgets": {
    "phases[*].name": 40,
    "phases[*].period": 10,
    "phases[*].activities[*]": 120,
    "phases[*].deliverables[*]": 100,
    "phases[*].decisions[*]": 100,
    "phases[*].objective": 120,
    "checkpoints[*]": 80,
    "certs[*].description": 80
  },
  "fieldSlides": {
    "phases[*].name": 6,
    "phases[*].period": 6,
    "phases[*].activities[*]": 7,
    "phases[*].deliverables[*]": 7,
    "phases[*].decisions[*]": 7,
    "phases[*].objective": 7,
    "checkpoints[*]": 11,
    "certs[*].description": 17
  },
  "excludedSlides": [
    {
      "source": 8,
      "reason": "duplikat av slide 7 — illustrativ kopia"
    },
    {
      "source": 9,
      "reason": "duplikat av slide 7 — illustrativ kopia"
    },
    {
      "source": 10,
      "reason": "duplikat av slide 7 — illustrativ kopia"
    },
    {
      "source": 15,
      "reason": "duplikat av slide 14 — illustrativ kopia"
    }
  ]
}
  $manifest$::jsonb
);

update workspace_settings
  set active_template_id = (
    select id from templates where name = 'anbudsmall-v2' and version = 1
  );

-- ===== 005_org_profiles.sql =====
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

-- ===== 006_bid_profile_id.sql =====
-- 006_bid_profile_id.sql — pinna avsändarprofilen på anbudet (fas 2, PR C-review #1)
-- Appliceras manuellt via Supabase SQL Editor.
--
-- Anbudet bakar in profilens röst/boilerplate vid GENERERING. Utan en pinnad
-- profil hämtar export den nu-aktiva profilen → omslag/sidfot kan visa ett annat
-- bolagsnamn än brödtexten om profilen ändrats emellan. Samma mönster som
-- bids.template_id. Legacy-bids (kolumn null) → blankt bolagsnamn vid export.

alter table bids add column if not exists profile_id uuid references org_profiles(id);

-- ===== 007_reseed_anbudsmall_v2_budgets.sql =====
-- 007_reseed_anbudsmall_v2_budgets.sql
-- Uppdaterar bundlade designmallen anbudsmall-v2:s manifest efter mall-overflow
-- Task 1 (Part A + Part B). Runtime laeser manifestet ur denna kolumn
-- (src/lib/pptx-template/template-store.ts), INTE ur disk-json, sa budgetarna nar
-- inte prod utan denna UPDATE.
--   Part A: phases[*].activities[*] 120 -> 115 (aerlig geometrisk bindning foer
--     flerradiga normAutofit-boxar).
--   Part B: nya editorialOnly-budgetar for kravmatris/team + deras fieldSlides:
--     rows[*].requirement 160, rows[*].hurUppfylls 160, rows[*].referens 70,
--     members[*].role 60.
-- Kirurgiskt: rör ENBART budgets + fieldSlides (exakt det diffen mot disk-manifestet
-- aendrade) via jsonb_set. Ascii-fragment pa en rad => inga radslut/kontrolltecken att
-- escapa vid inklistring. Idempotent: kan koeras om utan bieffekt.
-- Applicera manuellt via Supabase SQL Editor (redigera aldrig en applicerad migration).
update templates
set manifest = jsonb_set(
  jsonb_set(
    manifest,
    '{budgets}',
    '{"phases[*].name":40,"phases[*].period":10,"phases[*].activities[*]":115,"phases[*].deliverables[*]":100,"phases[*].decisions[*]":100,"phases[*].objective":120,"checkpoints[*]":80,"members[*].role":60,"rows[*].requirement":160,"rows[*].hurUppfylls":160,"rows[*].referens":70,"certs[*].description":80}'::jsonb
  ),
  '{fieldSlides}',
  '{"phases[*].name":6,"phases[*].period":6,"phases[*].activities[*]":7,"phases[*].deliverables[*]":7,"phases[*].decisions[*]":7,"phases[*].objective":7,"checkpoints[*]":11,"members[*].role":12,"rows[*].requirement":13,"rows[*].hurUppfylls":13,"rows[*].referens":13,"certs[*].description":17}'::jsonb
)
where name = 'anbudsmall-v2' and version = 1;

-- ===== 008_template_profiles.sql =====
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

-- ===== 009_consultant_evidence.sql =====
-- 009_consultant_evidence.sql — persistera evidensvaktens källcitat (fas B-uppföljning, PR #56-review)
-- Appliceras manuellt via Supabase SQL Editor FÖRE merge av koden som skriver kolumnerna
-- (upsertConsultant insertar explicit — okänd kolumn hade fällt CV-uploaden).
--
-- Nullable: evidence saknas för (a) alla rader skrivna före denna migration,
-- (b) poster vakten flaggat (overifierbara efter ett reparationsförsök).
-- null = "obelagd" — källa-badgen i UI:t och fas C:s matchnings-policy läser detta.

alter table consultant_competencies add column evidence text;
alter table consultant_references add column evidence text;

-- ===== 010_consultant_cv_file.sql =====
-- 010_consultant_cv_file.sql — persistera konsultens original-CV (D-SYMMETRI med analys-källvyn)
-- Appliceras manuellt via Supabase SQL Editor FÖRE merge av koden som skriver kolumnen
-- (upload-routen sätter cv_file_path explicit via update — okänd kolumn hade fällt skrivningen).
--
-- OPERATÖRS-CHECKLISTA FÖRE MERGE (två manuella steg — buckets är INTE SQL):
--   1. Kör denna migration (lägger till consultants.cv_file_path).
--   2. Skapa den PRIVATA storage-bucketen `consultant-cvs` i Supabase Storage
--      (Storage → New bucket → namn: consultant-cvs, Public: OFF). Upload-routen
--      laddar upp originalfilen dit; konsult-källvyn signerar den (getCvSignedUrl).
--      Motsvarar den privata `rfp-documents`-bucketen som analys-källvyn använder.
--
-- Nullable: konsulter skapade före denna feature har ingen lagrad originalfil (bara
-- raw_cv_text) → cv_file_path = null; konsult-källvyn utelämnar då "Öppna originalet".

alter table consultants add column cv_file_path text;

-- ===== 011_consultant_extraction_version.sql =====
-- 011_consultant_extraction_version.sql — extraktions-versions-diskriminator (fas C-residual, stänger legacy-tvetydigheten)
-- Appliceras manuellt via Supabase SQL Editor FÖRE merge av koden som skriver kolumnen
-- (upsertConsultant sätter extraction_version explicit via insert + update — okänd kolumn hade fällt CV-uploaden).
--
-- PROBLEM: en post-feature-konsult vars evidens-vakt strippat ALLA citat (t.ex. fel fil
-- uppladdad som CV) är i datat oskiljbar från en LEGACY-konsult (extraherad före evidens-
-- featuren): båda har noll evidens överallt. Union-grinden (grounded-claims.ts) släpper då
-- igenom den degenererade konsultens claims med full vikt och UI:t döljer dess badges.
--
-- FIX: en versionskolumn skiljer generationerna.
--   NULL  = extraherad FÖRE denna feature (äkta legacy) → union-heuristiken gäller (grinden AV vid noll evidens).
--   1     = evidens-förankrade extraktions-generationen → grinden ALLTID PÅ: saknad evidens = flaggad,
--           även om raden saknar evidens överallt (all-strippad degenererad konsult filtreras korrekt bort).
--
-- Nullable med avsikt: befintliga rader förblir NULL (legacy) tills de laddas upp på nytt.
-- Versionskonstanten bor i src/lib/extraction-version.ts (EXTRACTION_VERSION = 1).

alter table consultants add column extraction_version int;

-- ===== 012_template_onboarding.sql =====
-- 012_template_onboarding.sql — onboarding-wizard för kundmallar (slice 5-UI).
-- Appliceras manuellt via Supabase SQL Editor.

-- Främmande mallar kan inte producera ett manifest förrän de onboardats —
-- foreign-raden bär manifest = null tills vidare (profilen är dess sanning).
alter table templates alter column manifest drop not null;

-- none = token-bärande mall (dagens väg, default för alla befintliga rader);
-- needs_onboarding → classifying → draft → onboarded är kundmall-vägen.
alter table templates add column onboarding_status text not null default 'none'
  check (onboarding_status in ('none','needs_onboarding','classifying','draft','onboarded'));

-- Klassificeringsförslaget + användarens slot-beslut (OnboardingDraftSchema i
-- src/lib/pptx-template/onboarding/draft.ts). Även fel-/precount-payloads
-- ({ error } resp. { precount }) bor här — se draft.ts.
alter table templates add column onboarding_draft jsonb;

-- ===== 013_access_control.sql =====
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

-- ===== storage-buckets (ersätter de manuella dashboard-stegen) =====
-- Privata buckets; åtkomst sker via service-rollen och signerade URL:er.
-- Mönstret är detsamma som bid-templates-bucketen i 005_org_profiles.sql.
insert into storage.buckets (id, name, public) values ('rfp-documents', 'rfp-documents', false);
insert into storage.buckets (id, name, public) values ('consultant-cvs', 'consultant-cvs', false);

create policy rfp_documents_authenticated_all on storage.objects
  for all to authenticated
  using (bucket_id = 'rfp-documents') with check (bucket_id = 'rfp-documents');

create policy consultant_cvs_authenticated_all on storage.objects
  for all to authenticated
  using (bucket_id = 'consultant-cvs') with check (bucket_id = 'consultant-cvs');
