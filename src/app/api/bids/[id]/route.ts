import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseBody, parseUuidParam, requireUser } from "@/lib/api-helpers";
import { BidPatchSchema } from "@/lib/api-schemas";
import { isActivelyGenerating } from "@/lib/bid-status";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { id: rawId } = await params;
  const idResult = parseUuidParam(rawId, "bid id");
  if (!idResult.ok) return idResult.response;
  const id = idResult.data;
  const supabase = await createClient();
  // Route-nivå-auth (#103-svepet, audit 2026-08-17) — GET:en bär dessutom
  // watchdogens UPDATE, så den är i praktiken muterande.
  const auth = await requireUser(supabase);
  if (!auth.ok) return auth.response;

  let { data } = await supabase
    .from("bids")
    .select("*")
    .eq("id", id)
    .single();

  if (!data) {
    return NextResponse.json(
      { error: "Anbudet hittades inte." },
      { status: 404 }
    );
  }

  if (data.status === "generating" && !isActivelyGenerating({ status: data.status, created_at: (data.created_at as string | null) ?? null })) {
    // bids.created_at is NOT NULL (setup.sql) — the missing-created_at fail-safe branch in isActivelyGenerating is unreachable here; a future nullable created_at would resurrect infinite-poll for corrupt rows.
    // Watchdog: without this, a bid whose generator died (maxDuration
    // exceeded, deploy, crash) stays 'generating' and polls forever.
    // Display data only (BidEditor renders it verbatim) — no logic matches
    // on the string, so Swedish is safe.
    const { data: failed } = await supabase
      .from("bids")
      .update({ status: "failed", generation_error: "Genereringen tog för lång tid och avbröts." })
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
  const supabase = await createClient();
  // Route-nivå-auth (#103-svepet, audit 2026-08-17).
  const auth = await requireUser(supabase);
  if (!auth.ok) return auth.response;
  const parsed = await parseBody(request, BidPatchSchema);
  if (!parsed.ok) return parsed.response;
  const { outcome, sections } = parsed.data;

  const updates: Record<string, unknown> = {};
  if (outcome) updates.outcome = outcome;
  if (sections) updates.sections = sections;

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
    // Raw Supabase error.message stays server-side (routine finding #119) —
    // it leaked verbatim into the editor's autosave banner.
    if (error) console.error(`PATCH /api/bids/${id} failed:`, error);
    return NextResponse.json(
      { error: "Anbudet hittades inte." },
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
