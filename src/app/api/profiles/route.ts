import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseBody, requireUser } from "@/lib/api-helpers";
import { ProfileBodySchema } from "@/lib/api-schemas";

export async function GET() {
  const supabase = await createClient();
  const auth = await requireUser(supabase);
  if (!auth.ok) return auth.response;

  const { data, error } = await supabase
    .from("org_profiles")
    .select("id, company_name, logo_path, colors, tonality, boilerplate, created_at")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profiles: data });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const auth = await requireUser(supabase);
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(request, ProfileBodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  // camelCase → snake_case. Skapar inte logo_path (utanför scope).
  const { data, error } = await supabase
    .from("org_profiles")
    .insert({
      company_name: body.companyName,
      tonality: body.tonality ?? null,
      boilerplate: body.boilerplate ?? null,
      colors: body.colors ?? null,
    })
    .select("id, company_name, logo_path, colors, tonality, boilerplate, created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Aktiverar inte automatiskt — aktivering är ett separat, explicit anrop
  // (POST /api/profiles/[id]/activate).
  return NextResponse.json(data, { status: 201 });
}
