import Link from "next/link";
import { createServiceClient } from "@/lib/supabase";
import { buildAnalysisListItems, type AnalysisListItem } from "@/lib/analyses-list";

// Reads live workspace data; never prerender at build time.
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<AnalysisListItem["status"], string> = {
  exported: "Exporterat",
  draft: "Utkast",
  none: "Ingen anbud",
};

const STATUS_CLASS: Record<AnalysisListItem["status"], string> = {
  exported: "bg-accent-soft text-accent-ink",
  draft: "bg-amber-100 text-amber-800",
  none: "bg-paper-2 text-ink-mute",
};

export default async function AnalyserPage() {
  const supabase = createServiceClient();
  const today = new Date().toISOString().split("T")[0];

  const [{ data: analyses }, { data: bids }] = await Promise.all([
    supabase
      .from("analyses")
      .select("id, analysis, created_at, documents(file_name)")
      .order("created_at", { ascending: false }),
    supabase.from("bids").select("analysis_id, status, exported_at"),
  ]);

  const items = buildAnalysisListItems(
    (analyses as never[] | null) ?? [],
    (bids as never[] | null) ?? [],
    today,
  );

  return (
    <main className="min-h-screen bg-paper">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="mb-8">
          <Link href="/arbetsyta" className="text-sm text-ink-mute hover:text-accent">
            ← Arbetsyta
          </Link>
          <h1 className="text-2xl font-display font-normal mt-2">Analyser</h1>
          <p className="mt-1 text-sm text-ink-mute">
            Alla analyserade RFP:er — oavsett deadline. Klicka för att öppna analysen.
          </p>
        </div>

        {items.length === 0 ? (
          <p className="text-ink-mute text-sm py-12 text-center">
            Inga analyser ännu. Analysera en RFP för att komma igång.
          </p>
        ) : (
          <div className="border border-rule rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-paper-2">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-ink-soft">RFP</th>
                  <th className="text-left px-4 py-2 font-medium text-ink-soft">Deadline</th>
                  <th className="text-right px-4 py-2 font-medium text-ink-soft">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-paper-2">
                    <td className="px-4 py-3">
                      <Link href={`/analysis/${item.id}`} className="font-medium text-ink hover:text-accent">
                        {item.title}
                      </Link>
                      {item.client && (
                        <span className="block text-xs text-ink-mute">{item.client}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-soft">
                      {item.deadline ? (
                        <span className={item.deadlinePassed ? "text-ink-mute" : ""}>
                          {item.deadline}
                          {item.deadlinePassed && " (passerad)"}
                        </span>
                      ) : (
                        <span className="text-ink-mute">Ingen deadline</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`text-xs font-medium px-2 py-1 rounded ${STATUS_CLASS[item.status]}`}
                      >
                        {STATUS_LABEL[item.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
