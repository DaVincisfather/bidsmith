import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "./supabase";
import type { OrgRole } from "./org";

export const DEFAULT_INVITE_TTL_DAYS = 7;
export const SUPER_USER_SEAT_FIELD = "seat_limit";

export class SeatLimitReachedError extends Error {
  constructor(limit: number) {
    super(`Seat limit of ${limit} super_users reached`);
    this.name = "SeatLimitReachedError";
  }
}

export class DuplicateInviteError extends Error {
  constructor(email: string) {
    super(`An invite for ${email} already exists in this organization`);
    this.name = "DuplicateInviteError";
  }
}

export class AlreadyMemberError extends Error {
  constructor(email: string) {
    super(`${email} is already a member of this organization`);
    this.name = "AlreadyMemberError";
  }
}

export function generateInviteToken(): string {
  return randomBytes(24).toString("hex");
}

export function computeExpiresAt(now: Date = new Date(), ttlDays: number = DEFAULT_INVITE_TTL_DAYS): string {
  const expires = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);
  return expires.toISOString();
}

type ProfileCountRow = { role: OrgRole };

export async function countActiveSuperUsers(
  service: SupabaseClient,
  organizationId: string
): Promise<number> {
  const { data, error } = await service
    .from("profiles")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("role", "super_user")
    .returns<ProfileCountRow[]>();
  if (error) throw error;
  return data?.length ?? 0;
}

export async function getOrgSeatLimit(
  service: SupabaseClient,
  organizationId: string
): Promise<number> {
  const { data, error } = await service
    .from("organizations")
    .select("seat_limit")
    .eq("id", organizationId)
    .single<{ seat_limit: number }>();
  if (error) throw error;
  return data.seat_limit;
}

export type CreateInviteInput = {
  organizationId: string;
  email: string;
  role: OrgRole;
  invitedBy: string;
  redirectTo: string;
};

export type CreateInviteResult = {
  inviteId: string;
  token: string;
  expiresAt: string;
};

export async function createInvite(
  input: CreateInviteInput,
  deps: { service?: SupabaseClient } = {}
): Promise<CreateInviteResult> {
  const service = deps.service ?? createServiceClient();
  const normalizedEmail = input.email.trim().toLowerCase();

  const { data: existingProfile } = await service
    .from("profiles")
    .select("user_id, organization_id")
    .eq("organization_id", input.organizationId)
    .returns<Array<{ user_id: string; organization_id: string }>>();

  if (existingProfile && existingProfile.length > 0) {
    const { data: authUsers } = await service.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    const matchingUser = authUsers?.users.find(
      (u) => u.email?.toLowerCase() === normalizedEmail
    );
    if (matchingUser && existingProfile.some((p) => p.user_id === matchingUser.id)) {
      throw new AlreadyMemberError(normalizedEmail);
    }
  }

  if (input.role === "super_user") {
    const [current, limit] = await Promise.all([
      countActiveSuperUsers(service, input.organizationId),
      getOrgSeatLimit(service, input.organizationId),
    ]);
    if (current >= limit) {
      throw new SeatLimitReachedError(limit);
    }
  }

  const { data: existingInvite } = await service
    .from("organization_invites")
    .select("id, accepted_at")
    .eq("organization_id", input.organizationId)
    .eq("email", normalizedEmail)
    .is("accepted_at", null)
    .maybeSingle<{ id: string; accepted_at: string | null }>();

  if (existingInvite) {
    throw new DuplicateInviteError(normalizedEmail);
  }

  // Clean up orphaned accepted invite rows for this email. They persist
  // when a previously-accepted member is later removed from `profiles` —
  // the invite row stays behind and the UNIQUE(organization_id, email)
  // constraint would otherwise block the new INSERT below. Safe because
  // the already-member and pending-invite guards above have passed.
  await service
    .from("organization_invites")
    .delete()
    .eq("organization_id", input.organizationId)
    .eq("email", normalizedEmail)
    .not("accepted_at", "is", null);

  const token = generateInviteToken();
  const expiresAt = computeExpiresAt();

  const { data: inserted, error: insertError } = await service
    .from("organization_invites")
    .insert({
      organization_id: input.organizationId,
      email: normalizedEmail,
      role: input.role,
      token,
      invited_by: input.invitedBy,
      expires_at: expiresAt,
    })
    .select("id")
    .single<{ id: string }>();

  if (insertError) throw insertError;

  const { error: mailError } = await service.auth.admin.inviteUserByEmail(normalizedEmail, {
    redirectTo: input.redirectTo,
    data: {
      organization_id: input.organizationId,
      invite_token: token,
    },
  });

  if (mailError) {
    await service.from("organization_invites").delete().eq("id", inserted.id);
    throw mailError;
  }

  return { inviteId: inserted.id, token, expiresAt };
}

export type InviteRow = {
  id: string;
  email: string;
  role: OrgRole;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
};

export async function listPendingInvites(
  service: SupabaseClient,
  organizationId: string
): Promise<InviteRow[]> {
  const { data, error } = await service
    .from("organization_invites")
    .select("id, email, role, expires_at, accepted_at, created_at")
    .eq("organization_id", organizationId)
    .is("accepted_at", null)
    .order("created_at", { ascending: false })
    .returns<InviteRow[]>();
  if (error) throw error;
  return data ?? [];
}

export async function cancelInvite(
  service: SupabaseClient,
  organizationId: string,
  inviteId: string
): Promise<void> {
  const { error } = await service
    .from("organization_invites")
    .delete()
    .eq("id", inviteId)
    .eq("organization_id", organizationId)
    .is("accepted_at", null);
  if (error) throw error;
}

export async function resendInvite(
  service: SupabaseClient,
  organizationId: string,
  inviteId: string,
  redirectTo: string
): Promise<void> {
  const { data: invite, error } = await service
    .from("organization_invites")
    .select("email, token")
    .eq("id", inviteId)
    .eq("organization_id", organizationId)
    .is("accepted_at", null)
    .single<{ email: string; token: string }>();
  if (error) throw error;

  const newExpiresAt = computeExpiresAt();
  const { error: updateError } = await service
    .from("organization_invites")
    .update({ expires_at: newExpiresAt })
    .eq("id", inviteId);
  if (updateError) throw updateError;

  const { error: mailError } = await service.auth.admin.inviteUserByEmail(invite.email, {
    redirectTo,
    data: {
      organization_id: organizationId,
      invite_token: invite.token,
    },
  });
  if (mailError) throw mailError;
}

export type MemberRow = {
  user_id: string;
  email: string;
  role: OrgRole;
  created_at: string;
};

export async function listMembers(
  service: SupabaseClient,
  organizationId: string
): Promise<MemberRow[]> {
  const { data: profiles, error } = await service
    .from("profiles")
    .select("user_id, role, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true })
    .returns<Array<{ user_id: string; role: OrgRole; created_at: string }>>();
  if (error) throw error;
  if (!profiles || profiles.length === 0) return [];

  const { data: authUsers } = await service.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const emailByUserId = new Map<string, string>();
  for (const user of authUsers?.users ?? []) {
    if (user.email) emailByUserId.set(user.id, user.email);
  }

  return profiles.map((p) => ({
    user_id: p.user_id,
    email: emailByUserId.get(p.user_id) ?? "(okänd e-post)",
    role: p.role,
    created_at: p.created_at,
  }));
}

export async function removeMember(
  service: SupabaseClient,
  organizationId: string,
  userId: string,
  actingUserId: string
): Promise<void> {
  if (userId === actingUserId) {
    throw new Error("Cannot remove yourself");
  }
  const { error } = await service
    .from("profiles")
    .delete()
    .eq("user_id", userId)
    .eq("organization_id", organizationId);
  if (error) throw error;
}
