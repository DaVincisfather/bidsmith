import { createClient } from "@/lib/supabase/server";
import { BidEditor } from "@/components/bid-editor/BidEditor";
import { BidSection, RfpAnalysis } from "@/lib/types";
import type { FailedUnit } from "@/lib/bundle-labels";
import { notFound } from "next/navigation";
import { loadFlowState } from "@/lib/flow-state";
import { loadProfileForBid } from "@/lib/org-profile";

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

  const analysisId = (bid.analysis_id as string | null) ?? null;
  const flow = analysisId ? await loadFlowState(analysisId) : null;

  // Topbarens metadata (spec 2026-08-14): dnr + deadline ur analysen,
  // avsändare ur anbudets PINNADE profil (samma källa som PPTX-exporten —
  // omslag och topbar får inte visa olika bolag). null döljer fältet.
  let analysis: RfpAnalysis | null = null;
  if (analysisId) {
    const { data: analysisRow } = await supabase
      .from("analyses")
      .select("analysis")
      .eq("id", analysisId)
      .single();
    analysis = (analysisRow?.analysis as RfpAnalysis | undefined) ?? null;
  }
  const profile = await loadProfileForBid((bid.profile_id as string | null) ?? null);

  const sections = bid.sections as BidSection[];
  const coverContent = sections.find((s) => s.content?.format === "cover")?.content;
  const coverClient = coverContent?.format === "cover" ? coverContent.client : null;
  // || (inte ??): en tom sträng ur AI-extraktionen ska falla vidare till nästa
  // källa i stället för att ge en tom topbar (routine-fynd #120).
  const docName = analysis?.client || analysis?.title || coverClient || "Anbud";

  // FlowNav ersätts av EditorTopbar på denna sida (editor-omdesignen); den
  // lever kvar på analys-/go-no-go-sidorna.
  // 61px = the global nav's measured height (the old 57px calc overflowed the
  // page by 4px — and by a full 61px before the flex refactor).
  return (
    <div className="flex h-[calc(100vh-61px)] flex-col">
      <BidEditor
        bidId={bid.id}
        analysisId={analysisId}
        initialSections={sections}
        initialStatus={bid.status}
        initialFailedBundles={(bid.failed_bundles as FailedUnit[]) ?? []}
        initialGenerationError={(bid.generation_error as string | null) ?? null}
        gonogoEnabled={flow !== null && flow.assessment !== null}
        diaryNumber={analysis?.diaryNumber ?? null}
        deadline={analysis?.deadline ? analysis.deadline.slice(0, 10) : null}
        senderName={profile?.companyName ?? null}
        docName={docName}
      />
    </div>
  );
}
