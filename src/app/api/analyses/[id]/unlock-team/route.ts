import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { parseUuidParam, internalError } from "@/lib/api-helpers";
import { isActivelyGenerating } from "@/lib/bid-status";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Hard reset of the team lock (spec 2026-08-04): deletes the analysis'
 * go/no-go assessments AND its draft bid so the step chain greys out again.
 * Refuses when the bid is exported (outcome stats track it) or generating.
 * The client shows a confirm dialog before calling — paid AI content is lost.
 */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id: rawId } = await params;
    const idResult = parseUuidParam(rawId, "analysis id");
    if (!idResult.ok) return idResult.response;
    const analysisId = idResult.data;

    const supabase = createServiceClient();

    const { data: bids, error: bidsError } = await supabase
      .from("bids")
      .select("id, status, exported_at, created_at")
      .eq("analysis_id", analysisId);
    if (bidsError) {
      return NextResponse.json({ error: bidsError.message }, { status: 500 });
    }

    const rows = (bids ?? []) as { id: string; status: string; exported_at: string | null; created_at: string | null }[];
    if (rows.some((b) => b.exported_at || b.status === "exported")) {
      return NextResponse.json(
        { error: "Anbudet är inlämnat — teamet kan inte låsas upp." },
        { status: 409 },
      );
    }
    if (rows.some((b) => isActivelyGenerating(b))) {
      return NextResponse.json(
        { error: "Generering pågår — vänta tills den är klar." },
        { status: 409 },
      );
    }

    // Deletion order is FK-mandated: bids.assessment_id references
    // go_no_go_assessments(id) (no cascade), so bids must go first.
    // Partial failure (bids deleted, assessments not) leaves the flow locked
    // but is healed by retrying this endpoint: with no bids left, the guards
    // pass and the assessments delete runs alone.
    const { error: delBidsError } = await supabase
      .from("bids")
      .delete()
      .eq("analysis_id", analysisId)
      // Never destroy a submitted bid: an export can land between the guard
      // read above and this delete (two tabs doing opposite things). A
      // surviving exported row makes a retry 409 with the frozen copy —
      // coherent recovery, no data loss.
      .is("exported_at", null)
      .neq("status", "exported");
    if (delBidsError) {
      return NextResponse.json({ error: delBidsError.message }, { status: 500 });
    }

    const { error: delAssessError } = await supabase
      .from("go_no_go_assessments")
      .delete()
      .eq("analysis_id", analysisId);
    if (delAssessError) {
      return NextResponse.json(
        { error: `Upplåsningen slutfördes inte — försök igen. (${delAssessError.message})` },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return internalError(err);
  }
}
