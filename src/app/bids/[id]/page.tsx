import { createClient } from "@/lib/supabase/server";
import { BidEditor } from "@/components/bid-editor/BidEditor";
import { BidSection, StyleGuide } from "@/lib/types";
import { notFound } from "next/navigation";

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

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BidEditorPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: bid, error } = await supabase
    .from("bids")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !bid) {
    notFound();
  }

  // Fetch organization style guide
  const { data: org } = await supabase
    .from("organizations")
    .select("style_guide")
    .eq("id", bid.organization_id)
    .single();

  const styleGuide: StyleGuide = (org?.style_guide as StyleGuide) ?? DEFAULT_STYLE_GUIDE;

  return (
    <BidEditor
      bidId={bid.id}
      initialSections={bid.sections as BidSection[]}
      initialStatus={bid.status}
      styleGuide={styleGuide}
    />
  );
}
