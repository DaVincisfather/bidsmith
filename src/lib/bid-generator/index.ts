import type { BidSection } from "@/lib/types";
import type { BudgetPlan, OverflowFlag } from "@/lib/pptx-template/budget-types";
import type { TemplateManifest } from "@/lib/pptx-template/manifest-types";
import { buildCoverSection } from "./deterministic/cover";
import { buildCertificationsSection } from "./deterministic/certifications";
import { buildConfidentialitySection } from "./deterministic/confidentiality";
import { buildReferenceSection } from "./deterministic/reference";
import { buildUnderstandingBundle } from "./bundles/understanding";
import { buildPhasesBundle } from "./bundles/phases";
import { buildQualityBundle } from "./bundles/quality";
import { buildRequirementMatrixBundle } from "./bundles/requirement-matrix";
import { buildTeamBundle } from "./bundles/team";
import type { BidContext } from "./context";
import type { RetryBudget } from "./with-budget-retry";

export type { BidContext } from "./context";

const GLOBAL_RETRY_CAP = 5;

// Stable identifiers matching the order bundles are dispatched below.
// References are deliberately NOT an AI bundle — see deterministic/reference.ts.
const BUNDLE_LABELS = [
  "understanding",
  "phases",
  "quality",
  "requirement-matrix",
  "team",
] as const;

// Total AI bundles dispatched — lets callers detect a total wipeout
// (every bundle failed = nothing worth saving) vs a partial draft.
export const BID_BUNDLE_COUNT = BUNDLE_LABELS.length;

export interface FailedBundle {
  bundle: (typeof BUNDLE_LABELS)[number];
  error: string;
}

export interface GenerateAllSectionsResult {
  sections: BidSection[];
  overflowFlags: OverflowFlag[];
  // Bundles that rejected. Empty on full success. When non-empty, `sections`
  // holds whatever succeeded — the caller decides whether a partial draft is
  // worth saving rather than discarding the bundles that already cost money.
  failedBundles: FailedBundle[];
}

/**
 * Runs 5 AI bundles in parallel + 4 deterministic generators to produce the
 * full set of BidSections for a v2 template.
 *
 * Field budgets + per-field slide numbers come from the template manifest
 * (BudgetPlan), shares a single RetryBudget across all bundles (so a single
 * bundle blowing up retries doesn't starve the rest), and aggregates per-bundle
 * overflowFlags into one array.
 *
 * Bundles run under allSettled, not Promise.all: one bundle failing must not
 * throw away the (expensive Opus) output of the five that succeeded. Rejections
 * are returned in `failedBundles` for the caller to surface.
 *
 * onSectionComplete is invoked sequentially in v2-template section order,
 * awaited per call (blocks overall completion).
 */
export async function generateAllSections(
  ctx: BidContext,
  manifest: TemplateManifest,
  onSectionComplete?: (section: BidSection) => void | Promise<void>,
): Promise<GenerateAllSectionsResult> {
  const plan: BudgetPlan = { budgets: manifest.budgets, fieldSlides: manifest.fieldSlides };
  const retryBudget: RetryBudget = { remaining: GLOBAL_RETRY_CAP };

  // Ingen cache-prewarm här, trots att bundlarna delar formatContext(ctx):
  // output_config.format (structured outputs) deltar i cache-prefixet, så
  // bundles med olika scheman kan aldrig läsa varandras cache — en delad
  // värmning vore ren kostnad. cachedContext i varje bundle ger ändå
  // cacheträff vid overflow-/format-retries och regenerering inom TTL
  // (verifierat empiriskt 2026-06-10, se fas 0-resultatdokumentet).

  // Deterministic generators — no await needed.
  const cover = buildCoverSection(ctx.analysis);
  const certifications = buildCertificationsSection();
  const confidentiality = buildConfidentialitySection(ctx.analysis);
  const reference = buildReferenceSection();

  const settled = await Promise.allSettled([
    buildUnderstandingBundle(ctx, plan, retryBudget),
    buildPhasesBundle(ctx, plan, retryBudget),
    buildQualityBundle(ctx, plan, retryBudget),
    buildRequirementMatrixBundle(ctx, plan, retryBudget),
    buildTeamBundle(ctx, plan, retryBudget),
  ]);

  const bundleResults: { sections: BidSection[]; overflowFlags: OverflowFlag[] }[] = [];
  const failedBundles: FailedBundle[] = [];
  settled.forEach((result, i) => {
    if (result.status === "fulfilled") {
      bundleResults.push(result.value);
    } else {
      const reason = result.reason;
      failedBundles.push({
        bundle: BUNDLE_LABELS[i],
        error: reason instanceof Error ? reason.message : String(reason),
      });
    }
  });

  // Reference keeps its old position (right after the team bundle's output).
  const sections: BidSection[] = [
    cover,
    ...bundleResults.flatMap((r) => r.sections),
    reference,
    confidentiality,
    certifications,
  ];

  const overflowFlags: OverflowFlag[] = bundleResults.flatMap((r) => r.overflowFlags);

  if (onSectionComplete) {
    for (const s of sections) {
      await onSectionComplete(s);
    }
  }

  return { sections, overflowFlags, failedBundles };
}
