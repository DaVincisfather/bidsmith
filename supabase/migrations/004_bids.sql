create table bids (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid references analyses(id) not null,
  assessment_id uuid references go_no_go_assessments(id),
  organization_id uuid references organizations(id),
  team_consultant_ids uuid[] not null,
  sections jsonb not null default '[]',
  status text not null default 'generating'
    check (status in ('generating', 'draft', 'exported')),
  outcome text check (outcome in ('won', 'lost', 'no-bid')),
  exported_at timestamptz,
  created_at timestamptz default now() not null
);

create index idx_bids_analysis on bids(analysis_id);
create index idx_bids_org on bids(organization_id);
