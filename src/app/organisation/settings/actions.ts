"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase";
import { getCurrentProfile } from "@/lib/org";
import { validateOrgName, validateLogoFile, validateAccent } from "./validators";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function requireSuperUser() {
  const supabase = await createClient();
  const { userId, profile } = await getCurrentProfile(supabase);
  if (profile.role !== "super_user") {
    throw new Error("Only super_users can change organisation settings");
  }
  return { userId, organizationId: profile.organization_id };
}

export async function updateOrgNameAction(formData: FormData): Promise<ActionResult> {
  try {
    const raw = String(formData.get("display_name") ?? "");
    const v = validateOrgName(raw);
    if (!v.ok) return v;

    const { organizationId } = await requireSuperUser();
    const service = createServiceClient();
    const { error } = await service
      .from("organizations")
      .update({ display_name: v.value })
      .eq("id", organizationId);
    if (error) return { ok: false, error: error.message };

    revalidatePath("/organisation");
    revalidatePath("/organisation/settings");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Okänt fel" };
  }
}

export async function uploadLogoAction(formData: FormData): Promise<ActionResult> {
  try {
    const file = formData.get("logo");
    if (!(file instanceof File)) {
      return { ok: false, error: "Ingen fil uppladdad" };
    }
    const v = validateLogoFile({ size: file.size, type: file.type });
    if (!v.ok) return v;

    const { organizationId } = await requireSuperUser();
    const service = createServiceClient();

    const ext = file.type === "image/svg+xml" ? "svg"
      : file.type === "image/jpeg" ? "jpg" : "png";
    const path = `${organizationId}/logo-${Date.now()}.${ext}`;

    const buffer = await file.arrayBuffer();
    const { error: uploadErr } = await service.storage
      .from("org-assets")
      .upload(path, buffer, { contentType: file.type, upsert: false });
    if (uploadErr) return { ok: false, error: uploadErr.message };

    const { data: pub } = service.storage.from("org-assets").getPublicUrl(path);
    const publicUrl = pub.publicUrl;

    const { error: updErr } = await service
      .from("organizations")
      .update({ logo_url: publicUrl })
      .eq("id", organizationId);
    if (updErr) return { ok: false, error: updErr.message };

    // Cleanup: keep only latest 2 logos for this org.
    const { data: list } = await service.storage
      .from("org-assets")
      .list(organizationId, { limit: 100, sortBy: { column: "created_at", order: "desc" } });
    if (list && list.length > 2) {
      const toDelete = list.slice(2).map((o) => `${organizationId}/${o.name}`);
      await service.storage.from("org-assets").remove(toDelete);
    }

    revalidatePath("/organisation");
    revalidatePath("/organisation/settings");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Okänt fel" };
  }
}

export async function updateAccentAction(formData: FormData): Promise<ActionResult> {
  try {
    const raw = String(formData.get("accent_color") ?? "");
    const v = validateAccent(raw);
    if (!v.ok) return v;

    const { organizationId } = await requireSuperUser();
    const service = createServiceClient();
    const { error } = await service
      .from("organizations")
      .update({ accent_color: v.value })
      .eq("id", organizationId);
    if (error) return { ok: false, error: error.message };

    revalidatePath("/organisation");
    revalidatePath("/organisation/settings");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Okänt fel" };
  }
}
