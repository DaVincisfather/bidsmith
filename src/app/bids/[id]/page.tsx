import { createClient } from "@/lib/supabase/server";
import { BidEditor } from "@/components/bid-editor/BidEditor";
import { BidSection, StyleGuide } from "@/lib/types";
import type { StructureEvalSummary } from "@/lib/eval/bid-structure";
import { loadTemplateForBid } from "@/lib/pptx-template/active-template";
import type { OverflowFlag } from "@/lib/pptx-template/budget-types";
import type { FailedBundle } from "@/lib/bundle-labels";
import { notFound } from "next/navigation";

const DEFAULT_STYLE_GUIDE: StyleGuide = {
  colors: {
    primary: "#7A2230",
    primaryLight: "#9A3340",
    secondary: "#BE969A",
    secondaryLight: "#E0CFD1",
    accent: "#7A2230",
    dark: "#14120E",
    light: "#F3EFE7",
    muted: "#8A847A",
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

  // Budgets/fieldSlides come from the bid's own template so the editor's
  // overflow hints match what generation/export used; legacy bids fall back
  // to bundled anbudsmall-v2 v1.
  const template = await loadTemplateForBid((bid.template_id as string | null) ?? null);

  return (
    <BidEditor
      bidId={bid.id}
      analysisId={(bid.analysis_id as string | null) ?? null}
      initialSections={bid.sections as BidSection[]}
      initialStatus={bid.status}
      initialStructureEval={(bid.structure_eval as StructureEvalSummary | null) ?? null}
      styleGuide={styleGuide}
      budgets={template.manifest.budgets}
      fieldSlides={template.manifest.fieldSlides}
      initialOverflowFlags={(bid.overflow_flags as OverflowFlag[]) ?? []}
      initialFailedBundles={(bid.failed_bundles as FailedBundle[]) ?? []}
      initialGenerationError={(bid.generation_error as string | null) ?? null}
    />
  );
}
