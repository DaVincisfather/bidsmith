import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { renderBidToPptx } from "@/lib/pptx-renderer";
import { BidSection, StyleGuide } from "@/lib/types";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

const DEFAULT_STYLE_GUIDE: StyleGuide = {
  colors: {
    primary: "#1F5E63",
    primaryLight: "#2D7A7F",
    secondary: "#8FAF9A",
    secondaryLight: "#B3CABA",
    accent: "#1F5E63",
    dark: "#1A1A1A",
    light: "#E8E6DF",
    muted: "#6B7280",
  },
  font: "Calibri",
  logoUrl: "",
};

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const supabase = createServiceClient();

  // Fetch bid
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
      { status: 409 }
    );
  }

  // Fetch organization style guide
  const { data: org } = await supabase
    .from("organizations")
    .select("style_guide")
    .eq("id", bid.organization_id ?? DEFAULT_ORG_ID)
    .single();

  const styleGuide: StyleGuide = (org?.style_guide as StyleGuide) ?? DEFAULT_STYLE_GUIDE;

  const sections = bid.sections as BidSection[];
  const buffer = await renderBidToPptx(sections, styleGuide);

  // Mark as exported
  await supabase
    .from("bids")
    .update({ status: "exported", exported_at: new Date().toISOString() })
    .eq("id", id);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="anbud-${id.substring(0, 8)}.pptx"`,
    },
  });
}
