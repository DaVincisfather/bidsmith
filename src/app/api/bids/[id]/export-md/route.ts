import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { parseUuidParam, requireUser } from "@/lib/api-helpers";
import { exportReadinessGuard } from "@/lib/bid-export-guards";
import { bidToMarkdown } from "@/lib/bid-markdown";
import { BidSection } from "@/lib/types";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Template-free Markdown export — the primary export path since the MD-first
// decision (2026-08-03). PURE DOWNLOAD since the submission split (2026-08-14):
// exporting the file no longer marks the bid as submitted — that claim is an
// explicit user action on POST /api/bids/[id]/submit, which owns the
// exported/exported_at flip and the freeze.
//
// Still POST although nothing mutates: the client already POSTs, and re-opening
// a GET surface would re-litigate the prefetch/CSRF reasoning from #105 for
// zero user value.
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const { id: rawId } = await params;
  const idResult = parseUuidParam(rawId, "bid id");
  if (!idResult.ok) return idResult.response;
  const id = idResult.data;
  // Route-level auth: an unauthenticated API hit must be a JSON 401, not an
  // unhandled NotAuthenticatedError → 500 (routine follow-up #116). Middleware
  // alone is not enough — it fails open when the anon key is missing.
  const authed = await createClient();
  const auth = await requireUser(authed);
  if (!auth.ok) return auth.response;
  const supabase = createServiceClient();

  const { data: bid, error: bidError } = await supabase
    .from("bids")
    .select("sections, status, failed_bundles")
    .eq("id", id)
    .single();

  const guard = exportReadinessGuard(bid, bidError);
  if (!guard.ok) return guard.response;

  const markdown = bidToMarkdown(guard.bid.sections as BidSection[]);

  return new NextResponse(markdown, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="anbud-${id.substring(0, 8)}.md"`,
    },
  });
}
