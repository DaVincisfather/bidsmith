import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { countAppUsers, createInvite } from "@/lib/access";
import { parseBody, internalError } from "@/lib/api-helpers";
import { SetupBootstrapSchema } from "@/lib/api-schemas";

// Public. Creates the FIRST admin on a fresh install and is inert thereafter
// (409 once any app_users row exists). The re-check here is best-effort against
// a concurrent double-submit — the residual bootstrap race is an accepted risk
// (single-operator install), see the design doc.
export async function POST(request: NextRequest) {
  try {
    const parsed = await parseBody(request, SetupBootstrapSchema);
    if (!parsed.ok) return parsed.response;

    const service = createServiceClient();
    if ((await countAppUsers(service)) > 0) {
      return NextResponse.json(
        { error: "Setup är redan slutförd. Logga in via /login." },
        { status: 409 },
      );
    }

    const admin = await createInvite(service, {
      email: parsed.data.email,
      role: "admin",
      invitedBy: null,
      redirectTo: `${new URL(request.url).origin}/auth/callback`,
    });
    // adopted ⇒ the email already had an auth account (upgrade install) — no
    // invite email was sent, so the UI must say "log in" instead of "check mail".
    return NextResponse.json({ id: admin.appUser.id, adopted: admin.adopted }, { status: 201 });
  } catch (err) {
    return internalError(err);
  }
}
