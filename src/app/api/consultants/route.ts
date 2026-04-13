import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

import { DEFAULT_ORG_ID } from "@/lib/constants";

export async function GET(request: NextRequest) {
  const supabase = createServiceClient();
  const { searchParams } = new URL(request.url);
  const level = searchParams.get("level");
  const competency = searchParams.get("competency");

  let query = supabase
    .from("consultants")
    .select(`
      *,
      consultant_competencies (id, competency, category),
      consultant_references (id, title, description, year, sector)
    `)
    .eq("organization_id", DEFAULT_ORG_ID)
    .order("name");

  if (level) {
    query = query.eq("level", level);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Filter by competency if provided (post-query since it's a nested relation)
  let consultants = data;
  if (competency) {
    consultants = data.filter((c: Record<string, unknown>) =>
      (c.consultant_competencies as Array<{ competency: string }>).some(
        (cc) => cc.competency.toLowerCase().includes(competency.toLowerCase())
      )
    );
  }

  return NextResponse.json(consultants);
}
