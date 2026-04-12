import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const minScore = searchParams.get("min_score");

  const supabase = createServiceClient();

  let query = supabase
    .from("rfp_opportunities")
    .select("id, ted_notice_id, title, buyer, cpv_codes, deadline, estimated_value, summary, ted_url, relevance_score, relevance_reasoning, status, analysis_id, fetched_at, scored_at, created_at")
    .eq("organization_id", DEFAULT_ORG_ID)
    .order("relevance_score", { ascending: false, nullsFirst: false })
    .order("deadline", { ascending: true, nullsFirst: true });

  if (status) {
    query = query.eq("status", status);
  }
  if (minScore) {
    query = query.gte("relevance_score", parseInt(minScore, 10));
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ opportunities: data });
}
