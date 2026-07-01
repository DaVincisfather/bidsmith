import { createServiceClient } from "@/lib/supabase";

export interface OrgProfile {
  id: string;
  companyName: string;
  logoPath: string | null;
  colors: Record<string, string> | null;
  tonality: string | null;
  boilerplate: string | null;
}

/**
 * Aktiv profil ur workspace_settings.active_profile_id.
 * null när ingen profil skapats — anroparen behåller dagens beteende
 * (tomt företagsnamn, ingen ton-injektion). Ingen cache: profilen kan
 * redigeras mellan genereringar och en stale röst i ett anbud är värre
 * än en extra DB-läsning per generering.
 */
export async function loadActiveProfile(): Promise<OrgProfile | null> {
  const supabase = createServiceClient();
  const { data: ws } = await supabase
    .from("workspace_settings")
    .select("active_profile_id")
    .limit(1)
    .maybeSingle();
  if (!ws?.active_profile_id) return null;
  return loadProfileById(ws.active_profile_id);
}

/**
 * Profilen ett anbud GENERERADES med, pinnad via bids.profile_id (samma mönster
 * som mallen pinnas via bids.template_id). Export/editor måste använda denna, inte
 * den nu-aktiva profilen — annars kan omslag/sidfot visa ett annat bolagsnamn än
 * rösten som redan bakats in i brödtexten. null (legacy-bid utan pinnad profil, eller
 * ingen profil aktiv vid generering) → blankt bolagsnamn, oförändrat exportbeteende.
 */
export async function loadProfileForBid(profileId: string | null): Promise<OrgProfile | null> {
  if (!profileId) return null;
  return loadProfileById(profileId);
}

async function loadProfileById(id: string): Promise<OrgProfile | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("org_profiles")
    .select("id, company_name, logo_path, colors, tonality, boilerplate")
    .eq("id", id)
    .single();
  if (error || !data) return null;

  return {
    id: data.id,
    companyName: data.company_name,
    logoPath: data.logo_path,
    colors: data.colors,
    tonality: data.tonality,
    boilerplate: data.boilerplate,
  };
}
