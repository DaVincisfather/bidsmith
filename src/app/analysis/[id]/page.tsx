import { createServiceClient } from "@/lib/supabase";
import { AnalysisResult } from "@/components/analysis-result";
import { RfpAnalysis } from "@/lib/types";
import Link from "next/link";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AnalysisPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("analyses")
    .select(
      `
      id,
      analysis,
      created_at,
      documents (
        file_name,
        file_url
      )
    `
    )
    .eq("id", id)
    .single();

  if (error || !data) {
    notFound();
  }

  const document = data.documents as unknown as {
    file_name: string;
    file_url: string;
  };

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
      </div>
    </main>
  );
}
