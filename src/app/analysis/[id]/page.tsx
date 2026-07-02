import { createClient } from "@/lib/supabase/server";
import { AnalysisResult } from "@/components/analysis-result";
import { AnalysisMatchSection } from "@/components/analysis-match-section";
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

  // Fetch latest match for this analysis
  const { data: matchRows } = await supabase
    .from("matches")
    .select("id, team_proposal")
    .eq("analysis_id", id)
    .order("created_at", { ascending: false })
    .limit(1);

  const latestMatch =
    matchRows && matchRows.length > 0
      ? {
          id: matchRows[0].id as string,
          scoredConsultants: matchRows[0].team_proposal as Array<{
            consultantId: string;
            consultantName: string;
            level: string;
            score: number;
            reasoning: string;
          }>,
        }
      : null;

  return (
    <main className="min-h-full bg-paper">
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
        />
        {/* #team anchor — the bid editor's "Ändra team" link scrolls here. */}
        <div id="team" className="scroll-mt-6">
          <AnalysisMatchSection
            analysisId={id}
            latestMatch={latestMatch}
          />
        </div>
      </div>
    </main>
  );
}
