import type { BidSection } from "@/lib/types";
import { loadBudgets } from "@/lib/pptx-template/budget-loader";
import type { OverflowFlag } from "@/lib/pptx-template/budget-types";
import { buildCoverSection } from "./deterministic/cover";
import { buildCertificationsSection } from "./deterministic/certifications";
import { buildConfidentialitySection } from "./deterministic/confidentiality";
import { buildUnderstandingBundle } from "./bundles/understanding";
import { buildPhasesBundle } from "./bundles/phases";
import { buildQualityBundle } from "./bundles/quality";
import { buildRequirementMatrixBundle } from "./bundles/requirement-matrix";
import { buildTeamBundle } from "./bundles/team";
import { buildReferenceBundle } from "./bundles/reference";
import type { BidContext } from "./context";
import type { RetryBudget } from "./with-budget-retry";

export type { BidContext } from "./context";

const GLOBAL_RETRY_CAP = 5;

/**
 * Runs 6 AI bundles in parallel + 3 deterministic generators to produce the
 * full set of BidSections for a v2 template.
 *
 * Loads field budgets for templateName from template_configs, shares a single
 * RetryBudget across all bundles (so a single bundle blowing up retries doesn't
 * starve the rest), and aggregates per-bundle overflowFlags into one array.
 *
 * onSectionComplete is invoked sequentially in v2-template section order,
 * awaited per call (blocks overall completion).
 */
export async function generateAllSections(
  ctx: BidContext,
  templateName: string,
  onSectionComplete?: (section: BidSection) => void | Promise<void>,
): Promise<{ sections: BidSection[]; overflowFlags: OverflowFlag[] }> {
  const budgets = await loadBudgets(templateName);
  const retryBudget: RetryBudget = { remaining: GLOBAL_RETRY_CAP };

  // Deterministic generators — no await needed.
  const cover = buildCoverSection(ctx.analysis);
  const certifications = buildCertificationsSection();
  const confidentiality = buildConfidentialitySection(ctx.analysis);

  const bundleResults = await Promise.all([
    buildUnderstandingBundle(ctx, budgets, retryBudget),
    buildPhasesBundle(ctx, budgets, retryBudget),
    buildQualityBundle(ctx, budgets, retryBudget),
    buildRequirementMatrixBundle(ctx, budgets, retryBudget),
    buildTeamBundle(ctx, budgets, retryBudget),
    buildReferenceBundle(ctx, budgets, retryBudget),
  ]);

  const sections: BidSection[] = [
    cover,
    ...bundleResults.flatMap((r) => r.sections),
    confidentiality,
    certifications,
  ];

  const overflowFlags: OverflowFlag[] = bundleResults.flatMap((r) => r.overflowFlags);

  if (onSectionComplete) {
    for (const s of sections) {
      await onSectionComplete(s);
    }
  }

  return { sections, overflowFlags };
}
