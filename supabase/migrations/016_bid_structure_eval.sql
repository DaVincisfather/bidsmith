-- Adds structure_eval column for runtime structure-judge integration.
-- Populated by POST /api/bids after generateAllSections completes.
-- Read by GET /api/bids/[id] for the editor badge.
-- Nullable so existing bids (pre-migration) read as "not evaluated".

alter table bids add column structure_eval jsonb;
