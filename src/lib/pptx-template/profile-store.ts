import { createServiceClient } from "@/lib/supabase";
import { parseTemplateProfile, type TemplateProfile } from "./template-profile";

/**
 * Persistence for template profiles (template-upload slice 5). One profile per
 * template — the durable, editable artifact produced at onboarding and read at
 * render time. Mirrors template-store.ts: service client (called outside Next's
 * request scope by scripts/workers), Zod-validated on the way in AND out so a
 * malformed profile can neither be written nor trusted when read back.
 *
 * Table: template_profiles (migration 008), unique(template_id) — a profile is
 * edited in place, not duplicated.
 */

/** Upserts the profile for its template (edited in place via unique(template_id)). */
export async function saveTemplateProfile(profile: TemplateProfile): Promise<void> {
  // Validate before persisting — a malformed profile must never reach the DB.
  const valid = parseTemplateProfile(profile);

  const supabase = createServiceClient();
  const { error } = await supabase.from("template_profiles").upsert(
    {
      template_id: valid.templateId,
      profile: valid,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "template_id" },
  );

  if (error) {
    throw new Error(
      `kunde inte spara mall-profil för template ${valid.templateId}: ${error.message}`,
    );
  }
}

/**
 * Loads + validates the stored profile for a template, or null when none exists
 * yet (an uploaded-but-not-onboarded template is a normal state — the caller
 * decides whether that's an error).
 */
export async function loadTemplateProfile(
  templateId: string,
): Promise<TemplateProfile | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("template_profiles")
    .select("profile")
    .eq("template_id", templateId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Supabase query failed for template_profiles(template_id='${templateId}'): ${error.message}`,
    );
  }
  if (!data) return null;

  return parseTemplateProfile((data as { profile: unknown }).profile);
}
