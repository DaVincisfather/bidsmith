-- M4: Tenant-overlay branding fields on organizations + org-assets storage bucket.
-- display_name and logo_url are NULLABLE; UI falls back to organizations.name + initials.
-- accent_color defaults to neutral slate; will be revised once Junto has its own palette.

-- 1. Branding columns
ALTER TABLE organizations
  ADD COLUMN display_name text,
  ADD COLUMN logo_url text,
  ADD COLUMN accent_color text NOT NULL DEFAULT '#1F2937';

-- 2. Storage bucket for tenant logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('org-assets', 'org-assets', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Storage RLS
-- Path convention: <org_id>/logo-<timestamp>.<ext>
-- Members READ; super_users WRITE/DELETE.

CREATE POLICY org_assets_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'org-assets'
    AND (split_part(name, '/', 1))::uuid = current_org_id()
  );

CREATE POLICY org_assets_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'org-assets'
    AND (split_part(name, '/', 1))::uuid = current_org_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid()
        AND organization_id = current_org_id()
        AND role = 'super_user'
    )
  );

CREATE POLICY org_assets_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'org-assets'
    AND (split_part(name, '/', 1))::uuid = current_org_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid()
        AND organization_id = current_org_id()
        AND role = 'super_user'
    )
  );

CREATE POLICY org_assets_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'org-assets'
    AND (split_part(name, '/', 1))::uuid = current_org_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid()
        AND organization_id = current_org_id()
        AND role = 'super_user'
    )
  );
