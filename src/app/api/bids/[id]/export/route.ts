import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { parseUuidParam } from "@/lib/api-helpers";
import { getUserId } from "@/lib/org";
import { renderTemplate } from "@/lib/pptx-template/loader";
import { renderFromProfile } from "@/lib/pptx-template/render-from-profile";
import { loadTemplateForBid } from "@/lib/pptx-template/active-template";
import { loadTemplateProfile } from "@/lib/pptx-template/profile-store";
import { isAllGenericProfile } from "@/lib/pptx-template/template-profile";
import { loadProfileForBid } from "@/lib/org-profile";
import { BidSection, RfpAnalysis } from "@/lib/types";
import { buildMasterContext } from "./build-master-context";

interface RouteContext {
  params: Promise<{ id: string }>;
}

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

  // A 'draft' with failed bundles is a partial bid: the sections those bundles
  // would have filled are missing, so their slides export with raw {placeholder}
  // tokens visible. Refuse rather than hand out a broken deck.
  const failedBundles = (bid.failed_bundles as unknown[] | null) ?? [];
  if (failedBundles.length > 0) {
    return NextResponse.json(
      { error: "Bid has failed sections. Re-run generation before exporting." },
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
  // a rendering bug must surface as a clean 500, not an unhandled crash, and
  // must not mark the bid as exported.
  let buffer: Buffer;
  try {
    // A stored all-generic profile means a FOREIGN template: its manifest is
    // near-empty, so render from the SAME stored profile that drove generation
    // (mirrors the generation-side routing in run-bid-generation.ts), regardless
    // of BIDSMITH_PROFILE_RENDER (that flag gates only OUR template's parity
    // path). Our template (no stored profile / mixed capabilities) → renderTemplate.
    const storedProfile = await loadTemplateProfile(template.id);
    buffer =
      storedProfile && isAllGenericProfile(storedProfile)
        ? await renderFromProfile(template, storedProfile, sections, master)
        : await renderTemplate(template, sections, master);
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
