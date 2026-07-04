import { createClient } from "@/lib/supabase/server";
import { ProfileSection, type ProfileRow } from "@/components/settings/ProfileSection";
import { ProfileImpactPanel } from "@/components/settings/ProfileImpactPanel";

// Läser live workspace-data; prerendera aldrig vid build.
export const dynamic = "force-dynamic";

export default async function ProfilPage() {
  const supabase = await createClient();

  // active_profile_id-kolumnen läggs till i migration 005 — läs separat så ett
  // kolumnfel degraderar till null i stället för att ta hela sidan.
  const { data: wsProfile } = await supabase
    .from("workspace_settings")
    .select("active_profile_id")
    .limit(1)
    .maybeSingle();

  // org_profiles-tabellen skapas i 005 — om migrationen inte körts ger select ett fel.
  // Då degraderar vi till tom lista + en flagga som visar migrationshjälpen i stället
  // för att krascha (samma mönster som den tidigare inställningssidan).
  const { data: profiles, error: profilesError } = await supabase
    .from("org_profiles")
    .select("id, company_name, tonality, boilerplate")
    .order("created_at", { ascending: false });

  const migration005Missing =
    profilesError?.code === "42P01" ||
    profilesError?.code === "PGRST205" ||
    /does not exist|schema cache/i.test(profilesError?.message ?? "");

  const rows = (profiles as ProfileRow[] | null) ?? [];
  const activeProfileId = wsProfile?.active_profile_id ?? null;
  const active = rows.find((p) => p.id === activeProfileId) ?? null;

  return (
    <main className="min-h-screen bg-paper">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-2xl font-display font-normal mb-8">Företagsprofil</h1>
        <div className="space-y-8">
          <ProfileImpactPanel
            activeProfile={
              active
                ? {
                    companyName: active.company_name,
                    tonality: active.tonality,
                    boilerplate: active.boilerplate,
                  }
                : null
            }
          />
          <ProfileSection
            profiles={rows}
            activeProfileId={activeProfileId}
            migration005Missing={migration005Missing}
          />
        </div>
      </div>
    </main>
  );
}
