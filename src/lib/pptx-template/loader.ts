import Automizer from "pptx-automizer";
import type { ISlide } from "pptx-automizer/dist/interfaces/islide";
import path from "path";
import type { BidSection } from "../types";
import { getTemplate } from "./registry";
import type { ApplicatorContext, MasterContext, SlideConfig } from "./types";
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

export async function renderTemplate(
  templateId: string,
  sections: BidSection[],
  master: MasterContext,
): Promise<Buffer> {
  const cfg = getTemplate(templateId);
  const templateDir = path.dirname(cfg.templateFile);
  const templateFile = path.basename(cfg.templateFile);

  const automizer = new Automizer({
    templateDir,
    outputDir: "/tmp",
    removeExistingSlides: true,
  });

  const pres = automizer.loadRoot(templateFile).load(templateFile, "main");

  let outIdx = 0;
  const totalSlides = countOutputSlides(cfg, sections);

  for (const slideCfg of cfg.slides) {
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
      });
      pres.addSlide("main", slideCfg.source, cb);
    }
  }

  const stream = await pres.stream();
  return streamToBuffer(stream);
}

/** Maps a SlideConfig type to its applicator callback. */
function applicatorFor(
  slideCfg: SlideConfig,
  ctx: ApplicatorContext,
): ((slide: ISlide) => void) | undefined {
  switch (slideCfg.type) {
    case "cover":
      return coverApplicator(ctx);
    case "toc":
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
      return undefined;
  }
}

function countOutputSlides(
  cfg: ReturnType<typeof getTemplate>,
  sections: BidSection[],
): number {
  let n = 0;
  for (const s of cfg.slides) {
    if (s.cloneFrom) n += getCloneItems(sections, s.cloneFrom).length;
    else n += 1;
  }
  return n;
}

function getCloneItems(
  sections: BidSection[],
  key: "phases" | "references",
): unknown[] {
  if (key === "phases") {
    const sec = sections.find((s) => s.content.format === "phases");
    if (sec && sec.content.format === "phases") {
      return sec.content.phases ?? [];
    }
  }
  if (key === "references") {
    const sec = sections.find((s) => s.content.format === "reference-v2");
    if (sec && sec.content.format === "reference-v2") {
      return sec.content.references ?? [];
    }
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
