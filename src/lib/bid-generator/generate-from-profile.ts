import type { BidSection } from "@/lib/types";
import type { TemplateProfile } from "@/lib/pptx-template/template-profile";
import { buildGenericProseSection, type GenericProseSlot } from "./bundles/generic-prose";
import type { BidContext } from "./context";

export type { BidContext } from "./context";

/**
 * Profile-driven generation (template-upload slice 5b) — the counterpart to
 * generateAllSections for FOREIGN templates. Their stored profile maps every
 * fillable slot to generic-prose (see onboarding/propose-injection-plan.ts), so
 * there are no specialised bundles to run: we generate one prose section per
 * generic-prose slot instead. renderFromProfile then matches each section back
 * to its placeholder. Routing between this and generateAllSections is the
 * isAllGenericProfile discriminator (template-profile.ts).
 *
 * See notes/2026-07-02-template-upload-architecture.md.
 */

// Each generic-prose slot is ONE paid Sonnet call, and a real customer template
// can carry 30+ of them. An unbounded Promise.all would fire them all at once →
// 429s that exhaust retries and sink the whole (partly paid) batch — the
// #52-review lesson, same rationale as the classify-slot chunking. Cap the
// in-flight calls; each chunk settles before the next dispatches.
const SLOT_CONCURRENCY = 4;

export interface FailedSection {
  /** The placeholder the failed slot would have filled (stable identifier). */
  placeholder: string;
  error: string;
}

export interface GenerateFromProfileResult {
  sections: BidSection[];
  // Slots whose generation rejected. Empty on full success. When non-empty,
  // `sections` still holds the slots that succeeded — one failed slot must not
  // discard the (already billed) prose that came back for the others. Mirrors
  // generateAllSections' failedBundles contract.
  failedSections: FailedSection[];
}

/**
 * Generates a BidSection for every generic-prose slot across the profile's
 * slides. Slots with status "skip" and non-generic-prose capabilities (static
 * passthrough slides) produce nothing.
 *
 * Runs the paid calls in chunks under Promise.allSettled: a single slot blowing
 * up must not throw away the ones that succeeded (returned in `failedSections`
 * for the caller to surface). onSectionComplete is invoked sequentially over the
 * produced sections, awaited per call — same contract as generateAllSections.
 */
export async function generateSectionsFromProfile(
  profile: TemplateProfile,
  ctx: BidContext,
  onSectionComplete?: (section: BidSection) => void | Promise<void>,
): Promise<GenerateFromProfileResult> {
  // Flatten every generation target across all slides. Static slides carry no
  // generic-prose slots; skip-status slots are intentionally left blank.
  const targets: GenericProseSlot[] = [];
  for (const slide of profile.slides) {
    for (const slot of slide.slots) {
      if (slot.capability !== "generic-prose") continue;
      if (slot.status === "skip") continue;
      targets.push({
        placeholder: slot.placeholder,
        intent: slot.intent,
        ...(slot.budgetChars !== undefined ? { budgetChars: slot.budgetChars } : {}),
      });
    }
  }

  const sections: BidSection[] = [];
  const failedSections: FailedSection[] = [];

  for (let i = 0; i < targets.length; i += SLOT_CONCURRENCY) {
    const chunk = targets.slice(i, i + SLOT_CONCURRENCY);
    const settled = await Promise.allSettled(
      chunk.map((slot) => buildGenericProseSection(slot, ctx)),
    );
    settled.forEach((result, j) => {
      if (result.status === "fulfilled") {
        sections.push(result.value);
      } else {
        const reason = result.reason;
        failedSections.push({
          placeholder: chunk[j].placeholder,
          error: reason instanceof Error ? reason.message : String(reason),
        });
      }
    });
  }

  if (onSectionComplete) {
    for (const s of sections) {
      await onSectionComplete(s);
    }
  }

  return { sections, failedSections };
}
