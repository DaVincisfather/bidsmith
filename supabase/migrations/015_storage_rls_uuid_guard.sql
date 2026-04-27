-- M4 Session 3 follow-up (PR #34 review fix #2): the four rfp_documents
-- policies created in 013 cast `split_part(name, '/', 1)` directly to
-- uuid. If Supabase ever drops a non-UUID-prefixed object into the
-- bucket (e.g. `.emptyFolderPlaceholder`) the cast raises and the entire
-- query the policy is attached to fails — including bulk listings.
--
-- Fix: short-circuit on a regex check so the cast only runs when the
-- prefix actually looks like a UUID. Postgres AND is short-circuit, so
-- the regex match acts as a guard. Same pattern is in 011 for
-- org_assets but that bucket has been live without incident; not
-- changed here to keep the scope of this PR contained.

DROP POLICY IF EXISTS rfp_documents_read ON storage.objects;
DROP POLICY IF EXISTS rfp_documents_write ON storage.objects;
DROP POLICY IF EXISTS rfp_documents_update ON storage.objects;
DROP POLICY IF EXISTS rfp_documents_delete ON storage.objects;

CREATE POLICY rfp_documents_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'rfp-documents'
    AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    AND (split_part(name, '/', 1))::uuid = current_org_id()
  );

CREATE POLICY rfp_documents_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'rfp-documents'
    AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    AND (split_part(name, '/', 1))::uuid = current_org_id()
  );

CREATE POLICY rfp_documents_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'rfp-documents'
    AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    AND (split_part(name, '/', 1))::uuid = current_org_id()
  );

CREATE POLICY rfp_documents_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'rfp-documents'
    AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    AND (split_part(name, '/', 1))::uuid = current_org_id()
  );
