import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TemplateSection } from "@/components/settings/TemplateSection";
import type { TemplateManifest } from "@/lib/pptx-template/manifest-types";

// Läser live workspace-data; prerendera aldrig vid build.
export const dynamic = "force-dynamic";

export interface TemplateRow {
  id: string;
  name: string;
  version: number;
  manifest: TemplateManifest | null;
  onboarding_status: string;
  created_at: string;
}

export default async function InstallningarPage() {
  const supabase = await createClient();

  // Mallar finns alltid efter migration 004 (templates-tabellen är seedad).
  const { data: templates } = await supabase
    .from("templates")
    .select("id, name, version, manifest, onboarding_status, created_at")
    .order("created_at", { ascending: false });

  const { data: wsTemplate } = await supabase
    .from("workspace_settings")
    .select("active_template_id")
    .limit(1)
    .maybeSingle();

  return (
    <main className="min-h-screen bg-paper">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-2xl font-display font-normal mb-8">Inställningar</h1>
        <div className="space-y-12">
          <TemplateSection
            templates={(templates as TemplateRow[] | null) ?? []}
            activeTemplateId={wsTemplate?.active_template_id ?? null}
          />

          {/* Företagsprofilen har flyttat till arbetsytan — behåll en pekare så att
              muskelminnet inte strandar. */}
          <section className="space-y-2">
            <h2 className="text-lg font-display font-normal">Avsändarprofil</h2>
            <p className="text-sm text-ink-mute">
              Företagsprofilen redigeras nu i arbetsytan, tillsammans med en förklaring av
              hur mycket den påverkar genererade anbud.
            </p>
            <Link
              href="/arbetsyta/profil"
              className="inline-block text-sm font-medium text-accent hover:underline"
            >
              Öppna Företagsprofil i arbetsytan →
            </Link>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-display font-normal">Användare</h2>
            <p className="text-sm text-ink-mute">
              Bjud in kollegor och se vilka som har tillgång till arbetsytan.
            </p>
            <Link
              href="/installningar/anvandare"
              className="inline-block text-sm font-medium text-accent hover:underline"
            >
              Hantera användare →
            </Link>
          </section>
        </div>
      </div>
    </main>
  );
}
