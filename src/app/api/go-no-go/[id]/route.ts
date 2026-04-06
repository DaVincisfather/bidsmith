import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const body = await request.json();
  const { decision } = body as { decision: "go" | "no-go" };

  if (!decision || !["go", "no-go"].includes(decision)) {
    return NextResponse.json(
      { error: "decision must be 'go' or 'no-go'" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("go_no_go_assessments")
    .update({
      decision,
      decision_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || "Assessment not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ id: data.id, decision: data.decision });
}
