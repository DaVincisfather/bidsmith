import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/org";
import { renderTemplate } from "@/lib/pptx-template/loader";
import { bundledTemplate } from "@/lib/pptx-template/registry";
import { BidSection, RfpAnalysis } from "@/lib/types";
import { buildMasterContext } from "./build-master-context";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  // Middleware guarantees authentication; no org scoping in single-workspace model.
  const authed = await createClient();
  await getUserId(authed);
  const supabase = createServiceClient();

  const { data: bid, error: bidError } = await supabase
    .from("bids")
    .select("*")
    .eq("id", id)
    .single();

  if (bidError || !bid) {
    return NextResponse.json({ error: "Bid not found" }, { status: 404 });
  }

  if (bid.status === "generating") {
    return NextResponse.json(
      { error: "Bid is still generating. Wait until status is 'draft'." },
      { status: 409 },
    );
  }

  // Failed bids stay in the DB (they used to be deleted) — exporting one
  // would flip it to 'exported' and count it as submitted in the stats.
  if (bid.status === "failed") {
    return NextResponse.json(
      { error: "Bid generation failed. Re-run generation before exporting." },
      { status: 409 },
    );
  }

  const { data: analysisRow, error: analysisError } = await supabase
    .from("analyses")
    .select("analysis")
    .eq("id", bid.analysis_id)
    .single();

  if (analysisError || !analysisRow) {
    return NextResponse.json(
      { error: "Analysis not found for bid" },
      { status: 404 },
    );
  }

  const sections = bid.sections as BidSection[];
  const master = buildMasterContext({
    analysis: analysisRow.analysis as RfpAnalysis,
    now: new Date(),
  });

  // PPTX rendering touches template files + section data of varying shape —
  // a rendering bug must surface as a clean 500, not an unhandled crash, and
  // must not mark the bid as exported.
  let buffer: Buffer;
  try {
    buffer = await renderTemplate(bundledTemplate(), sections, master);
  } catch (err) {
    console.error(`PPTX render failed for bid ${id}:`, err);
    return NextResponse.json(
      { error: "PPTX rendering failed. Check section contents and try again." },
      { status: 500 },
    );
  }

  await supabase
    .from("bids")
    .update({ status: "exported", exported_at: new Date().toISOString() })
    .eq("id", id);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="anbud-${id.substring(0, 8)}.pptx"`,
    },
  });
}
