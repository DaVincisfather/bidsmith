"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase";
import { getCurrentProfile } from "@/lib/org";
import {
  createInvite,
  cancelInvite as cancelInviteLib,
  resendInvite as resendInviteLib,
  removeMember as removeMemberLib,
  SeatLimitReachedError,
  DuplicateInviteError,
  AlreadyMemberError,
} from "@/lib/invites";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function requireSuperUser() {
  const supabase = await createClient();
  const { userId, profile } = await getCurrentProfile(supabase);
  if (profile.role !== "super_user") {
    throw new Error("Only super_users can manage the team");
  }
  return { userId, organizationId: profile.organization_id };
}

async function getCallbackUrl(): Promise<string> {
  const hdrs = await headers();
  const host = hdrs.get("host");
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  if (!host) throw new Error("Missing host header");
  return `${proto}://${host}/auth/callback`;
}

export async function createInviteAction(formData: FormData): Promise<ActionResult> {
  try {
    const email = String(formData.get("email") ?? "");
    const role = String(formData.get("role") ?? "user") as "super_user" | "user";
    if (role !== "super_user" && role !== "user") {
      return { ok: false, error: "Ogiltig roll" };
    }
    if (!email || !email.includes("@")) {
      return { ok: false, error: "Ogiltig e-postadress" };
    }

    const { userId, organizationId } = await requireSuperUser();
    const redirectTo = await getCallbackUrl();

    await createInvite({
      organizationId,
      email,
      role,
      invitedBy: userId,
      redirectTo,
    });

    revalidatePath("/team");
    return { ok: true };
  } catch (err) {
    if (err instanceof SeatLimitReachedError) {
      return { ok: false, error: `Taket för super_users är nått (${err.message.match(/\d+/)?.[0] ?? ""})` };
    }
    if (err instanceof DuplicateInviteError) {
      return { ok: false, error: "En inbjudan till denna e-post är redan skickad" };
    }
    if (err instanceof AlreadyMemberError) {
      return { ok: false, error: "Denna person är redan medlem" };
    }
    const message = err instanceof Error ? err.message : "Okänt fel";
    return { ok: false, error: message };
  }
}

export async function cancelInviteAction(inviteId: string): Promise<ActionResult> {
  try {
    const { organizationId } = await requireSuperUser();
    const service = createServiceClient();
    await cancelInviteLib(service, organizationId, inviteId);
    revalidatePath("/team");
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Okänt fel";
    return { ok: false, error: message };
  }
}

export async function resendInviteAction(inviteId: string): Promise<ActionResult> {
  try {
    const { organizationId } = await requireSuperUser();
    const redirectTo = await getCallbackUrl();
    const service = createServiceClient();
    await resendInviteLib(service, organizationId, inviteId, redirectTo);
    revalidatePath("/team");
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Okänt fel";
    return { ok: false, error: message };
  }
}

export async function removeMemberAction(userIdToRemove: string): Promise<ActionResult> {
  try {
    const { userId, organizationId } = await requireSuperUser();
    const service = createServiceClient();
    await removeMemberLib(service, organizationId, userIdToRemove, userId);
    revalidatePath("/team");
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Okänt fel";
    return { ok: false, error: message };
  }
}
