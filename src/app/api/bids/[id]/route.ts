import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseBody, parseUuidParam } from "@/lib/api-helpers";
import { BidPatchSchema } from "@/lib/api-schemas";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/bids' maxDuration is 300 s — past that the platform has killed
// the background job without reaching its failure handler. 7 min = the kill
// point plus buffer, so a dead generation doesn't poll for long.
const STALE_GENERATING_MS = 7 * 60 * 1000;

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { id: rawId } = await params;
  const idResult = parseUuidParam(rawId, "bid id");
  if (!idResult.ok) return idResult.response;
  const id = idResult.data;
  const supabase = await createClient();

  let { data } = await supabase
    .from("bids")
    .select("*")
    .eq("id", id)
    .single();

  if (!data) {
    return NextResponse.json(
      { error: "Bid not found" },
      { status: 404 }
    );
  }

  if (
    data.status === "generating" &&
    Date.now() - new Date(data.created_at).getTime() > STALE_GENERATING_MS
  ) {
    // Watchdog: without this, a bid whose generator died (maxDuration
    // exceeded, deploy, crash) stays 'generating' and polls forever.
    const { data: failed } = await supabase
      .from("bids")
      .update({ status: "failed", generation_error: "Generation timed out" })
      .eq("id", id)
      .eq("status", "generating")
      .select()
      .single();
    if (failed) data = failed;
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
    failedBundles: data.failed_bundles ?? [],
    generationError: data.generation_error ?? null,
  });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id: rawId } = await params;
  const idResult = parseUuidParam(rawId, "bid id");
  if (!idResult.ok) return idResult.response;
  const id = idResult.data;
  const parsed = await parseBody(request, BidPatchSchema);
  if (!parsed.ok) return parsed.response;
  const { outcome, sections } = parsed.data;

  const updates: Record<string, unknown> = {};
  if (outcome) updates.outcome = outcome;
  if (sections) updates.sections = sections;

  const supabase = await createClient();

  // Server-side edit lock: while status='generating' the generation runner's
  // final write owns the sections array — a stale client PATCH (second tab,
  // late debounce) would silently truncate it. The editor's UI lock is not
  // enough on its own (routine finding, PR #102).
  let query = supabase.from("bids").update(updates).eq("id", id);
  if (sections) query = query.neq("status", "generating");
  const { data, error } = await query.select().single();

  if (error || !data) {
    if (sections) {
      const { data: current } = await supabase
        .from("bids")
        .select("status")
        .eq("id", id)
        .single();
      if (current?.status === "generating") {
        return NextResponse.json(
          { error: "Anbudet genereras fortfarande — redigering är låst tills utkastet är klart." },
          { status: 409 }
        );
      }
    }
    return NextResponse.json(
      { error: error?.message ?? "Bid not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    id: data.id,
    sections: data.sections,
    outcome: data.outcome,
    status: data.status,
  });
}
