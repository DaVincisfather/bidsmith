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
