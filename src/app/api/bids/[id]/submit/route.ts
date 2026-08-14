import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { parseUuidParam, requireUser } from "@/lib/api-helpers";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Explicit submission marker — split out of the export routes (Stefan's
// decision 2026-08-14). Exporting downloads a file; submitting is a claim
// about the world (the bid went to the customer): it freezes the flow
// (one analysis = one bid, exported is frozen — #103) and feeds outcome
// tracking. Reuses the exported/exported_at columns, so every downstream
// consumer (pipeline, stats, freeze guards, analyses list) is untouched.
//
// POST only: the flip freezes the bid, so it must never ride on a method
// prefetchers treat as safe (#105 reasoning).
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const { id: rawId } = await params;
  const idResult = parseUuidParam(rawId, "bid id");
  if (!idResult.ok) return idResult.response;
  const id = idResult.data;

  // Route-level auth: mutating route writing with the service role (RLS
  // bypass) — never rely on middleware alone (#103 rule).
  const authed = await createClient();
  const auth = await requireUser(authed);
  if (!auth.ok) return auth.response;

  const supabase = createServiceClient();

  const { data: bid, error: bidError } = await supabase
    .from("bids")
    .select("status, failed_bundles, exported_at")
    .eq("id", id)
    .single();

  if (bidError || !bid) {
    return NextResponse.json({ error: "Anbudet hittades inte." }, { status: 404 });
  }

  if (bid.status === "exported" || bid.exported_at) {
    return NextResponse.json(
      { error: "Anbudet är redan markerat som inlämnat." },
      { status: 409 },
    );
  }

  if (bid.status === "generating") {
    return NextResponse.json(
      { error: "Anbudet genereras fortfarande — vänta tills utkastet är klart." },
      { status: 409 },
    );
  }

  if (bid.status === "failed") {
    return NextResponse.json(
      { error: "Genereringen misslyckades — generera om innan anbudet markeras som inlämnat." },
      { status: 409 },
    );
  }

  // Same partial-bid refusal as the export routes: a bid with missing bundle
  // sections is incomplete — marking it submitted would log a broken document
  // as the outcome-tracked deliverable.
  const failedBundles = (bid.failed_bundles as unknown[] | null) ?? [];
  if (failedBundles.length > 0) {
    return NextResponse.json(
      { error: "Anbudet är ofullständigt (sektioner saknas) — generera om innan det markeras som inlämnat." },
      { status: 409 },
    );
  }

  // CAS on status='draft': two tabs racing each other cannot double-submit —
  // the loser matches zero rows and gets an honest 409 instead of a silent
  // second flip with a later timestamp.
  const { data: updated, error: updateError } = await supabase
    .from("bids")
    .update({ status: "exported", exported_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "draft")
    .select("id, status, exported_at")
    .single();

  if (updateError || !updated) {
    return NextResponse.json(
      { error: "Anbudet ändrades samtidigt — ladda om sidan och försök igen." },
      { status: 409 },
    );
  }

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    exportedAt: updated.exported_at,
  });
}
