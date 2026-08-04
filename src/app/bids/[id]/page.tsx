import { createClient } from "@/lib/supabase/server";
import { BidEditor } from "@/components/bid-editor/BidEditor";
import { BidSection, StyleGuide } from "@/lib/types";
import type { FailedUnit } from "@/lib/bundle-labels";
import { notFound } from "next/navigation";
import { FlowNav } from "@/components/flow-nav";
import { loadFlowState } from "@/lib/flow-state";

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

  const analysisId = (bid.analysis_id as string | null) ?? null;
  const flow = analysisId ? await loadFlowState(analysisId) : null;

  return (
    <>
      {analysisId && flow && (
        <FlowNav
          analysisId={analysisId}
          active="bid"
          gonogoEnabled={flow.assessment !== null}
          bidId={bid.id}
          bidFailed={bid.status === "failed"}
        />
      )}
      <BidEditor
        bidId={bid.id}
        analysisId={analysisId}
        initialSections={bid.sections as BidSection[]}
        initialStatus={bid.status}
        styleGuide={styleGuide}
        initialFailedBundles={(bid.failed_bundles as FailedUnit[]) ?? []}
        initialGenerationError={(bid.generation_error as string | null) ?? null}
      />
    </>
  );
}
