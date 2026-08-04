import { createClient } from "@/lib/supabase/server";
import { AnalysisResult } from "@/components/analysis-result";
import { AnalysisMatchSection } from "@/components/analysis-match-section";
import { FlowNav } from "@/components/flow-nav";
import { loadFlowState } from "@/lib/flow-state";
import { RfpAnalysis } from "@/lib/types";
import Link from "next/link";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AnalysisPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  // Fetch analysis. file_path is available on the document row when the
  // user wants the original file — caller should pass it through
  // getDocumentSignedUrl (lib/storage-urls) since the bucket is private
  // after migration 013.
  const { data, error } = await supabase
    .from("analyses")
    .select(`
      id,
      analysis,
      created_at,
      documents (
        file_name,
        file_path
      )
    `)
    .eq("id", id)
    .single();

  if (error || !data) {
    notFound();
  }

  const document = data.documents as unknown as {
    file_name: string;
    file_path: string | null;
  };

  const flow = await loadFlowState(id);

  return (
    <main className="min-h-full bg-paper">
      <FlowNav
        analysisId={id}
        active="analysis"
        gonogoEnabled={flow.assessment !== null}
        bidId={flow.bid?.id ?? null}
        bidFailed={flow.bid?.status === "failed" || (flow.bid?.hasFailures ?? false)}
      />
      <div className="max-w-3xl mx-auto px-6 py-10">
        <Link
          href="/"
          className="text-xs text-ink-mute hover:text-ink-soft mb-8 inline-block"
        >
          &larr; Ny analys
        </Link>
        <AnalysisResult
          analysis={data.analysis as RfpAnalysis}
          fileName={document.file_name}
          analysisId={id}
        />
        {/* #team anchor — the bid editor's "Ändra team" link scrolls here. */}
        <div id="team" className="scroll-mt-6">
          <AnalysisMatchSection
            analysisId={id}
            latestMatch={flow.match}
            locked={flow.assessment !== null}
            lockedTeamIds={flow.assessment?.teamConsultantIds ?? null}
          />
        </div>
      </div>
    </main>
  );
}
