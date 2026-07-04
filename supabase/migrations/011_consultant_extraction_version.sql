-- 011_consultant_extraction_version.sql — extraktions-versions-diskriminator (fas C-residual, stänger legacy-tvetydigheten)
-- Appliceras manuellt via Supabase SQL Editor FÖRE merge av koden som skriver kolumnen
-- (upsertConsultant sätter extraction_version explicit via insert + update — okänd kolumn hade fällt CV-uploaden).
--
-- PROBLEM: en post-feature-konsult vars evidens-vakt strippat ALLA citat (t.ex. fel fil
-- uppladdad som CV) är i datat oskiljbar från en LEGACY-konsult (extraherad före evidens-
-- featuren): båda har noll evidens överallt. Union-grinden (grounded-claims.ts) släpper då
-- igenom den degenererade konsultens claims med full vikt och UI:t döljer dess badges.
--
-- FIX: en versionskolumn skiljer generationerna.
--   NULL  = extraherad FÖRE denna feature (äkta legacy) → union-heuristiken gäller (grinden AV vid noll evidens).
--   1     = evidens-förankrade extraktions-generationen → grinden ALLTID PÅ: saknad evidens = flaggad,
--           även om raden saknar evidens överallt (all-strippad degenererad konsult filtreras korrekt bort).
--
-- Nullable med avsikt: befintliga rader förblir NULL (legacy) tills de laddas upp på nytt.
-- Versionskonstanten bor i src/lib/extraction-version.ts (EXTRACTION_VERSION = 1).

alter table consultants add column extraction_version int;
