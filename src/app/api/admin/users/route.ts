import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase";
import {
  requireAdmin,
  findAppUserByEmail,
  createInvite,
  mapAppUserRow,
} from "@/lib/access";
import { parseBody, internalError } from "@/lib/api-helpers";
import { AdminInviteSchema } from "@/lib/api-schemas";

export async function GET() {
  try {
    const sessionClient = await createClient();
    const service = createServiceClient();
    const auth = await requireAdmin(sessionClient, service);
    if (!auth.ok) return auth.response;

    const { data, error } = await service
      .from("app_users")
      .select("id, email, role, status, invited_by, created_at, updated_at")
      .order("created_at", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      users: (data ?? []).map((r) => mapAppUserRow(r as Record<string, unknown>)),
    });
  } catch (err) {
    return internalError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionClient = await createClient();
    const service = createServiceClient();
    const auth = await requireAdmin(sessionClient, service);
    if (!auth.ok) return auth.response;

    const parsed = await parseBody(request, AdminInviteSchema);
    if (!parsed.ok) return parsed.response;

    if (await findAppUserByEmail(service, parsed.data.email)) {
      return NextResponse.json(
        { error: "Adressen är redan inbjuden." },
        { status: 409 },
      );
    }

    const invited = await createInvite(service, {
      email: parsed.data.email,
      role: "member",
      invitedBy: auth.data.id,
    });
    return NextResponse.json({ id: invited.id }, { status: 201 });
  } catch (err) {
    return internalError(err);
  }
}
