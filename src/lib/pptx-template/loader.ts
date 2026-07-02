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
import {
  requirementMatrixApplicator,
  MATRIX_ROWS_PER_SLIDE,
} from "./applicators/requirement-matrix";
import { referenceApplicator } from "./applicators/reference";
import { confidentialityApplicator } from "./applicators/confidentiality";
import { certificationsApplicator } from "./applicators/certifications";

export async function renderTemplate(
  tpl: Pick<LoadedTemplate, "manifest" | "templateFile">,
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

function countOutputSlides(
  manifest: Pick<LoadedTemplate["manifest"], "slides">,
  sections: BidSection[],
): number {
  let n = 0;
  for (const s of manifest.slides) {
    if (s.cloneFrom) n += getCloneItems(sections, s.cloneFrom).length;
    else n += 1;
  }
  return n;
}

function getCloneItems(
  sections: BidSection[],
  key: "phases" | "references" | "requirement-matrix",
): unknown[] {
  if (key === "phases") {
    const sec = sections.find((s) => s.content?.format === "phases");
    if (sec && sec.content?.format === "phases") {
      return sec.content.phases ?? [];
    }
  }
  if (key === "references") {
    const sec = sections.find((s) => s.content?.format === "reference-v2");
    if (sec && sec.content?.format === "reference-v2") {
      return sec.content.references ?? [];
    }
  }
  if (key === "requirement-matrix") {
    // One clone per page of MATRIX_ROWS_PER_SLIDE rows. Always at least one
    // page so the matrix slide never disappears when data is missing/empty
    // (unlike phases/references, the matrix slide is not optional). The
    // applicator reads the rows itself and windows on cloneIndex, so the
    // page items only need the right length — their contents are unused.
    const sec = sections.find(
      (s) => s.content?.format === "requirement-matrix-v2",
    );
    const rowCount =
      sec && sec.content?.format === "requirement-matrix-v2"
        ? sec.content.rows.length
        : 0;
    const pages = Math.max(1, Math.ceil(rowCount / MATRIX_ROWS_PER_SLIDE));
    return Array.from({ length: pages });
  }
  return [];
}

function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}
