import type { BidSection } from "@/lib/types";
import type { TemplateProfile } from "@/lib/pptx-template/template-profile";
import { buildGenericProseSlideSections, type GenericProseSlot } from "./bundles/generic-prose";
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

// One paid Sonnet call per SLIDE now (was one per slot). A real customer
// template (Radrum: 169 confirmed slots) fired ~169 calls ≈ 8–10 min → past
// Vercel's 300 s ceiling → bid failed "Generation timed out". Batching per slide
// collapses that to ~12 calls. Still cap in-flight SLIDES so a wide deck can't
// fire every slide at once → 429s that exhaust retries and sink the (partly paid)
// batch — the #52-review lesson, same rationale as the classify-slot chunking.
const SLIDE_CONCURRENCY = 3;

// A slide's generation targets, grouped so one AI call covers the whole slide.
interface SlideJob {
  source: number;
  slots: GenericProseSlot[];
}

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
 * slides, batched per SLIDE — one AI call fills all of a slide's slots as a
 * coherent whole. Slots with status "skip" and non-generic-prose capabilities
 * (static passthrough slides) produce nothing; a slide with no generic-prose
 * slots produces no call.
 *
 * Runs the slide calls in chunks under Promise.allSettled: one slide blowing up
 * fails only that slide's slots (all recorded in `failedSections`) while other
 * slides survive. A slide that succeeds but drops a slot's key (truncation past
 * the required schema) fails only that slot. onSectionComplete is invoked
 * sequentially over the produced sections, awaited per call — same contract as
 * generateAllSections.
 */
export async function generateSectionsFromProfile(
  profile: TemplateProfile,
  ctx: BidContext,
  onSectionComplete?: (section: BidSection) => void | Promise<void>,
): Promise<GenerateFromProfileResult> {
  // Group generation targets per slide. Static slides carry no generic-prose
  // slots; skip-status slots are intentionally left blank; a slide left with no
  // targets is dropped so it fires no call.
  const jobs: SlideJob[] = [];
  for (const slide of profile.slides) {
    const slots: GenericProseSlot[] = [];
    for (const slot of slide.slots) {
      if (slot.capability !== "generic-prose") continue;
      if (slot.status === "skip") continue;
      slots.push({
        placeholder: slot.placeholder,
        intent: slot.intent,
        ...(slot.budgetChars !== undefined ? { budgetChars: slot.budgetChars } : {}),
      });
    }
    if (slots.length > 0) jobs.push({ source: slide.source, slots });
  }

  const sections: BidSection[] = [];
  const failedSections: FailedSection[] = [];

  for (let i = 0; i < jobs.length; i += SLIDE_CONCURRENCY) {
    const chunk = jobs.slice(i, i + SLIDE_CONCURRENCY);
    const settled = await Promise.allSettled(
      chunk.map((job) => buildGenericProseSlideSections(job.slots, ctx)),
    );
    settled.forEach((result, j) => {
      const job = chunk[j];
      if (result.status === "fulfilled") {
        const produced = result.value;
        sections.push(...produced);
        // A slide call can succeed yet omit a slot's key — mark only that slot
        // failed so the rest of the slide's (paid) prose survives.
        const got = new Set(
          produced
            .map((s) => (s.content?.format === "generic-prose" ? s.content.placeholder : null))
            .filter((p): p is string => p !== null),
        );
        for (const slot of job.slots) {
          if (!got.has(slot.placeholder)) {
            failedSections.push({
              placeholder: slot.placeholder,
              error: "saknas i AI-svaret (trunkerat)",
            });
          }
        }
      } else {
        // Whole slide rejected → every slot on it failed; other slides survive.
        const reason = result.reason;
        const message = reason instanceof Error ? reason.message : String(reason);
        for (const slot of job.slots) {
          failedSections.push({ placeholder: slot.placeholder, error: message });
        }
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
