import { createClient } from "@/lib/supabase/server";
import { ConsultantProfile } from "@/components/consultant-profile";
import Link from "next/link";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ConsultantPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("consultants")
    .select(`
      *,
      consultant_competencies (id, competency, category),
      consultant_references (id, title, description, year, sector)
    `)
    .eq("id", id)
    .single();

  if (error || !data) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <Link
          href="/consultants"
          className="text-sm text-gray-400 hover:text-gray-600 mb-8 inline-block"
        >
          &larr; Alla konsulter
        </Link>
        <ConsultantProfile consultant={data} />
      </div>
    </main>
  );
}
