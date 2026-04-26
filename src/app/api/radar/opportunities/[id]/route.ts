import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseBody } from "@/lib/api-helpers";
import { OpportunityStatusPatchSchema } from "@/lib/api-schemas";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const parsed = await parseBody(request, OpportunityStatusPatchSchema);
  if (!parsed.ok) return parsed.response;
  const { status } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("rfp_opportunities")
    .update({ status })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
