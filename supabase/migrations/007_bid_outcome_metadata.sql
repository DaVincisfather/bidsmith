-- Utöka bids med outcome-metadata för RFP Dashboard (sektion 2 flywheel)

ALTER TABLE bids ADD COLUMN competitor_name text;
ALTER TABLE bids ADD COLUMN loss_reason text;
ALTER TABLE bids ADD COLUMN loss_comment text;
ALTER TABLE bids ADD COLUMN outcome_logged_at timestamptz;

ALTER TABLE bids ADD CONSTRAINT bids_loss_reason_check
  CHECK (loss_reason IS NULL OR loss_reason IN
    ('pris','erfarenhet','team','kvalitet','relation','annat'));

-- Utöka outcome-enum med 'cancelled'
ALTER TABLE bids DROP CONSTRAINT IF EXISTS bids_outcome_check;
ALTER TABLE bids ADD CONSTRAINT bids_outcome_check
  CHECK (outcome IS NULL OR outcome IN ('won','lost','no-bid','cancelled'));

-- Index för sektion 2-queries (inlämnade anbud, sorterade)
CREATE INDEX idx_bids_dashboard ON bids (exported_at DESC)
  WHERE exported_at IS NOT NULL;
