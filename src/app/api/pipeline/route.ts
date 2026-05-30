import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { daysUntil, calculateUrgency, sortPipelineItems } from "@/lib/pipeline";
import type { PipelineItem, RfpAnalysis } from "@/lib/types";

const MIN_SCORE = 65;

export async function GET() {
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  // Fetch TED opportunities, analyses, and exported bids in parallel
  const [
    { data: opportunities, error: oppErr },
    { data: analyses, error: anErr },
    { data: exportedBids, error: bidsErr },
  ] = await Promise.all([
    supabase
      .from("rfp_opportunities")
      .select("id, title, deadline, relevance_score, analysis_id, ted_url, status")
      .gte("relevance_score", MIN_SCORE)
      .gte("deadline", today)
      .neq("status", "dismissed"),
    supabase
      .from("analyses")
      .select("id, document_id, analysis, created_at, documents!inner(file_name)")
      .order("created_at", { ascending: false }),
    supabase
      .from("bids")
      .select("analysis_id")
      .not("exported_at", "is", null),
  ]);

  if (oppErr) {
    return NextResponse.json({ error: oppErr.message }, { status: 500 });
  }
  if (anErr) {
    return NextResponse.json({ error: anErr.message }, { status: 500 });
  }
  if (bidsErr) {
    return NextResponse.json({ error: bidsErr.message }, { status: 500 });
  }

  const submittedAnalysisIds = new Set(
    (exportedBids ?? []).map((b) => b.analysis_id as string)
  );

  const tedAnalysisIds = new Set(
    (opportunities ?? [])
      .map((o) => o.analysis_id as string | null)
      .filter((id): id is string => id !== null)
  );

  const tedItems: PipelineItem[] = (opportunities ?? [])
    .filter((o) => o.deadline !== null)
    .filter((o) => !o.analysis_id || !submittedAnalysisIds.has(o.analysis_id as string))
    .map((o) => {
      const daysLeft = daysUntil(o.deadline as string);
      return {
        id: o.id as string,
        source: "ted" as const,
        title: o.title as string,
        deadline: o.deadline as string,
        daysLeft,
        urgency: calculateUrgency(daysLeft),
        relevanceScore: (o.relevance_score as number) ?? null,
        analysisId: (o.analysis_id as string) ?? null,
        tedUrl: (o.ted_url as string) ?? null,
      };
    });

  const uploadItems = (analyses ?? [])
    .filter((a) => !submittedAnalysisIds.has(a.id as string))
    .filter((a) => !tedAnalysisIds.has(a.id as string))
    .map((a) => {
      const analysis = a.analysis as RfpAnalysis;
      const deadline = analysis.deadline;
      if (!deadline) return null;
      const daysLeft = daysUntil(deadline);
      if (daysLeft < 0) return null;
      const title =
        analysis.title ??
        ((a.documents as unknown as { file_name: string })?.file_name ?? "Namnlös RFP");
      const item: PipelineItem = {
        id: a.id as string,
        source: "upload",
        title,
        deadline,
        daysLeft,
        urgency: calculateUrgency(daysLeft),
        relevanceScore: null,
        analysisId: a.id as string,
        tedUrl: null,
      };
      return item;
    })
    .filter((x): x is PipelineItem => x !== null);

  const items = sortPipelineItems([...tedItems, ...uploadItems]);

  return NextResponse.json({ items });
}
