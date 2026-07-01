-- 006_bid_profile_id.sql — pinna avsändarprofilen på anbudet (fas 2, PR C-review #1)
-- Appliceras manuellt via Supabase SQL Editor.
--
-- Anbudet bakar in profilens röst/boilerplate vid GENERERING. Utan en pinnad
-- profil hämtar export den nu-aktiva profilen → omslag/sidfot kan visa ett annat
-- bolagsnamn än brödtexten om profilen ändrats emellan. Samma mönster som
-- bids.template_id. Legacy-bids (kolumn null) → blankt bolagsnamn vid export.

alter table bids add column if not exists profile_id uuid references org_profiles(id);
