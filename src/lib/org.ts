import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "./supabase/server";

export class NotAuthenticatedError extends Error {
  constructor() {
    super("Not authenticated");
    this.name = "NotAuthenticatedError";
  }
}

/**
 * Returns the authenticated user's id. In single-workspace Bidsmith there is no
 * workspace scoping — user_id is used only for attribution (who created a bid,
 * whose API usage). All logged-in users share one workspace.
 */
export async function getUserId(supabase?: SupabaseClient): Promise<string> {
  const client = supabase ?? (await createClient());
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw new NotAuthenticatedError();
  return user.id;
}
