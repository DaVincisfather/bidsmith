import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { status } = body;

  if (!status || !["dismissed", "analyzing"].includes(status)) {
    return NextResponse.json(
      { error: "Invalid status. Must be 'dismissed' or 'analyzing'." },
      { status: 400 }
    );
  }

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
