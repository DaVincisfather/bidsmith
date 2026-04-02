import { createServiceClient } from "@/lib/supabase";
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
  const supabase = createServiceClient();

  // Fetch analysis
  const { data, error } = await supabase
    .from("analyses")
    .select(`
      id,
      analysis,
      created_at,
      documents (
        file_name,
        file_url
      )
    `)
    .eq("id", id)
    .single();

  if (error || !data) {
    notFound();
  }

  const document = data.documents as unknown as {
    file_name: string;
    file_url: string;
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
    <main className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-4 py-16">
        <Link
          href="/"
          className="text-sm text-gray-400 hover:text-gray-600 mb-8 inline-block"
        >
          &larr; Ny analys
        </Link>
        <AnalysisResult
          analysis={data.analysis as RfpAnalysis}
          fileName={document.file_name}
        />
        <AnalysisMatchSection
          analysisId={id}
          latestMatch={latestMatch}
        />
      </div>
    </main>
  );
}
