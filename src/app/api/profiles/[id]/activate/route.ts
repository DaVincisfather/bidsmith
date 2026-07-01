import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { requireUser, parseUuidParam } from "@/lib/api-helpers";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteContext) {
  const authed = await createClient();
  const auth = await requireUser(authed);
  if (!auth.ok) return auth.response;

  const { id: rawId } = await params;
  const idResult = parseUuidParam(rawId, "profile id");
  if (!idResult.ok) return idResult.response;
  const id = idResult.data;

  const supabase = createServiceClient();

  // Verifiera att profilen finns innan vi pekar workspace_settings på den.
  const { data: profile } = await supabase
    .from("org_profiles")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  // UPSERT: workspace_settings är en enradstabell vars rad KAN SAKNAS. En blank
  // .update() träffar då noll rader och gör tyst ingenting — läs ut ev.
  // befintlig rad och välj update/insert därefter.
  const { data: existing } = await supabase
    .from("workspace_settings")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("workspace_settings")
      .update({ active_profile_id: id })
      .eq("id", existing.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await supabase
      .from("workspace_settings")
      .insert({ active_profile_id: id });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ activated: id });
}
