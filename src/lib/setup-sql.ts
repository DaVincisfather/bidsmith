import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Builds supabase/setup.sql for FRESH installs: every migration concatenated in
 * numeric order, plus the two storage buckets that used to be manual dashboard
 * steps (rfp-documents, consultant-cvs) — created via SQL exactly like
 * migration 005 already creates bid-templates (SETUP.md's old claim that
 * buckets can't be created from SQL was wrong). Existing installs keep applying
 * migrations incrementally; this file is never applied on top of them.
 *
 * The committed supabase/setup.sql is guarded by a drift test: adding a
 * migration without regenerating (npm run gen:setup-sql) fails the suite.
 */

const HEADER = `-- ============================================================================
-- Bidsmith setup.sql — KOMPLETT schema för en NY installation.
--
-- NY installation:  klistra in HELA denna fil i Supabase SQL Editor och kör EN
--                   gång. Klart — inga manuella bucket-steg behövs.
-- BEFINTLIG installation: kör INTE denna fil. Fortsätt applicera filerna i
--                   supabase/migrations/ inkrementellt i nummerordning.
--
-- Genererad av scripts/generate-setup-sql.ts — redigera INTE för hand;
-- kör "npm run gen:setup-sql" efter varje ny migration.
-- ============================================================================

`;

const BUCKET_BLOCK = `-- ===== storage-buckets (ersätter de manuella dashboard-stegen) =====
-- Privata buckets; åtkomst sker via service-rollen och signerade URL:er.
-- Mönstret är detsamma som bid-templates-bucketen i 005_org_profiles.sql.
insert into storage.buckets (id, name, public) values ('rfp-documents', 'rfp-documents', false);
insert into storage.buckets (id, name, public) values ('consultant-cvs', 'consultant-cvs', false);

create policy rfp_documents_authenticated_all on storage.objects
  for all to authenticated
  using (bucket_id = 'rfp-documents') with check (bucket_id = 'rfp-documents');

create policy consultant_cvs_authenticated_all on storage.objects
  for all to authenticated
  using (bucket_id = 'consultant-cvs') with check (bucket_id = 'consultant-cvs');
`;

/** Migration files in numeric order (NNN_ prefix), names validated. */
export function listMigrations(migrationsDir: string): string[] {
  return readdirSync(migrationsDir)
    .filter((f) => /^\d{3}_.+\.sql$/.test(f))
    .sort();
}

export function buildSetupSql(migrationsDir: string): string {
  const parts: string[] = [HEADER];
  for (const file of listMigrations(migrationsDir)) {
    const sql = readFileSync(path.join(migrationsDir, file), "utf8").trimEnd();
    parts.push(`-- ===== ${file} =====\n${sql}\n`);
  }
  parts.push(BUCKET_BLOCK);
  return parts.join("\n");
}
