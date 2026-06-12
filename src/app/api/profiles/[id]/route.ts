import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseBody, parseUuidParam, requireUser } from "@/lib/api-helpers";
import { ProfileBodySchema } from "@/lib/api-schemas";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const supabase = await createClient();
  const auth = await requireUser(supabase);
  if (!auth.ok) return auth.response;

  const { id: rawId } = await params;
  const idResult = parseUuidParam(rawId, "profile id");
  if (!idResult.ok) return idResult.response;
  const id = idResult.data;

  const parsed = await parseBody(request, ProfileBodySchema.partial());
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  // Mappa enbart de fält som faktiskt skickades (partiell uppdatering) —
  // annars skulle utelämnade fält nollställas. logo_path lämnas orört.
  const update: Record<string, unknown> = {};
  if (body.companyName !== undefined) update.company_name = body.companyName;
  if (body.tonality !== undefined) update.tonality = body.tonality;
  if (body.boilerplate !== undefined) update.boilerplate = body.boilerplate;
  if (body.colors !== undefined) update.colors = body.colors;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("org_profiles")
    .update(update)
    .eq("id", id)
    .select("id, company_name, logo_path, colors, tonality, boilerplate, created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Postgres update av en icke-existerande rad är inget fel — den matchar noll
  // rader. Utan denna kontroll returnerar PATCH på okänt id 200 med tom body.
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  return NextResponse.json(data[0]);
}
