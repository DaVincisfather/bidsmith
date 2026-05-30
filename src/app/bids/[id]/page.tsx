import { createClient } from "@/lib/supabase/server";
import { BidEditor } from "@/components/bid-editor/BidEditor";
import { BidSection, StyleGuide } from "@/lib/types";
import type { StructureEvalSummary } from "@/lib/eval/bid-structure";
import { loadBudgets } from "@/lib/pptx-template/budget-loader";
import type { OverflowFlag } from "@/lib/pptx-template/budget-types";
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

  // Fetch the workspace style guide (single-row table). Falls back to the
  // built-in default until a workspace uploads its own template/styling.
  const { data: workspace } = await supabase
    .from("workspace_settings")
    .select("style_guide")
    .limit(1)
    .maybeSingle();

  const styleGuide: StyleGuide =
    (workspace?.style_guide as StyleGuide) ?? DEFAULT_STYLE_GUIDE;

  // Hardcoded template for now — picker comes in a separate PR.
  const budgets = await loadBudgets("anbudsmall-v2");

  return (
    <BidEditor
      bidId={bid.id}
      initialSections={bid.sections as BidSection[]}
      initialStatus={bid.status}
      initialStructureEval={(bid.structure_eval as StructureEvalSummary | null) ?? null}
      styleGuide={styleGuide}
      budgets={budgets}
      initialOverflowFlags={(bid.overflow_flags as OverflowFlag[]) ?? []}
    />
  );
}
