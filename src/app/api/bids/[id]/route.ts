import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("bids")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Bid not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    id: data.id,
    analysisId: data.analysis_id,
    assessmentId: data.assessment_id,
    teamConsultantIds: data.team_consultant_ids,
    sections: data.sections,
    status: data.status,
    outcome: data.outcome,
    exportedAt: data.exported_at,
    createdAt: data.created_at,
  });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const body = await request.json();
  const { outcome } = body as { outcome?: string };

  const supabase = createServiceClient();

  const updates: Record<string, unknown> = {};
  if (outcome) {
    if (!["won", "lost", "no-bid"].includes(outcome)) {
      return NextResponse.json(
        { error: "outcome must be 'won', 'lost', or 'no-bid'" },
        { status: 400 }
      );
    }
    updates.outcome = outcome;
  }

  const { data, error } = await supabase
    .from("bids")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Bid not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ id: data.id, outcome: data.outcome, status: data.status });
}
