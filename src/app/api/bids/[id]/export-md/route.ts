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

// Template-free Markdown export. Same readiness guards as the PPTX route, but
// deliberately does NOT flip status to 'exported': the PPTX is the formal
// deliverable that counts as submitted in stats — Markdown is a lightweight
// working artifact and must not affect outcome tracking.
export async function GET(_request: NextRequest, { params }: RouteContext) {
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
    .select("sections, status, failed_bundles")
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

  return new NextResponse(markdown, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="anbud-${id.substring(0, 8)}.md"`,
    },
  });
}
