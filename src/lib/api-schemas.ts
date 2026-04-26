import { z } from "zod";
import { ConsultantExtractionSchema } from "./ai-schemas";

// Why: route handlers used to do `body as { ... }` casts and hand-rolled enum
// checks. Centralised here so a single source of truth defines what each
// endpoint accepts. Each schema mirrors the route's *current* behaviour —
// behavioural changes belong in their own commits.

// --- Bid: PATCH /api/bids/[id] ---
//
// Note: this PATCH only accepts 3 outcomes, while /api/bids/[id]/outcome accepts 4
// (incl. "cancelled"). Surgical pass keeps each route's existing surface.

export const BidPatchSchema = z
  .object({
    outcome: z.enum(["won", "lost", "no-bid"]).optional(),
    sections: z.array(z.unknown()).optional(),
  })
  .refine((v) => v.outcome !== undefined || v.sections !== undefined, {
    message: "No valid fields to update",
  });

// --- Bid: PATCH /api/bids/[id]/outcome ---

const VALID_LOSS_REASONS = [
  "pris",
  "erfarenhet",
  "team",
  "kvalitet",
  "relation",
  "annat",
] as const;

export const OutcomePatchSchema = z.object({
  outcome: z.enum(["won", "lost", "no-bid", "cancelled"]),
  competitorName: z.string().optional(),
  lossReason: z.enum(VALID_LOSS_REASONS).optional(),
  lossComment: z.string().optional(),
});

// --- Bid: POST /api/bids ---

export const BidCreateSchema = z.object({
  analysisId: z.string().min(1),
  assessmentId: z.string().optional(),
  teamConsultantIds: z.array(z.string().min(1)).min(1),
});

// --- Consultant: PUT /api/consultants/[id] ---
//
// Reuses ConsultantExtractionSchema's enum/array shapes, but lets callers
// omit competencies/references (route only replaces them when present).

export const ConsultantUpdateSchema = z.object({
  name: z.string().min(1),
  level: ConsultantExtractionSchema.shape.level,
  yearsExperience: z.number(),
  summary: z.string(),
  competencies: ConsultantExtractionSchema.shape.competencies.optional(),
  references: ConsultantExtractionSchema.shape.references.optional(),
});

// --- Go/No-Go: POST /api/go-no-go ---

export const GoNoGoCreateSchema = z.object({
  analysisId: z.string().min(1),
  teamConsultantIds: z.array(z.string()).optional(),
});

// --- Go/No-Go: PATCH /api/go-no-go/[id] ---

export const GoNoGoDecisionPatchSchema = z.object({
  decision: z.enum(["go", "no-go"]),
});

// --- Radar: PATCH /api/radar/opportunities/[id] ---

export const OpportunityStatusPatchSchema = z.object({
  status: z.enum(["dismissed", "analyzing"]),
});
