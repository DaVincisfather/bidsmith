import { z } from "zod";
import { ConsultantExtractionSchema } from "./ai-schemas";
import { OverflowFlagSchema } from "./pptx-template/budget-types";

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
    overflowFlags: OverflowFlagSchema.array().optional(),
  })
  .refine(
    (v) => v.outcome !== undefined || v.sections !== undefined || v.overflowFlags !== undefined,
    { message: "No valid fields to update" },
  );

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
// Reuses ConsultantExtractionSchema's level enum, but redeklarerar barn-arrayerna
// så `evidence` blir VALFRITT (extraktionsschemat kräver det, min(1)). Skälet:
// klienten round-tripar persisterade citat men manuellt tillagda poster saknar
// citat, och en redigering ska inte 400:a bara för att ett fält är obeklätt.
// Öppenheten är ofarlig eftersom rutten RE-VERIFIERAR varje citat mot CV-texten
// före persist — schemat vaktar form, inte äkthet.
export const ConsultantUpdateSchema = z.object({
  name: z.string().min(1),
  level: ConsultantExtractionSchema.shape.level,
  yearsExperience: z.number(),
  summary: z.string(),
  competencies: z
    .array(
      z.object({
        competency: z.string(),
        category: z.enum(["technical", "domain", "methodology", "certification"]),
        evidence: z.string().optional(),
      }),
    )
    .min(1)
    .optional(),
  references: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
        year: z.number(),
        sector: z.enum(["public", "private"]),
        evidence: z.string().optional(),
      }),
    )
    .optional(),
});

// --- Bid: POST /api/bids/[id]/shorten ---
//
// Kortar om ett enskilt flaggat fälts text till ≤ budget via skrivmodellen.

export const ShortenRequestSchema = z.object({
  // Övre gräns: ett enskilt fält är aldrig enormt; skyddar mot att ett absurt
  // långt innehåll trunkerar LLM-svaret mot maxTokens-taket (→ förvirrande 500).
  text: z.string().min(1).max(8000),
  budget: z.number().int().positive(),
  fieldLabel: z.string().min(1),
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

// --- Org profile: POST /api/profiles, PATCH /api/profiles/[id] ---
//
// company_name etc. är snake_case i DB — routern mappar. logo_path sätts inte
// via detta API (utanför scope för fas 2). PATCH använder .partial() så ett
// delfält kan uppdateras isolerat.

export const ProfileBodySchema = z.object({
  companyName: z.string().min(1).max(200),
  tonality: z.string().max(2000).nullable().optional(),
  boilerplate: z.string().max(4000).nullable().optional(),
  colors: z.record(z.string(), z.string()).nullable().optional(),
});
