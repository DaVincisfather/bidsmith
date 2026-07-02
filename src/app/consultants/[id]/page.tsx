import { createClient } from "@/lib/supabase/server";
import { ConsultantProfile } from "@/components/consultant-profile";
import { CONSULTANT_API_SELECT } from "@/lib/constants";
import Link from "next/link";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ConsultantPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  // PII: rå CV-text (raw_cv_text) får inte serialiseras till klientkomponenten
  // ConsultantProfile — använd den explicita API-selecten utan den kolumnen.
  const { data, error } = await supabase
    .from("consultants")
    .select(CONSULTANT_API_SELECT)
    .eq("id", id)
    .single();

  if (error || !data) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-paper">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <Link
          href="/consultants"
          className="text-sm text-ink-mute hover:text-ink-soft mb-8 inline-block"
        >
          &larr; Alla konsulter
        </Link>
        <ConsultantProfile consultant={data} />
      </div>
    </main>
  );
}
