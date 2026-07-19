import type { SupabaseClient } from "@supabase/supabase-js";
import { generateAllSections, BID_BUNDLE_COUNT } from "@/lib/bid-generator";
import type { BidContext, FailedBundle } from "@/lib/bid-generator";
import {
  generateSectionsFromProfile,
  type FailedSection,
} from "@/lib/bid-generator/generate-from-profile";
import { buildRequirementMatrixBundle } from "@/lib/bid-generator/bundles/requirement-matrix";
import type { RetryBudget } from "@/lib/bid-generator/with-budget-retry";
import type { TemplateManifest } from "@/lib/pptx-template/manifest-types";
import type { OverflowFlag } from "@/lib/pptx-template/budget-types";
import { loadTemplateProfile } from "@/lib/pptx-template/profile-store";
import { isForeignProfile, hasMappedTable } from "@/lib/pptx-template/template-profile";
import type { BidSection } from "@/lib/types";
import {
  judgeBidStructure,
  buildStructureEvalSummary,
  RUNTIME_MANDATORY_SECTIONS,
} from "@/lib/eval/bid-structure";

// Same cap as generateAllSections' GLOBAL_RETRY_CAP (bid-generator/index.ts) —
// the bundle path shares one budget across 5 concurrent bundles; here it's a
// single bundle, so it gets its own budget at the same cap.
const MATRIX_RETRY_CAP = 5;

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
  template: { id: string; manifest: TemplateManifest },
): Promise<void> {
  // Incremental save: every finished section is appended to the bid row so a
  // slow generation still shows progress. Shared by both generation paths.
  const persistSection = async (section: BidSection) => {
    const { data: currentBid } = await supabase
      .from("bids")
      .select("sections")
      .eq("id", bidId)
      .single();

    const currentSections = (currentBid?.sections as BidSection[]) ?? [];
    currentSections.push(section);

    await supabase.from("bids").update({ sections: currentSections }).eq("id", bidId);
  };

  let sections: BidSection[];
  let overflowFlags: OverflowFlag[];
  // Both paths report failures the same way to the caller: the failed_bundles
  // column is jsonb, so a foreign template's per-slot failures (FailedSection)
  // and our template's per-bundle failures (FailedBundle) share the persistence
  // path and the export route's "has failed sections → refuse" check.
  let failedUnits: (FailedBundle | FailedSection)[];
  let totalWipeout: boolean;
  // Strukturjuryn (buildStructureEvalSummary) mäter mot VÅR v2-malls 11
  // obligatoriska format — meningslöst för en främmande mall vars sektioner alla
  // är generic-prose. Utan denna grind skulle varje foreign-bid få rött
  // struktur-badge även när den är perfekt (routine-fynd #68). Per-mall-facit är
  // en egen backlog-post; här persisteras structure_eval null = "ej utvärderad".
  let onProfilePath = false;
  try {
    // A FOREIGN template's manifest is near-empty (upload introspection
    // excludes unrecognised slides), so the profile is the only truth for
    // BOTH generation and rendering. Our own template has no stored profile
    // → the type-driven bundle path, unchanged.
    const storedProfile = await loadTemplateProfile(template.id);
    if (storedProfile && isForeignProfile(storedProfile)) {
      onProfilePath = true;
      const result = await generateSectionsFromProfile(storedProfile, ctx, persistSection);
      sections = result.sections;
      overflowFlags = [];
      failedUnits = [...result.failedSections];

      // A foreign template whose requirement-matrix slide maps to a real
      // a:tbl table (hasMappedTable) gets the SAME matrix bundle our own
      // template uses. Plan is built from the manifest exactly like the
      // bundled path does (bid-generator/index.ts) — NOT a hardcoded empty
      // plan: withBudgetRetry's verifyFieldBudgets reads plan.budgets
      // directly (ungated by REQUIREMENT_MATRIX_BUDGET_KEYS, which only
      // controls the prompt's own "TEXT-LIMITS" block), and verify-budgets'
      // FIELD_LABELS already has entries for rows[*].requirement/hurUppfylls/
      // referens. A foreign template's manifest is near-empty today so this
      // is behaviourally a no-op, but a hardcoded {} would permanently kill
      // the overflow-retry net the day cell budgets are added for foreign
      // manifests. Runs AFTER the prose pipeline rather than concurrently
      // with it: generateSectionsFromProfile already drives its own
      // sequential read-modify-write persistSection calls internally, and a
      // second concurrent caller of persistSection would race that
      // read-modify-write (lost updates).
      if (hasMappedTable(storedProfile)) {
        try {
          const matrixRetryBudget: RetryBudget = { remaining: MATRIX_RETRY_CAP };
          const matrixResult = await buildRequirementMatrixBundle(
            ctx,
            { budgets: template.manifest.budgets, fieldSlides: template.manifest.fieldSlides },
            matrixRetryBudget,
          );
          sections = [...sections, ...matrixResult.sections];
          overflowFlags = [...overflowFlags, ...matrixResult.overflowFlags];
          for (const s of matrixResult.sections) {
            await persistSection(s);
          }
        } catch (err) {
          // Mirrors generateAllSections' failedBundles/allSettled contract: a
          // matrix-bundle rejection is recorded, not thrown — the
          // already-generated (and already persisted) prose sections above
          // must survive it.
          const matrixFailure: FailedBundle = {
            bundle: "requirement-matrix",
            error: err instanceof Error ? err.message : String(err),
          };
          failedUnits = [...failedUnits, matrixFailure];
        }
      }

      // Nothing produced but slots/bundle failed = every paid call rejected →
      // no draft worth opening. Zero targets (all static/skip) is a valid
      // empty bid.
      totalWipeout = sections.length === 0 && failedUnits.length > 0;
    } else {
      const result = await generateAllSections(ctx, template.manifest, persistSection);
      sections = result.sections;
      overflowFlags = result.overflowFlags;
      failedUnits = result.failedBundles;
      totalWipeout = result.failedBundles.length >= BID_BUNDLE_COUNT;
    }
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

  // Total wipeout → no AI content was produced (bundle path still has the
  // deterministic cover/confidentiality/certifications, but nothing worth
  // opening as a draft), so mark failed instead of persisting a hollow bid.
  if (totalWipeout) {
    console.error("all bid generation units failed:", failedUnits);
    await markFailed(supabase, bidId, "All AI bundles failed", failedUnits);
    return;
  }
  const failedBundles = failedUnits;
  // Some bundles failed but others succeeded: keep the partial draft rather
  // than discarding the (already billed) Opus output. failed_bundles is
  // persisted so the UI can tell the user which sections to regenerate.
  if (failedBundles.length > 0) {
    console.warn("bid generation partial — some bundles failed:", failedBundles);
  }

  // Eval failure must never block the bid save — sections took 2-5 min to
  // generate and we'd rather show "ej utvärderad" than lose them. Skippas helt på
  // profil-vägen (foreign mall → v2-facit gäller inte, se ovan).
  let structureEval: ReturnType<typeof buildStructureEvalSummary> | null = null;
  if (!onProfilePath) {
    try {
      structureEval = buildStructureEvalSummary(
        judgeBidStructure(sections, RUNTIME_MANDATORY_SECTIONS),
      );
    } catch (err) {
      console.error("structure-judge failed (sections still saved):", err);
    }
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
  failedBundles: (FailedBundle | FailedSection)[],
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
