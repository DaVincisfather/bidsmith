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

alter table bids drop constraint bids_status_check;
alter table bids add constraint bids_status_check
  check (status in ('generating', 'draft', 'exported', 'failed'));

alter table bids add column generation_error text;
alter table bids add column failed_bundles jsonb not null default '[]'::jsonb;
