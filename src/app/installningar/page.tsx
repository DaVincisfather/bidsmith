import { createClient } from "@/lib/supabase/server";
import { TemplateSection } from "@/components/settings/TemplateSection";
import { ProfileSection } from "@/components/settings/ProfileSection";
import type { TemplateManifest } from "@/lib/pptx-template/manifest-types";

// Läser live workspace-data; prerendera aldrig vid build.
export const dynamic = "force-dynamic";

export interface TemplateRow {
  id: string;
  name: string;
  version: number;
  manifest: TemplateManifest;
  created_at: string;
}

export interface ProfileRow {
  id: string;
  company_name: string;
  tonality: string | null;
  boilerplate: string | null;
}

export default async function InstallningarPage() {
  const supabase = await createClient();

  // Mallar finns alltid efter migration 004 (templates-tabellen är seedad).
  const { data: templates } = await supabase
    .from("templates")
    .select("id, name, version, manifest, created_at")
    .order("created_at", { ascending: false });

  // active_template_id finns alltid efter 004. active_profile_id-kolumnen läggs
  // till i 005 — läs den separat så att ett kolumnfel degraderar till null i
  // stället för att ta hela sidan.
  const { data: wsTemplate } = await supabase
    .from("workspace_settings")
    .select("active_template_id")
    .limit(1)
    .maybeSingle();

  const { data: wsProfile } = await supabase
    .from("workspace_settings")
    .select("active_profile_id")
    .limit(1)
    .maybeSingle();

  // org_profiles-tabellen skapas i 005 — om migrationen inte körts ger select
  // ett fel. Då degraderar vi till tom lista + en flagga som visar
  // migrationshjälpen i stället för att krascha.
  const { data: profiles, error: profilesError } = await supabase
    .from("org_profiles")
    .select("id, company_name, tonality, boilerplate")
    .order("created_at", { ascending: false });

  // Visa migrationshjälpen BARA när tabellen faktiskt saknas (42P01 undefined_table
  // / PostgREST PGRST205 saknar tabellen i schema-cachen). Ett annat fel (RLS,
  // transient DB) ska inte maskeras som "kör migration 005" — då döljs den riktiga
  // orsaken. Övriga fel → tom lista (ingen falsk migrationshint).
  const migration005Missing =
    profilesError?.code === "42P01" ||
    profilesError?.code === "PGRST205" ||
    /does not exist|schema cache/i.test(profilesError?.message ?? "");

  return (
    <main className="min-h-screen bg-paper">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-2xl font-display font-normal mb-8">Inställningar</h1>
        <div className="space-y-12">
          <TemplateSection
            templates={(templates as TemplateRow[] | null) ?? []}
            activeTemplateId={wsTemplate?.active_template_id ?? null}
          />
          <ProfileSection
            profiles={(profiles as ProfileRow[] | null) ?? []}
            activeProfileId={wsProfile?.active_profile_id ?? null}
            migration005Missing={migration005Missing}
          />
        </div>
      </div>
    </main>
  );
}
