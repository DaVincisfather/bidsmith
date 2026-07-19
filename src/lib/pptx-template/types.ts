import type { BidSection } from "../types";
import type { ProseVariant } from "./manifest-types";

export type SlideType =
  | "cover"
  | "toc"
  | "prose"           // understanding-current/assignment/vision use this
  | "phases-overview"
  | "phase-detail"
  | "quality-assurance"
  | "team-pricing"
  | "requirement-matrix"
  | "reference"
  | "confidentiality"
  | "certifications"
  | "static";         // token-fri slide med bilder — renderas passthrough (endast footer)

export interface MasterContext {
  companyName: string;
  clientName: string;
  diaryNumber: string;
  bidName: string;
  bidDate: string;
}

/** Inputs an applicator receives */
export interface ApplicatorContext {
  /** Pre-rendered section data from bid-generator */
  sections: BidSection[];
  master: MasterContext;
  /** 1-based output slide number (for footer counter) */
  slideNum: number;
  /** Total output slides (for footer counter) */
  totalSlides: number;
  /** For cloned slides, the index within the cloned set (0-based) */
  cloneIndex?: number;
  /** For a foreign-table (tableMap) slide clone: the requirement-matrix row
   *  indices to render on THIS page, precomputed by render-from-profile via
   *  packRows so the loader's page count and the applicator's fill window stay
   *  in lockstep. */
  tableRowIndices?: number[];
  /** Source slide number from the template (1-based). Used by multi-slide applicators
   *  like prose to dispatch on the correct placeholder set. */
  sourceSlide: number;
  /** Prose-variant ur manifestet (kunden-idag/uppdraget/vision). Prose-applikatorn
   *  dispatchar på denna istället för sourceSlide. */
  variant?: ProseVariant;
}
