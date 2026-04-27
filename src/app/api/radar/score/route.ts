import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { scoreOpportunity } from "@/lib/opportunity-scorer";

import { DEFAULT_ORG_ID } from "@/lib/constants";
const BATCH_SIZE = 20;

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();

    // 1. Get unscored opportunities
    const { data: opportunities, error: oppError } = await supabase
      .from("rfp_opportunities")
      .select("id, title, summary")
      .eq("organization_id", DEFAULT_ORG_ID)
      .eq("status", "new")
      .limit(BATCH_SIZE);

    if (oppError) {
      return NextResponse.json({ error: oppError.message }, { status: 500 });
    }

    if (!opportunities || opportunities.length === 0) {
      return NextResponse.json({ message: "No opportunities to score", scored: 0 });
    }

    // 2. Get org competencies
    const { data: competencies, error: compError } = await supabase
      .from("organization_competencies")
      .select("name, description, keywords")
      .eq("organization_id", DEFAULT_ORG_ID);

    if (compError || !competencies || competencies.length === 0) {
      return NextResponse.json({ error: "No competencies found" }, { status: 500 });
    }

    // 3. Score each opportunity sequentially (respect rate limits)
    let scored = 0;
    for (const opp of opportunities) {
      try {
        const result = await scoreOpportunity(
          { title: opp.title, summary: opp.summary },
          competencies,
          DEFAULT_ORG_ID
        );

        await supabase
          .from("rfp_opportunities")
          .update({
            relevance_score: result.relevanceScore,
            relevance_reasoning: result.reasoning,
            status: "scored",
            scored_at: new Date().toISOString(),
          })
          .eq("id", opp.id);

        scored++;
      } catch (error) {
        console.error(`Failed to score opportunity ${opp.id}:`, error);
      }
    }

    return NextResponse.json({ message: "Scoring complete", scored, total: opportunities.length });
  } catch (error) {
    console.error("Radar scoring failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
