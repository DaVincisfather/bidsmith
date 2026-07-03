import Automizer from "pptx-automizer";
import type { ISlide } from "pptx-automizer/dist/interfaces/islide";
import path from "path";
import type { BidSection } from "../types";
import type { LoadedTemplate } from "./template-store";
import type { ManifestSlide } from "./manifest-types";
import type { ApplicatorContext, MasterContext } from "./types";
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
import {
  countOutputSlides,
  getCloneItems,
  streamToBuffer,
} from "./render-helpers";
import { manifestToProfile } from "./manifest-to-profile";
import { renderFromProfile } from "./render-from-profile";

export async function renderTemplate(
  tpl: Pick<LoadedTemplate, "manifest" | "templateFile"> & { id?: string },
  sections: BidSection[],
  master: MasterContext,
): Promise<Buffer> {
  // Feature-flagged profile-driven path (template-upload slice 3). Off by
  // default; when on, dispatch is driven by a derived TemplateProfile instead of
  // the manifest slide types. Bit-parity vs the type-driven path below is the
  // regression gate (golden-render-profile.test.ts).
  if (process.env.BIDSMITH_PROFILE_RENDER === "1") {
    // Real templates.id when the caller has one (export route); "bundled" only
    // for the bundled/offline template, which has no persisted row.
    const profile = manifestToProfile(tpl.manifest, {
      templateId: tpl.id ?? "bundled",
    });
    return renderFromProfile(tpl, profile, sections, master);
  }

  const templateDir = path.dirname(tpl.templateFile);
  const templateFile = path.basename(tpl.templateFile);

  const automizer = new Automizer({
    templateDir,
    outputDir: "/tmp",
    removeExistingSlides: true,
  });

  const pres = automizer.loadRoot(templateFile).load(templateFile, "main");

  let outIdx = 0;
  const totalSlides = countOutputSlides(tpl.manifest, sections);

  for (const slideCfg of tpl.manifest.slides) {
    if (slideCfg.cloneFrom) {
      // Clone this slide once per item in the data array.
      const items = getCloneItems(sections, slideCfg.cloneFrom);
      for (let i = 0; i < items.length; i++) {
        outIdx++;
        const cb = applicatorFor(slideCfg, {
          sections,
          master,
          slideNum: outIdx,
          totalSlides,
          cloneIndex: i,
          sourceSlide: slideCfg.source,
          ...(slideCfg.variant ? { variant: slideCfg.variant } : {}),
        });
        pres.addSlide("main", slideCfg.source, cb);
      }
    } else {
      outIdx++;
      const cb = applicatorFor(slideCfg, {
        sections,
        master,
        slideNum: outIdx,
        totalSlides,
        sourceSlide: slideCfg.source,
        ...(slideCfg.variant ? { variant: slideCfg.variant } : {}),
      });
      pres.addSlide("main", slideCfg.source, cb);
    }
  }

  const stream = await pres.stream();
  return streamToBuffer(stream);
}

/** Maps a ManifestSlide type to its applicator callback. */
export function applicatorFor(
  slideCfg: ManifestSlide,
  ctx: ApplicatorContext,
): (slide: ISlide) => void {
  switch (slideCfg.type) {
    case "cover":
      return coverApplicator(ctx);
    case "toc":
      return tocApplicator(ctx);
    case "static":
      // Passthrough — endast footer; bilder och statiskt innehåll lämnas orörda.
      return tocApplicator(ctx);
    case "prose":
      return proseApplicator(ctx);
    case "quality-assurance":
      return qualityAssuranceApplicator(ctx);
    case "phases-overview":
      return phasesOverviewApplicator(ctx);
    case "phase-detail":
      return phaseDetailApplicator(ctx);
    case "team-pricing":
      return teamPricingApplicator(ctx);
    case "requirement-matrix":
      return requirementMatrixApplicator(ctx);
    case "reference":
      return referenceApplicator(ctx);
    case "confidentiality":
      return confidentialityApplicator(ctx);
    case "certifications":
      return certificationsApplicator(ctx);
    default:
      throw new Error(`unknown slide type: ${(slideCfg as { type: string }).type}`);
  }
}
