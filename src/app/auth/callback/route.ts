import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase";
import { getAppUser, activateAppUser } from "@/lib/access";

/** Only allow same-origin relative paths as the post-login redirect target.
 *  A protocol-relative (`//evil.com`) or absolute URL in `next` would otherwise
 *  make the auth callback an open redirect. */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/login?error=no_user`);
  }

  // Membership gate: a session without an app_users row is denied, never given
  // default access. In normal operation this is unreachable (accounts are only
  // ever created via /setup or an admin invite, both of which insert the row in
  // the same call), so a missing row means an orphaned auth account — deny it.
  const service = createServiceClient();
  const appUser = await getAppUser(service, user.id);
  if (!appUser) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=no_access`);
  }
  if (appUser.status === "invited") {
    await activateAppUser(service, user.id);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
