-- 009_consultant_evidence.sql — persistera evidensvaktens källcitat (fas B-uppföljning, PR #56-review)
-- Appliceras manuellt via Supabase SQL Editor FÖRE merge av koden som skriver kolumnerna
-- (upsertConsultant insertar explicit — okänd kolumn hade fällt CV-uploaden).
--
-- Nullable: evidence saknas för (a) alla rader skrivna före denna migration,
-- (b) poster vakten flaggat (overifierbara efter ett reparationsförsök).
-- null = "obelagd" — källa-badgen i UI:t och fas C:s matchnings-policy läser detta.

alter table consultant_competencies add column evidence text;
alter table consultant_references add column evidence text;
