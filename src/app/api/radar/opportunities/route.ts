import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const minScore = searchParams.get("min_score");

  const supabase = await createClient();

  let query = supabase
    .from("rfp_opportunities")
    .select("id, ted_notice_id, title, buyer, cpv_codes, deadline, estimated_value, summary, ted_url, relevance_score, relevance_reasoning, status, analysis_id, fetched_at, scored_at, created_at")
    .order("relevance_score", { ascending: false, nullsFirst: false })
    .order("deadline", { ascending: true, nullsFirst: true });

  if (status) {
    query = query.eq("status", status);
  } else {
    query = query.neq("status", "new");
  }
  if (minScore) {
    const parsed = Number.parseInt(minScore, 10);
    // NaN would reach Postgres and come back as a leaked DB error.
    if (Number.isNaN(parsed)) {
      return NextResponse.json(
        { error: "Invalid min_score: expected a number" },
        { status: 400 },
      );
    }
    query = query.gte("relevance_score", parsed);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ opportunities: data });
}
