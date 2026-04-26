import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseBody } from "@/lib/api-helpers";
import { OutcomePatchSchema } from "@/lib/api-schemas";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const parsed = await parseBody(request, OutcomePatchSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const supabase = await createClient();

  const { data: updated, error } = await supabase
    .from("bids")
    .update({
      outcome: body.outcome,
      competitor_name: body.competitorName ?? null,
      loss_reason: body.lossReason ?? null,
      loss_comment: body.lossComment ?? null,
      outcome_logged_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: "Bid not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
