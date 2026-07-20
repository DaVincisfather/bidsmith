import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserId, NotAuthenticatedError } from "@/lib/org";
import type { ParseResult } from "@/lib/api-helpers";

export type AppUserRole = "admin" | "member";
export type AppUserStatus = "invited" | "active";

export interface AppUser {
  id: string;
  email: string;
  role: AppUserRole;
  status: AppUserStatus;
  invitedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

const APP_USER_SELECT = "id, email, role, status, invited_by, created_at, updated_at";

export function mapAppUserRow(row: Record<string, unknown>): AppUser {
  return {
    id: row.id as string,
    email: row.email as string,
    role: row.role as AppUserRole,
    status: row.status as AppUserStatus,
    invitedBy: (row.invited_by as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/** Total app_users rows. 0 ⇒ fresh install (setup not yet run). */
export async function countAppUsers(service: SupabaseClient): Promise<number> {
  const { count, error } = await service
    .from("app_users")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function getAppUser(
  service: SupabaseClient,
  userId: string,
): Promise<AppUser | null> {
  const { data, error } = await service
    .from("app_users")
    .select(APP_USER_SELECT)
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapAppUserRow(data as Record<string, unknown>) : null;
}

export async function findAppUserByEmail(
  service: SupabaseClient,
  email: string,
): Promise<AppUser | null> {
  // Escape ILIKE metacharacters (%/_/\) so an email that happens to contain them
  // (e.g. first_last@co.se) matches literally, not as a wildcard. Mirrors
  // upsertConsultant's name lookup in supabase.ts.
  const likePattern = email.replace(/[\\%_]/g, "\\$&");
  const { data, error } = await service
    .from("app_users")
    .select(APP_USER_SELECT)
    .ilike("email", likePattern)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapAppUserRow(data as Record<string, unknown>) : null;
}

/**
 * Creates the auth account AND sends the invite email in one Supabase admin
 * call, then records the app_users row. The invite is the source of truth: if
 * inviteUserByEmail fails we throw BEFORE inserting, so we never leave an
 * app_users row without a matching auth account. Caller is responsible for the
 * duplicate-email pre-check (findAppUserByEmail) — a unique auth account per
 * email is enforced by Supabase auth itself.
 */
export async function createInvite(
  service: SupabaseClient,
  args: { email: string; role: AppUserRole; invitedBy: string | null },
): Promise<AppUser> {
  const { data, error } = await service.auth.admin.inviteUserByEmail(args.email);
  if (error || !data?.user) {
    throw new Error(error?.message ?? "Invite failed: no user returned");
  }
  const { data: row, error: insertError } = await service
    .from("app_users")
    .insert({
      id: data.user.id,
      email: args.email,
      role: args.role,
      status: "invited",
      invited_by: args.invitedBy,
    })
    .select(APP_USER_SELECT)
    .single();
  if (insertError) throw new Error(insertError.message);
  return mapAppUserRow(row as Record<string, unknown>);
}

/** Flips invited→active on first successful login. No-op if already active. */
export async function activateAppUser(
  service: SupabaseClient,
  userId: string,
): Promise<void> {
  const { error } = await service
    .from("app_users")
    .update({ status: "active" })
    .eq("id", userId)
    .eq("status", "invited");
  if (error) throw new Error(error.message);
}

/**
 * Gate for admin-only routes. Identity is resolved from the session-bound
 * client's auth session (via getUserId); the role lookup then reads the
 * app_users row through the service client. Returns 401 when unauthenticated,
 * 403 when the caller lacks the admin role.
 */
export async function requireAdmin(
  sessionClient: SupabaseClient,
  service: SupabaseClient,
): Promise<ParseResult<AppUser>> {
  let userId: string;
  try {
    userId = await getUserId(sessionClient);
  } catch (err) {
    if (err instanceof NotAuthenticatedError) {
      return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
    }
    throw err;
  }
  const appUser = await getAppUser(service, userId);
  if (!appUser || appUser.role !== "admin") {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, data: appUser };
}
