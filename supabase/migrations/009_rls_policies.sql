-- M4 Session 1b: RLS policies for multi-tenant isolation
-- Activates row-level security on every org-scoped table.
-- Users only see rows matching their profile's organization_id.
-- Service role (used by cron + profile bootstrap) bypasses RLS by design.

-- Helper: resolve current user's organization via profiles.
-- SECURITY DEFINER so policies can call this without recursing into profile RLS.
CREATE OR REPLACE FUNCTION current_org_id() RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT organization_id FROM profiles WHERE user_id = auth.uid()
$$;

GRANT EXECUTE ON FUNCTION current_org_id() TO authenticated;

-- 1. organizations
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY organizations_read ON organizations
  FOR SELECT TO authenticated
  USING (id = current_org_id());
CREATE POLICY organizations_update ON organizations
  FOR UPDATE TO authenticated
  USING (id = current_org_id())
  WITH CHECK (id = current_org_id());

-- 2. profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_read_own_org ON profiles
  FOR SELECT TO authenticated
  USING (organization_id = current_org_id());

-- 3. organization_invites: visible within org; writes via service role only
ALTER TABLE organization_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY invites_read_own_org ON organization_invites
  FOR SELECT TO authenticated
  USING (organization_id = current_org_id());

-- 4. documents, analyses, matches, go_no_go_assessments, bids
--    All follow the same pattern: org-scoped, any member can read/write.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'documents', 'analyses', 'consultants', 'matches',
    'go_no_go_assessments', 'bids',
    'rfp_opportunities', 'organization_competencies'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (organization_id = current_org_id()) WITH CHECK (organization_id = current_org_id())',
      t || '_org_isolation', t
    );
  END LOOP;
END $$;

-- 5. consultant child tables: no organization_id column, scope via parent consultant
ALTER TABLE consultant_competencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY consultant_competencies_org_isolation ON consultant_competencies
  FOR ALL TO authenticated
  USING (consultant_id IN (SELECT id FROM consultants WHERE organization_id = current_org_id()))
  WITH CHECK (consultant_id IN (SELECT id FROM consultants WHERE organization_id = current_org_id()));

ALTER TABLE consultant_references ENABLE ROW LEVEL SECURITY;
CREATE POLICY consultant_references_org_isolation ON consultant_references
  FOR ALL TO authenticated
  USING (consultant_id IN (SELECT id FROM consultants WHERE organization_id = current_org_id()))
  WITH CHECK (consultant_id IN (SELECT id FROM consultants WHERE organization_id = current_org_id()));

-- 6. Bootstrap invite for Stefan (super_user on seed org).
--    Expires far out so first login won't race the clock. Token is opaque;
--    bootstrap flow in getOrgId() matches on email, not token.
INSERT INTO organization_invites (
  organization_id, email, role, token, expires_at
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'stefan.edgren@hotmail.com',
  'super_user',
  encode(gen_random_bytes(24), 'hex'),
  now() + interval '1 year'
)
ON CONFLICT (organization_id, email) DO NOTHING;
