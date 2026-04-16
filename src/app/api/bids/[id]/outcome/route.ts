import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { OutcomePatch } from "@/lib/types";

const VALID_OUTCOMES = ["won", "lost", "no-bid", "cancelled"] as const;
const VALID_REASONS = ["pris", "erfarenhet", "team", "kvalitet", "relation", "annat"] as const;

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  let body: Partial<OutcomePatch>;
  try {
    body = (await request.json()) as Partial<OutcomePatch>;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON in request body" },
      { status: 400 }
    );
  }

  if (!body.outcome || !VALID_OUTCOMES.includes(body.outcome)) {
    return NextResponse.json(
      { error: `outcome must be one of: ${VALID_OUTCOMES.join(", ")}` },
      { status: 400 }
    );
  }

  if (body.lossReason && !VALID_REASONS.includes(body.lossReason)) {
    return NextResponse.json(
      { error: `lossReason must be one of: ${VALID_REASONS.join(", ")}` },
      { status: 400 }
    );
  }

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
