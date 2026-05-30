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
