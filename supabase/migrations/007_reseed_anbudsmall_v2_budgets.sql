-- 007_reseed_anbudsmall_v2_budgets.sql
-- Uppdaterar bundlade designmallen anbudsmall-v2:s manifest efter mall-overflow
-- Task 1 (Part A + Part B). Runtime laeser manifestet ur denna kolumn
-- (src/lib/pptx-template/template-store.ts), INTE ur disk-json, sa budgetarna nar
-- inte prod utan denna UPDATE.
--   Part A: phases[*].activities[*] 120 -> 115 (aerlig geometrisk bindning foer
--     flerradiga normAutofit-boxar).
--   Part B: nya editorialOnly-budgetar for kravmatris/team + deras fieldSlides:
--     rows[*].requirement 160, rows[*].hurUppfylls 160, rows[*].referens 70,
--     members[*].role 60.
-- Kirurgiskt: rör ENBART budgets + fieldSlides (exakt det diffen mot disk-manifestet
-- aendrade) via jsonb_set. Ascii-fragment pa en rad => inga radslut/kontrolltecken att
-- escapa vid inklistring. Idempotent: kan koeras om utan bieffekt.
-- Applicera manuellt via Supabase SQL Editor (redigera aldrig en applicerad migration).
update templates
set manifest = jsonb_set(
  jsonb_set(
    manifest,
    '{budgets}',
    '{"phases[*].name":40,"phases[*].period":10,"phases[*].activities[*]":115,"phases[*].deliverables[*]":100,"phases[*].decisions[*]":100,"phases[*].objective":120,"checkpoints[*]":80,"members[*].role":60,"rows[*].requirement":160,"rows[*].hurUppfylls":160,"rows[*].referens":70,"certs[*].description":80}'::jsonb
  ),
  '{fieldSlides}',
  '{"phases[*].name":6,"phases[*].period":6,"phases[*].activities[*]":7,"phases[*].deliverables[*]":7,"phases[*].decisions[*]":7,"phases[*].objective":7,"checkpoints[*]":11,"members[*].role":12,"rows[*].requirement":13,"rows[*].hurUppfylls":13,"rows[*].referens":13,"certs[*].description":17}'::jsonb
)
where name = 'anbudsmall-v2' and version = 1;
