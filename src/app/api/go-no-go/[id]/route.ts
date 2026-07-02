import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseBody, parseUuidParam } from "@/lib/api-helpers";
import { GoNoGoDecisionPatchSchema } from "@/lib/api-schemas";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id: rawId } = await params;
  const idResult = parseUuidParam(rawId, "assessment id");
  if (!idResult.ok) return idResult.response;
  const id = idResult.data;
  const parsed = await parseBody(request, GoNoGoDecisionPatchSchema);
  if (!parsed.ok) return parsed.response;
  const { decision } = parsed.data;

  const supabase = await createClient();

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
