-- 010_consultant_cv_file.sql — persistera konsultens original-CV (D-SYMMETRI med analys-källvyn)
-- Appliceras manuellt via Supabase SQL Editor FÖRE merge av koden som skriver kolumnen
-- (upload-routen sätter cv_file_path explicit via update — okänd kolumn hade fällt skrivningen).
--
-- OPERATÖRS-CHECKLISTA FÖRE MERGE (två manuella steg — buckets är INTE SQL):
--   1. Kör denna migration (lägger till consultants.cv_file_path).
--   2. Skapa den PRIVATA storage-bucketen `consultant-cvs` i Supabase Storage
--      (Storage → New bucket → namn: consultant-cvs, Public: OFF). Upload-routen
--      laddar upp originalfilen dit; konsult-källvyn signerar den (getCvSignedUrl).
--      Motsvarar den privata `rfp-documents`-bucketen som analys-källvyn använder.
--
-- Nullable: konsulter skapade före denna feature har ingen lagrad originalfil (bara
-- raw_cv_text) → cv_file_path = null; konsult-källvyn utelämnar då "Öppna originalet".

alter table consultants add column cv_file_path text;
