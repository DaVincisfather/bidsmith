import { redirect } from "next/navigation";
import { loadFlowState } from "@/lib/flow-state";
import { FlowNav } from "@/components/flow-nav";
import { GoNoGoSection } from "@/components/go-no-go-section";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function GoNoGoPage({ params }: PageProps) {
  const { id } = await params;
  const flow = await loadFlowState(id);

  // No assessment → the team isn't locked; this page has nothing to show.
  if (!flow.assessment) redirect(`/analysis/${id}`);

  return (
    <main className="min-h-full bg-paper">
      <FlowNav
        analysisId={id}
        active="gonogo"
        gonogoEnabled
        bidId={flow.bid?.id ?? null}
        bidFailed={flow.bid?.status === "failed" || (flow.bid?.hasFailures ?? false)}
      />
      <div className="max-w-3xl mx-auto px-6 py-10">
        <GoNoGoSection
          analysisId={id}
          assessment={flow.assessment}
          match={flow.match}
          bid={flow.bid}
        />
      </div>
    </main>
  );
}
