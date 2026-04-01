-- Organizations
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  style_guide jsonb,
  created_at timestamptz default now() not null
);

-- Consultants
create table consultants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id),
  name text not null,
  level text not null check (level in ('junior', 'intermediate', 'senior', 'expert')),
  years_experience int,
  summary text,
  raw_cv_text text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Consultant competencies
create table consultant_competencies (
  id uuid primary key default gen_random_uuid(),
  consultant_id uuid references consultants(id) on delete cascade not null,
  competency text not null,
  category text not null check (category in ('technical', 'domain', 'methodology', 'certification'))
);

-- Consultant references (past projects)
create table consultant_references (
  id uuid primary key default gen_random_uuid(),
  consultant_id uuid references consultants(id) on delete cascade not null,
  title text not null,
  description text,
  year int,
  sector text check (sector in ('public', 'private'))
);

-- Matches (team proposals per RFP analysis)
create table matches (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid references analyses(id) not null,
  organization_id uuid references organizations(id),
  team_proposal jsonb not null,
  team_evaluation jsonb,
  created_at timestamptz default now() not null
);

-- Indexes
create index idx_consultants_org on consultants(organization_id);
create index idx_consultants_level on consultants(level);
create index idx_competencies_consultant on consultant_competencies(consultant_id);
create index idx_references_consultant on consultant_references(consultant_id);
create index idx_matches_analysis on matches(analysis_id);

-- Add organization_id to existing tables (nullable — no breaking change)
alter table documents add column organization_id uuid references organizations(id);
alter table analyses add column organization_id uuid references organizations(id);

-- Seed a default organization for development
insert into organizations (id, name) values
  ('00000000-0000-0000-0000-000000000001', 'Nordia Management AB');
