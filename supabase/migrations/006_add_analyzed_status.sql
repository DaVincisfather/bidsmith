-- Fix: add 'analyzed' to rfp_opportunities status constraint
-- The original 005 migration only had ('new', 'scored', 'dismissed', 'analyzing')
ALTER TABLE rfp_opportunities DROP CONSTRAINT IF EXISTS rfp_opportunities_status_check;
ALTER TABLE rfp_opportunities ADD CONSTRAINT rfp_opportunities_status_check
  CHECK (status IN ('new', 'scored', 'dismissed', 'analyzing', 'analyzed'));
