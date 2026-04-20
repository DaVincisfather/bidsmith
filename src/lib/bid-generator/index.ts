import type { BidSection } from "@/lib/types";
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

export type { BidContext } from "./context";

/**
 * Runs 6 AI bundles in parallel + 3 deterministic generators to produce the
 * full set of BidSections for a v2 template.
 *
 * onSectionComplete is invoked sequentially in v2-template section order,
 * awaited per call (blocks overall completion).
 */
export async function generateAllSections(
  ctx: BidContext,
  onSectionComplete?: (section: BidSection) => void | Promise<void>,
): Promise<BidSection[]> {
  // Deterministic generators — no await needed.
  const cover = buildCoverSection(ctx.analysis);
  const certifications = buildCertificationsSection();
  const confidentiality = buildConfidentialitySection(ctx.analysis);

  const bundleResults = await Promise.all([
    buildUnderstandingBundle(ctx),
    buildPhasesBundle(ctx),
    buildQualityBundle(ctx),
    buildRequirementMatrixBundle(ctx),
    buildTeamBundle(ctx),
    buildReferenceBundle(ctx),
  ]);

  const all: BidSection[] = [
    cover,
    ...bundleResults.flat(),
    confidentiality,
    certifications,
  ];

  if (onSectionComplete) {
    for (const s of all) {
      await onSectionComplete(s);
    }
  }

  return all;
}
