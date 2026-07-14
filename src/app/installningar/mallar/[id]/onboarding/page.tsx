import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { foreignTemplatesEnabled } from "@/lib/pptx-template/onboarding/foreign-flag";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Lanserings-grind (vägbeslutet 2026-07-14): foreign-onboardingen är opt-in.
  if (!foreignTemplatesEnabled()) notFound();
  const supabase = await createClient();
  const { data: template } = await supabase
    .from("templates")
    .select("id, name, version, onboarding_status")
    .eq("id", id)
    .maybeSingle();
  if (!template || template.onboarding_status === "none") notFound();

  return (
    <main className="min-h-screen bg-paper">
      <div className="max-w-5xl mx-auto px-4 py-12">
        <h1 className="text-2xl font-display font-normal mb-2">
          Onboarda mall: {template.name} v{template.version}
        </h1>
        <OnboardingWizard templateId={template.id} />
      </div>
    </main>
  );
}
