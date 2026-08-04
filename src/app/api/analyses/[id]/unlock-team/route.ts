import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { parseUuidParam, internalError } from "@/lib/api-helpers";

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
      .select("id, status, exported_at")
      .eq("analysis_id", analysisId);
    if (bidsError) {
      return NextResponse.json({ error: bidsError.message }, { status: 500 });
    }

    const rows = (bids ?? []) as { id: string; status: string; exported_at: string | null }[];
    if (rows.some((b) => b.exported_at || b.status === "exported")) {
      return NextResponse.json(
        { error: "Anbudet är inlämnat — teamet kan inte låsas upp." },
        { status: 409 },
      );
    }
    if (rows.some((b) => b.status === "generating")) {
      return NextResponse.json(
        { error: "Generering pågår — vänta tills den är klar." },
        { status: 409 },
      );
    }

    const { error: delBidsError } = await supabase
      .from("bids")
      .delete()
      .eq("analysis_id", analysisId);
    if (delBidsError) {
      return NextResponse.json({ error: delBidsError.message }, { status: 500 });
    }

    const { error: delAssessError } = await supabase
      .from("go_no_go_assessments")
      .delete()
      .eq("analysis_id", analysisId);
    if (delAssessError) {
      return NextResponse.json({ error: delAssessError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return internalError(err);
  }
}
