-- M4 Session 1a: multi-org schema foundation
-- Adds billing fields on organizations, introduces profiles + invites,
-- backfills existing data to seed org, flips organization_id to NOT NULL.
-- Auth middleware, RLS policies and invite UI come in Session 1b.

-- 1. Extend organizations with billing fields
ALTER TABLE organizations ADD COLUMN billing_plan text NOT NULL DEFAULT 'beta';
ALTER TABLE organizations ADD COLUMN seat_limit integer NOT NULL DEFAULT 5;

-- 2. Profiles: link Supabase auth users to organizations with roles
CREATE TABLE profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('super_user', 'user')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_org ON profiles(organization_id);

-- 3. Invites: pending invitations to join an organization
CREATE TABLE organization_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('super_user', 'user')),
  token text NOT NULL UNIQUE,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, email)
);

CREATE INDEX idx_invites_token ON organization_invites(token);
CREATE INDEX idx_invites_org ON organization_invites(organization_id);

-- 4. Backfill: assign seed org to any row with NULL organization_id
--    Seed org id is from 002_consultant_matching.sql
UPDATE documents SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE analyses SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE consultants SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE matches SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE go_no_go_assessments SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE bids SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;

-- 5. Enforce NOT NULL on every org-scoped table
ALTER TABLE documents ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE analyses ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE consultants ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE matches ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE go_no_go_assessments ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE bids ALTER COLUMN organization_id SET NOT NULL;
