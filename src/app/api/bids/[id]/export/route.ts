import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/org";
import { renderTemplate } from "@/lib/pptx-template/loader";
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

  const buffer = await renderTemplate("anbudsmall-v2", sections, master);

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
