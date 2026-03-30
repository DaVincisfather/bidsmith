-- Documents table: stores uploaded RFPs
create table documents (
  id uuid default gen_random_uuid() primary key,
  file_name text not null,
  file_url text not null,
  raw_text text,
  created_at timestamptz default now() not null
);

-- Analyses table: stores structured RFP analyses
create table analyses (
  id uuid default gen_random_uuid() primary key,
  document_id uuid references documents(id) on delete cascade not null,
  analysis jsonb not null,
  created_at timestamptz default now() not null
);

-- Index for fast lookup
create index idx_analyses_document_id on analyses(document_id);
