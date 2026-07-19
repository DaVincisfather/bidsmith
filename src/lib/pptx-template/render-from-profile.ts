import Automizer from "pptx-automizer";
import type { ISlide } from "pptx-automizer/dist/interfaces/islide";
import path from "path";
import { readFile } from "fs/promises";
import type { BidSection } from "../types";
import type { LoadedTemplate } from "./template-store";
import type { ApplicatorContext, MasterContext } from "./types";
import type { ProseVariant } from "./manifest-types";
import type { CapabilityId, SlideProfile, TemplateProfile } from "./template-profile";
import { readPptxSlides } from "./introspect/read-pptx";
import { readSlideSize } from "./onboarding/slide-size";
import { packRows, BOTTOM_MARGIN_EMU } from "./foreign-table-pagination";
import {
  foreignTableApplicator,
  wrapCellsFor,
  type MatrixRow,
} from "./applicators/foreign-table";
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

  // Foreign a:tbl requirement-matrix slides paginate by CLONING the slide, once
  // per page computed from the customer's table geometry. Read the template's
  // tables + slide size ONCE up front (async, off the sync clone helpers) and
  // key the resulting per-slide page windows by source slide number.
  const tablePages = await computeTablePages(tpl, profile, sections);

  let outIdx = 0;
  const totalSlides = countProfileOutputSlides(profile, sections, tablePages);

  for (const slide of profile.slides) {
    // Clone slides render once per item in the driving capability's data array;
    // non-clone slides render once (cloneItems null → cloneIndex undefined).
    const cloneItems = cloneItemsFor(slide, sections, tablePages);
    const count = cloneItems ? cloneItems.length : 1;
    for (let i = 0; i < count; i++) {
      outIdx++;
      const cloneIndex = cloneItems ? i : undefined;
      // A foreign-table slide's clone data is its page's row-index chunk; pass
      // it through so the applicator fills exactly this page's requirements.
      const tableRowIndices =
        isTableMapSlide(slide) && cloneItems
          ? (cloneItems[i] as number[])
          : undefined;
      const cb = applicatorForCapability(
        slide,
        ctxFor(
          slide,
          sections,
          master,
          outIdx,
          totalSlides,
          cloneIndex,
          tableRowIndices,
        ),
      );
      pres.addSlide("main", slide.source, cb);
    }
  }

  const stream = await pres.stream();
  return streamToBuffer(stream);
}

/** True for a foreign requirement-matrix slide backed by a mapped a:tbl table. */
function isTableMapSlide(slide: SlideProfile): boolean {
  return slide.capability === "requirement-matrix" && slide.tableMap !== undefined;
}

/**
 * Per-source-slide page windows for every foreign-table slide in the profile:
 * packRows over the requirement-matrix rows, driven by each mapped table's
 * measured geometry (col widths, row heights, table top) + the slide height.
 * Empty when the profile has no mapped table (OUR template), so nothing changes
 * on the golden path. Read once — the template file is opened a single time.
 */
async function computeTablePages(
  tpl: Pick<LoadedTemplate, "manifest" | "templateFile">,
  profile: TemplateProfile,
  sections: BidSection[],
): Promise<Map<number, number[][]>> {
  const map = new Map<number, number[][]>();
  const tableSlides = profile.slides.filter(isTableMapSlide);
  if (tableSlides.length === 0) return map;

  const buffer = await readFile(tpl.templateFile);
  const templateSlides = await readPptxSlides(buffer);
  const { cy: slideHeightEmu } = await readSlideSize(buffer);

  const rows = matrixRequirementRows(sections);

  for (const slide of tableSlides) {
    const tm = slide.tableMap!;
    const source = templateSlides.find((s) => s.source === slide.source);
    const table = source?.tables[tm.frameIndex];
    if (!table) {
      // Geometry unreadable → one page holding all rows (still no drop).
      map.set(slide.source, rows.length > 0 ? [rows.map((_, i) => i)] : [[]]);
      continue;
    }
    // Estimate each row's height from the ACTUAL text of every mapped content
    // column against its own gridCol width (max wrap wins) — a verbose answer in
    // a narrow column, not just the krav text, decides the row height.
    const wrapRows = rows.map((r) => wrapCellsFor(r, tm.columns, table.gridColsEmu));
    const pages = packRows(wrapRows, {
      slideHeightEmu,
      tableTopEmu: table.geometry?.yEmu ?? 0,
      headerHeightsEmu: table.rows
        .slice(0, tm.headerRows)
        .map((r) => r.heightEmu),
      templateRowHeightEmu: table.rows[tm.templateRowIndex]?.heightEmu ?? 0,
      fontSizePt: null,
      bottomMarginEmu: BOTTOM_MARGIN_EMU,
    });
    map.set(slide.source, pages);
  }
  return map;
}

/** The requirement-matrix-v2 section's rows, or [] when absent. */
function matrixRequirementRows(sections: BidSection[]): MatrixRow[] {
  const sec = sections.find(
    (s) => s.content?.format === "requirement-matrix-v2",
  );
  return sec && sec.content?.format === "requirement-matrix-v2"
    ? sec.content.rows
    : [];
}

function ctxFor(
  slide: SlideProfile,
  sections: BidSection[],
  master: MasterContext,
  slideNum: number,
  totalSlides: number,
  cloneIndex?: number,
  tableRowIndices?: number[],
): ApplicatorContext {
  return {
    sections,
    master,
    slideNum,
    totalSlides,
    sourceSlide: slide.source,
    ...(cloneIndex !== undefined ? { cloneIndex } : {}),
    ...(tableRowIndices !== undefined ? { tableRowIndices } : {}),
    // Profile carries the variant as a free-form string (general templates);
    // our prose applicator narrows it to the ProseVariant enum.
    ...(slide.variant ? { variant: slide.variant as ProseVariant } : {}),
  };
}

/** Clone data for a repeating slide, or null when the slide renders once. */
function cloneItemsFor(
  slide: SlideProfile,
  sections: BidSection[],
  tablePages: Map<number, number[][]>,
): unknown[] | null {
  // Foreign a:tbl matrix slide: one clone per page (row-index chunk). Checked
  // before cloneFrom — these slides carry no cloneFrom (the table IS the
  // content), and their page count comes from the table geometry, not a data
  // array. Always ≥ 1 page so the slide never vanishes.
  if (isTableMapSlide(slide)) {
    return tablePages.get(slide.source) ?? [[]];
  }
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
  tablePages: Map<number, number[][]>,
): number {
  let n = 0;
  for (const slide of profile.slides) {
    const cloneItems = cloneItemsFor(slide, sections, tablePages);
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
      // A mapped foreign a:tbl table → the row engine; our own template's
      // stack-of-boxes matrix (no tableMap) keeps the existing applicator.
      return slide.tableMap
        ? foreignTableApplicator(ctx, slide)
        : requirementMatrixApplicator(ctx);
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
