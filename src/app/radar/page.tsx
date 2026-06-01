import { OpportunityList } from "@/components/radar/OpportunityList";

export default function RadarPage() {
  return (
    <main className="min-h-screen bg-paper">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-display font-normal">RFP-radar</h1>
          <p className="text-ink-mute text-sm mt-1">
            Upphandlingar matchade mot era kompetensområden, rankade efter relevans.
          </p>
        </div>
        <OpportunityList />
      </div>
    </main>
  );
}
