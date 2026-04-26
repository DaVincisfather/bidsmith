import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase";
import { getCurrentProfile } from "@/lib/org";
import { getOrganization } from "@/lib/organisations";
import { SettingsForm } from "@/components/organisation/SettingsForm";

export const dynamic = "force-dynamic";

export default async function OrgSettingsPage() {
  const supabase = await createClient();
  const { profile } = await getCurrentProfile(supabase);
  if (profile.role !== "super_user") redirect("/organisation");

  const service = createServiceClient();
  const org = await getOrganization(service, profile.organization_id);

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-4 py-12 space-y-8">
        <div>
          <h1 className="text-2xl font-bold">Inställningar</h1>
          <p className="text-sm text-gray-500 mt-1">
            Brand och organisationsidentitet.
          </p>
        </div>
        <SettingsForm
          initial={{
            displayName: org.display_name ?? org.name,
            logoUrl: org.logo_url,
            accentColor: org.accent_color,
          }}
        />
      </div>
    </main>
  );
}
