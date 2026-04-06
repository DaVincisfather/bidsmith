-- Go/No-Go assessments (1:N per analysis — multiple team compositions)
create table go_no_go_assessments (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid references analyses(id) not null,
  organization_id uuid references organizations(id),
  team_consultant_ids uuid[] not null,
  result jsonb not null,
  decision text not null default 'pending' check (decision in ('pending', 'go', 'no-go')),
  decision_at timestamptz,
  created_at timestamptz default now() not null
);

create index idx_go_no_go_analysis on go_no_go_assessments(analysis_id);
create index idx_go_no_go_org on go_no_go_assessments(organization_id);
