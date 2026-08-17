import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Session guard for server components — the page-level twin of the #103 rule
 * ("never trust the middleware alone"). Pages that read with the service
 * client (RLS bypass) MUST call this first: the middleware can be bypassed
 * (matcher carve-outs) and used to fail open when the anon key was missing
 * (audit 2026-08-17), which silently rendered workspace data to anonymous
 * visitors. createClient throws when the anon key is absent, so even that
 * misconfiguration now fails closed here.
 */
export async function requirePageSession(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
}
