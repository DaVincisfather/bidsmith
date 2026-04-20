import type { BidSection } from "../types";

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
  | "certifications";

export interface SlideConfig {
  /** 1-based slide index in the template .pptx */
  source: number;
  /** Semantic slide type — picks applicator */
  type: SlideType;
  /** If set, this slide is cloned per array item from data[cloneFrom] */
  cloneFrom?: "phases" | "references";
  /** Optional caps on per-instance placeholder counts (e.g., max 4 activities) */
  itemCaps?: Record<string, number>;
}

export interface TemplateConfig {
  id: string;
  /** Path relative to templates */
  templateFile: string;
  /** Slides to RENDER (illustrative copies in mockup are excluded) */
  slides: SlideConfig[];
}

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
  /** Source slide number from the template (1-based). Used by multi-slide applicators
   *  like prose to dispatch on the correct placeholder set. */
  sourceSlide: number;
}
