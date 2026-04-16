import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "./supabase/server";
import { createServiceClient } from "./supabase";

export class NotAuthenticatedError extends Error {
  constructor() {
    super("Not authenticated");
    this.name = "NotAuthenticatedError";
  }
}

export class NoOrganizationError extends Error {
  constructor() {
    super("User has no organization and no pending invite");
    this.name = "NoOrganizationError";
  }
}

type Profile = {
  organization_id: string;
  role: "super_user" | "user";
};

export async function getCurrentProfile(
  supabase: SupabaseClient
): Promise<{ userId: string; email: string; profile: Profile }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new NotAuthenticatedError();

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .maybeSingle<Profile>();

  if (profile) {
    return { userId: user.id, email: user.email ?? "", profile };
  }

  const bootstrapped = await bootstrapProfileFromInvite(user.id, user.email);
  if (!bootstrapped) throw new NoOrganizationError();

  return { userId: user.id, email: user.email ?? "", profile: bootstrapped };
}

export async function getOrgId(supabase?: SupabaseClient): Promise<string> {
  const client = supabase ?? (await createClient());
  const { profile } = await getCurrentProfile(client);
  return profile.organization_id;
}

async function bootstrapProfileFromInvite(
  userId: string,
  email: string | undefined
): Promise<Profile | null> {
  if (!email) return null;

  const service = createServiceClient();
  const now = new Date().toISOString();

  const { data: invite } = await service
    .from("organization_invites")
    .select("id, organization_id, role, expires_at, accepted_at")
    .eq("email", email)
    .is("accepted_at", null)
    .gt("expires_at", now)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{
      id: string;
      organization_id: string;
      role: "super_user" | "user";
      expires_at: string;
      accepted_at: string | null;
    }>();

  if (!invite) return null;

  const { error: profileError } = await service.from("profiles").insert({
    user_id: userId,
    organization_id: invite.organization_id,
    role: invite.role,
  });

  if (profileError) throw profileError;

  await service
    .from("organization_invites")
    .update({ accepted_at: now })
    .eq("id", invite.id);

  return {
    organization_id: invite.organization_id,
    role: invite.role,
  };
}
