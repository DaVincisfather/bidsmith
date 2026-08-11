import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { parseUuidParam } from "@/lib/api-helpers";
import { getUserId } from "@/lib/org";
import { bidToMarkdown } from "@/lib/bid-markdown";
import { BidSection } from "@/lib/types";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Template-free Markdown export — the primary export path since the MD-first
// decision (2026-08-03). Flips status to 'exported': this IS the formal
// deliverable that feeds outcome tracking (INLÄMNADE / utfallsloggen).
//
// POST, not GET, precisely BECAUSE of that flip. Since #103 an exported bid is
// frozen (one analysis = one bid), so a browser prefetch, a link-preview unfurl
// or a security scanner following the URL would freeze a user's draft and count
// it as submitted. A state change may not ride on a safe method.
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const { id: rawId } = await params;
  const idResult = parseUuidParam(rawId, "bid id");
  if (!idResult.ok) return idResult.response;
  const id = idResult.data;
  // Middleware guarantees authentication; no org scoping in single-workspace model.
  const authed = await createClient();
  await getUserId(authed);
  const supabase = createServiceClient();

  const { data: bid, error: bidError } = await supabase
    .from("bids")
    .select("sections, status, failed_bundles, exported_at")
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

  if (bid.status === "failed") {
    return NextResponse.json(
      { error: "Bid generation failed. Re-run generation before exporting." },
      { status: 409 },
    );
  }

  // Same partial-bid refusal as the PPTX route: missing bundle sections would
  // silently export an incomplete document.
  const failedBundles = (bid.failed_bundles as unknown[] | null) ?? [];
  if (failedBundles.length > 0) {
    return NextResponse.json(
      { error: "Bid has failed sections. Re-run generation before exporting." },
      { status: 409 },
    );
  }

  const markdown = bidToMarkdown(bid.sections as BidSection[]);

  // The flip IS the point of this route (it feeds outcome tracking) — a silent
  // failure here would hand out the file while the bid never shows as submitted.
  // exported_at is preserved on re-export: stats bucket by first submission.
  const { error: updateError } = await supabase
    .from("bids")
    .update({
      status: "exported",
      exported_at: (bid.exported_at as string | null) ?? new Date().toISOString(),
    })
    .eq("id", id);
  if (updateError) {
    console.error(`Failed to mark bid ${id} as exported:`, updateError);
    return NextResponse.json(
      { error: "Export could not be recorded. Try again." },
      { status: 500 },
    );
  }

  return new NextResponse(markdown, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="anbud-${id.substring(0, 8)}.md"`,
    },
  });
}
