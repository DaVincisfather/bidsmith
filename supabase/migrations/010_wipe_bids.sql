-- 010_wipe_bids.sql — Apply MANUALLY in Supabase SQL Editor after M2 merges.
-- Context: M2 refactors the bid-generator output union from v1 (prose/bullets/…)
-- to v2-only (cover/understanding-*/phases/…). Existing rows carry v1 shapes
-- the renderer no longer handles. Wipe rather than migrate — users re-run
-- generation against the same RFP+team to rebuild under the new contract.

TRUNCATE bids CASCADE;
