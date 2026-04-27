-- M4 Session 3: cost tracking for Claude API calls.
-- Every callClaude() invocation appends one row.
-- organization_id is nullable so we can log calls before the org is resolved
-- (e.g. invite-bootstrap probes, cron-radar-scoring); UI views filter NULL out.

CREATE TABLE ai_call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  model text NOT NULL,
  label text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cache_read_tokens integer NOT NULL DEFAULT 0,
  cache_creation_tokens integer NOT NULL DEFAULT 0,
  cost_usd numeric(10, 6) NOT NULL DEFAULT 0,
  latency_ms integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_call_logs_org_created
  ON ai_call_logs(organization_id, created_at DESC);

CREATE INDEX idx_ai_call_logs_label_created
  ON ai_call_logs(label, created_at DESC);

-- RLS: members read their org's logs; only service role writes.
ALTER TABLE ai_call_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_call_logs_read_own_org ON ai_call_logs
  FOR SELECT TO authenticated
  USING (organization_id = current_org_id());
