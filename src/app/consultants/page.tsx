import { createServiceClient } from "@/lib/supabase";
import { ConsultantList } from "@/components/consultant-list";
import { ConsultantUploadWrapper } from "@/components/consultant-upload-wrapper";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

export default async function ConsultantsPage() {
  const supabase = createServiceClient();

  const { data: consultants } = await supabase
    .from("consultants")
    .select(`
      id, name, level, years_experience, summary,
      consultant_competencies (competency, category)
    `)
    .eq("organization_id", DEFAULT_ORG_ID)
    .order("name");

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Konsulter</h1>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <ConsultantList initialData={consultants || []} />
          </div>
          <div>
            <h2 className="text-lg font-semibold mb-4">Ladda upp CV:n</h2>
            <ConsultantUploadWrapper />
          </div>
        </div>
      </div>
    </main>
  );
}
