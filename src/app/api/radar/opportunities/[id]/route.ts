import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseBody, parseUuidParam } from "@/lib/api-helpers";
import { OpportunityStatusPatchSchema } from "@/lib/api-schemas";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await params;
  const idResult = parseUuidParam(rawId, "opportunity id");
  if (!idResult.ok) return idResult.response;
  const id = idResult.data;
  const parsed = await parseBody(request, OpportunityStatusPatchSchema);
  if (!parsed.ok) return parsed.response;
  const { status } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rfp_opportunities")
    .update({ status })
    .eq("id", id)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // A PATCH on an unknown id matches zero rows and is not a Postgres error —
  // without this it returned 200 { success: true } for a nonexistent opportunity.
  if (!data || data.length === 0) {
    return NextResponse.json(
      { error: "Opportunity not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true });
}
