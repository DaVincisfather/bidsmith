-- M4 Session 3: lock down rfp-documents bucket.
-- Path convention going forward: <org_id>/<timestamp>-<file_name>
-- Reads happen via signed URLs (createSignedUrl) on the server.
--
-- This migration also wipes existing dev-test rows in documents/analyses/
-- matches/go_no_go_assessments/bids. Public file_url values would die when
-- the bucket flips anyway; clean wipe avoids stale references. Stefan keeps
-- the one real RFP locally if needed (same pattern as 010_wipe_bids).

-- 1. Wipe stale dev data BEFORE the schema change (FK-safe order).
DELETE FROM bids;
DELETE FROM matches;
DELETE FROM go_no_go_assessments;
-- rfp_opportunities.status check constraint (006) tillåter:
-- 'new' | 'scored' | 'dismissed' | 'analyzing' | 'analyzed'.
-- Rader som har analysis_id IS NOT NULL var antingen 'analyzing' eller
-- 'analyzed' — efter att vi raderar analyserna ska de tillbaka till
-- 'scored' (Haiku-scoren bevaras, klar att åter-analyseras).
UPDATE rfp_opportunities
  SET status = 'scored', analysis_id = NULL
  WHERE analysis_id IS NOT NULL;
DELETE FROM analyses;
DELETE FROM documents;

-- 2. Flip bucket privacy
UPDATE storage.buckets SET public = false WHERE id = 'rfp-documents';

-- 3. Add file_path column to documents (nullable: ted:// rows have no storage object)
ALTER TABLE documents ADD COLUMN file_path text;
COMMENT ON COLUMN documents.file_path IS
  'Path inside rfp-documents bucket: <org_id>/<timestamp>-<name>. NULL for synthetic ted:// docs.';

-- 4. Storage RLS — same pattern as org_assets in 011, scoped to rfp-documents.
CREATE POLICY rfp_documents_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'rfp-documents'
    AND (split_part(name, '/', 1))::uuid = current_org_id()
  );

CREATE POLICY rfp_documents_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'rfp-documents'
    AND (split_part(name, '/', 1))::uuid = current_org_id()
  );

CREATE POLICY rfp_documents_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'rfp-documents'
    AND (split_part(name, '/', 1))::uuid = current_org_id()
  );

CREATE POLICY rfp_documents_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'rfp-documents'
    AND (split_part(name, '/', 1))::uuid = current_org_id()
  );
