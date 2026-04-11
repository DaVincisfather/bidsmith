import { z } from "zod";
import { BidPlanSchema, PlannedSectionSchema } from "./ai-schemas";

// Type aliases inferred from Zod schemas
export type BidPlan = z.infer<typeof BidPlanSchema>;
export type PlannedSection = z.infer<typeof PlannedSectionSchema>;
export type SectionKind = PlannedSection["kind"];

// Subsequent tasks add DEFAULT_BID_PLAN, planBid, planBidOrFallback
