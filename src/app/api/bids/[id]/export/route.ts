import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { parseUuidParam, requireUser } from "@/lib/api-helpers";
import { exportReadinessGuard } from "@/lib/bid-export-guards";
import { renderTemplate } from "@/lib/pptx-template/loader";
import { renderFromProfile } from "@/lib/pptx-template/render-from-profile";
import { loadTemplateForBid } from "@/lib/pptx-template/active-template";
import { loadTemplateProfile } from "@/lib/pptx-template/profile-store";
import { isForeignProfile } from "@/lib/pptx-template/template-profile";
import { loadProfileForBid } from "@/lib/org-profile";
import { BidSection, RfpAnalysis } from "@/lib/types";
import { buildMasterContext } from "./build-master-context";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Pure download since the submission split (2026-08-14) — the exported/
// exported_at flip lives on POST /api/bids/[id]/submit. Stays POST for parity
// with the Markdown route, which is the reachable export path.
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

  const { data: bidRow, error: bidError } = await supabase
    .from("bids")
    .select("*")
    .eq("id", id)
    .single();

  const guard = exportReadinessGuard(bidRow, bidError);
  if (!guard.ok) return guard.response;
  const bid = guard.bid;

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
  // Företagsnamn ur den profil anbudet GENERERADES med (pinnad via bids.profile_id),
  // inte den nu-aktiva — annars kan omslag/sidfot visa ett annat bolag än brödtexten.
  // null (legacy-bid / ingen profil) → blankt, oförändrat exportbeteende.
  const profile = await loadProfileForBid((bid.profile_id as string | null) ?? null);
  const master = buildMasterContext({
    analysis: analysisRow.analysis as RfpAnalysis,
    now: new Date(),
    companyName: profile?.companyName,
  });

  // Render against the template the bid was generated with (same budgets);
  // legacy bids (template_id null) fall back to bundled anbudsmall-v2 v1.
  const template = await loadTemplateForBid((bid.template_id as string | null) ?? null);

  // PPTX rendering touches template files + section data of varying shape —
  // a rendering bug must surface as a clean 500, not an unhandled crash.
  let buffer: Buffer;
  try {
    // A FOREIGN template's manifest is near-empty, so render from the SAME
    // stored profile that drove generation (mirrors the generation-side
    // routing in run-bid-generation.ts), regardless of BIDSMITH_PROFILE_RENDER
    // (that flag gates only OUR template's parity path). Our template (no
    // stored profile / mixed capabilities) → renderTemplate.
    const storedProfile = await loadTemplateProfile(template.id);
    buffer =
      storedProfile && isForeignProfile(storedProfile)
        ? await renderFromProfile(template, storedProfile, sections, master)
        : await renderTemplate(template, sections, master);
  } catch (err) {
    console.error(`PPTX render failed for bid ${id}:`, err);
    return NextResponse.json(
      { error: "PPTX rendering failed. Check section contents and try again." },
      { status: 500 },
    );
  }

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="anbud-${id.substring(0, 8)}.pptx"`,
    },
  });
}
