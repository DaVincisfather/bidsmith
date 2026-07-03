import Automizer from "pptx-automizer";
import type { ISlide } from "pptx-automizer/dist/interfaces/islide";
import path from "path";
import type { BidSection } from "../types";
import type { LoadedTemplate } from "./template-store";
import type { ApplicatorContext, MasterContext } from "./types";
import type { ProseVariant } from "./manifest-types";
import type { CapabilityId, SlideProfile, TemplateProfile } from "./template-profile";
import { coverApplicator } from "./applicators/cover";
import { tocApplicator } from "./applicators/toc";
import { proseApplicator } from "./applicators/prose";
import { qualityAssuranceApplicator } from "./applicators/quality-assurance";
import { phaseDetailApplicator } from "./applicators/phase-detail";
import { phasesOverviewApplicator } from "./applicators/phases-overview";
import { teamPricingApplicator } from "./applicators/team-pricing";
import { requirementMatrixApplicator } from "./applicators/requirement-matrix";
import { referenceApplicator } from "./applicators/reference";
import { confidentialityApplicator } from "./applicators/confidentiality";
import { certificationsApplicator } from "./applicators/certifications";
import { genericProseApplicator } from "./applicators/generic-prose";
import { getCloneItems, streamToBuffer } from "./render-helpers";

/**
 * Profile-driven renderer (template-upload slice 3). Dispatches per slide by the
 * TemplateProfile's `capability` instead of the manifest slide type, so an
 * arbitrary uploaded template renders against its saved profile. For OUR own
 * template the derived profile must reproduce the type-driven output bit-for-bit
 * (golden-render-profile.test.ts) — that parity is the whole point of slice 3.
 *
 * See notes/2026-07-02-template-upload-architecture.md.
 */

// Profile cloneFrom is a capability; getCloneItems keys off the manifest's data
// arrays. This maps the repeating capability back to its clone-data source.
const CLONE_CAPABILITY_TO_KEY: Partial<
  Record<CapabilityId, "phases" | "references" | "requirement-matrix">
> = {
  "execution-plan": "phases",
  references: "references",
  "requirement-matrix": "requirement-matrix",
};

export async function renderFromProfile(
  tpl: Pick<LoadedTemplate, "manifest" | "templateFile">,
  profile: TemplateProfile,
  sections: BidSection[],
  master: MasterContext,
): Promise<Buffer> {
  const templateDir = path.dirname(tpl.templateFile);
  const templateFile = path.basename(tpl.templateFile);

  const automizer = new Automizer({
    templateDir,
    outputDir: "/tmp",
    removeExistingSlides: true,
  });

  const pres = automizer.loadRoot(templateFile).load(templateFile, "main");

  let outIdx = 0;
  const totalSlides = countProfileOutputSlides(profile, sections);

  for (const slide of profile.slides) {
    // Clone slides render once per item in the driving capability's data array;
    // non-clone slides render once (cloneItems null → cloneIndex undefined).
    const cloneItems = cloneItemsFor(slide, sections);
    const count = cloneItems ? cloneItems.length : 1;
    for (let i = 0; i < count; i++) {
      outIdx++;
      const cloneIndex = cloneItems ? i : undefined;
      const cb = applicatorForCapability(
        slide,
        ctxFor(slide, sections, master, outIdx, totalSlides, cloneIndex),
      );
      pres.addSlide("main", slide.source, cb);
    }
  }

  const stream = await pres.stream();
  return streamToBuffer(stream);
}

function ctxFor(
  slide: SlideProfile,
  sections: BidSection[],
  master: MasterContext,
  slideNum: number,
  totalSlides: number,
  cloneIndex?: number,
): ApplicatorContext {
  return {
    sections,
    master,
    slideNum,
    totalSlides,
    sourceSlide: slide.source,
    ...(cloneIndex !== undefined ? { cloneIndex } : {}),
    // Profile carries the variant as a free-form string (general templates);
    // our prose applicator narrows it to the ProseVariant enum.
    ...(slide.variant ? { variant: slide.variant as ProseVariant } : {}),
  };
}

/** Clone data for a repeating slide, or null when the slide renders once. */
function cloneItemsFor(
  slide: SlideProfile,
  sections: BidSection[],
): unknown[] | null {
  if (!slide.cloneFrom) return null;
  const key = CLONE_CAPABILITY_TO_KEY[slide.cloneFrom];
  if (!key) {
    // The schema permits any capability as cloneFrom, but only these three have
    // a clone-data source. Fail loud rather than silently dropping the slide (an
    // empty array is truthy → zero clones → the slide vanishes). Reachable once
    // editable profiles (slice 5/6) can set an arbitrary repeating capability.
    throw new Error(`cloneFrom capability has no clone-data source: ${slide.cloneFrom}`);
  }
  return getCloneItems(sections, key);
}

function countProfileOutputSlides(
  profile: TemplateProfile,
  sections: BidSection[],
): number {
  let n = 0;
  for (const slide of profile.slides) {
    const cloneItems = cloneItemsFor(slide, sections);
    n += cloneItems ? cloneItems.length : 1;
  }
  return n;
}

/** Maps a slide's capability to its applicator callback. */
export function applicatorForCapability(
  slide: SlideProfile,
  ctx: ApplicatorContext,
): (slide: ISlide) => void {
  switch (slide.capability) {
    case "cover":
      return coverApplicator(ctx);
    case "toc":
      return tocApplicator(ctx);
    case "static":
      // Passthrough — endast footer; bilder och statiskt innehåll lämnas orörda.
      return tocApplicator(ctx);
    case "understanding":
      return proseApplicator(ctx);
    case "quality-assurance":
      return qualityAssuranceApplicator(ctx);
    case "execution-plan":
      // One capability, two applicators: the repeated slide (cloneFrom set) is
      // the per-phase detail; the single slide is the overview.
      return slide.cloneFrom
        ? phaseDetailApplicator(ctx)
        : phasesOverviewApplicator(ctx);
    case "team-pricing":
      return teamPricingApplicator(ctx);
    case "requirement-matrix":
      return requirementMatrixApplicator(ctx);
    case "references":
      return referenceApplicator(ctx);
    case "secrecy":
      return confidentialityApplicator(ctx);
    case "certifications":
      return certificationsApplicator(ctx);
    case "generic-prose":
      // Fallback: fill this slide's generic-prose slots with plain prose
      // generated per-slot (template-upload slice 4).
      return genericProseApplicator(ctx, slide);
    default:
      throw new Error(
        `no applicator for capability: ${slide.capability ?? "(none)"}`,
      );
  }
}
