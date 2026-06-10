import type { SupabaseClient } from "@supabase/supabase-js";
import { generateAllSections, BID_BUNDLE_COUNT } from "@/lib/bid-generator";
import type { BidContext, FailedBundle } from "@/lib/bid-generator";
import type { BidSection } from "@/lib/types";
import {
  judgeBidStructure,
  buildStructureEvalSummary,
  RUNTIME_MANDATORY_SECTIONS,
} from "@/lib/eval/bid-structure";

/**
 * Background half of POST /api/bids. The route returns 202 as soon as the bid
 * row exists; this runs via after() and owns every status transition from
 * 'generating' onward. Failures are persisted (status='failed' +
 * generation_error) instead of returned — there is no HTTP response left to
 * carry them. Requires migration 002 (status 'failed', failed_bundles).
 */
export async function runBidGeneration(
  supabase: SupabaseClient,
  bidId: string,
  ctx: BidContext,
  templateName: string,
): Promise<void> {
  let sections: BidSection[];
  let overflowFlags: Awaited<ReturnType<typeof generateAllSections>>["overflowFlags"];
  let failedBundles: FailedBundle[];
  try {
    ({ sections, overflowFlags, failedBundles } = await generateAllSections(
      ctx,
      templateName,
      async (section: BidSection) => {
        const { data: currentBid } = await supabase
          .from("bids")
          .select("sections")
          .eq("id", bidId)
          .single();

        const currentSections = (currentBid?.sections as BidSection[]) ?? [];
        currentSections.push(section);

        await supabase
          .from("bids")
          .update({ sections: currentSections })
          .eq("id", bidId);
      },
    ));
  } catch (err) {
    console.error("bid generation failed:", err);
    await markFailed(
      supabase,
      bidId,
      err instanceof Error ? err.message : "Bid generation failed",
      [],
    );
    return;
  }

  // Every bundle failed → no AI content was produced (only deterministic
  // cover/confidentiality/certifications), so there's no draft worth opening.
  if (failedBundles.length >= BID_BUNDLE_COUNT) {
    console.error("all bid bundles failed:", failedBundles);
    await markFailed(supabase, bidId, "All AI bundles failed", failedBundles);
    return;
  }
  // Some bundles failed but others succeeded: keep the partial draft rather
  // than discarding the (already billed) Opus output. failed_bundles is
  // persisted so the UI can tell the user which sections to regenerate.
  if (failedBundles.length > 0) {
    console.warn("bid generation partial — some bundles failed:", failedBundles);
  }

  // Eval failure must never block the bid save — sections took 2-5 min to
  // generate and we'd rather show "ej utvärderad" than lose them.
  let structureEval: ReturnType<typeof buildStructureEvalSummary> | null = null;
  try {
    structureEval = buildStructureEvalSummary(
      judgeBidStructure(sections, RUNTIME_MANDATORY_SECTIONS),
    );
  } catch (err) {
    console.error("structure-judge failed (sections still saved):", err);
  }

  // Guarded on status: if the stale-generating watchdog already marked this
  // bid 'failed' (runner outlived the window), 'failed' is terminal — a late
  // finish must not resurrect the bid the user was told to re-run.
  await supabase
    .from("bids")
    .update({
      sections,
      status: "draft",
      structure_eval: structureEval,
      overflow_flags: overflowFlags,
      failed_bundles: failedBundles,
    })
    .eq("id", bidId)
    .eq("status", "generating");
}

async function markFailed(
  supabase: SupabaseClient,
  bidId: string,
  message: string,
  failedBundles: FailedBundle[],
): Promise<void> {
  const { error } = await supabase
    .from("bids")
    .update({
      status: "failed",
      generation_error: message,
      failed_bundles: failedBundles,
    })
    .eq("id", bidId)
    .eq("status", "generating");
  if (error) {
    console.error(`failed to mark bid ${bidId} as failed: ${error.message}`);
  }
}
