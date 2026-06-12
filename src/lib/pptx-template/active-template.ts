import { createServiceClient } from "@/lib/supabase";
import { loadTemplate, loadTemplateByName, type LoadedTemplate } from "./template-store";

/**
 * Aktiv mall = workspace_settings.active_template_id.
 * Saknas pekaren (färsk install, migration 004 ej seedad klart) →
 * bundlade anbudsmall-v2 v1 så flödet aldrig är dött.
 */
export async function loadActiveTemplate(): Promise<LoadedTemplate> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("workspace_settings")
    .select("active_template_id")
    .limit(1)
    .maybeSingle();

  if (data?.active_template_id) return loadTemplate(data.active_template_id);
  return loadTemplateByName("anbudsmall-v2", 1);
}

/** Mall för ett existerande bid — legacy-bids (null) får anbudsmall-v2 v1. */
export async function loadTemplateForBid(
  templateId: string | null,
): Promise<LoadedTemplate> {
  if (templateId) return loadTemplate(templateId);
  return loadTemplateByName("anbudsmall-v2", 1);
}
