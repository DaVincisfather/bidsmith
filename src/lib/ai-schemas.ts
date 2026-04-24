import { z } from "zod";

// --- RFP Analyzer ---

// Coerce priority values from LLM output. Swedish RFPs often use "ska-krav"/"bör-krav"
// as natural language, and models drift to those (and to capitalized / underscore /
// English-synonym variants) on long requirement lists. We normalize at the boundary.
const PRIORITY_MAP: Record<string, "must" | "should" | "nice-to-have"> = {
  must: "must",
  should: "should",
  "nice-to-have": "nice-to-have",
  // Swedish
  ska: "must",
  skall: "must",
  "ska-krav": "must",
  "skall-krav": "must",
  skakrav: "must",
  skallkrav: "must",
  bör: "should",
  bor: "should",
  "bör-krav": "should",
  "bor-krav": "should",
  borkrav: "should",
  börkrav: "should",
  kan: "nice-to-have",
  "kan-krav": "nice-to-have",
  kankrav: "nice-to-have",
  önskemål: "nice-to-have",
  onskemal: "nice-to-have",
  // English synonyms and spacing/casing variants
  "nice to have": "nice-to-have",
  nice_to_have: "nice-to-have",
  nicetohave: "nice-to-have",
  mandatory: "must",
  required: "must",
  optional: "nice-to-have",
  recommended: "should",
};

export const PrioritySchema = z.preprocess((val) => {
  if (typeof val !== "string") return val;
  const key = val.trim().toLowerCase();
  return PRIORITY_MAP[key] ?? val;
}, z.enum(["must", "should", "nice-to-have"]));

export const SecrecyRowSchema = z.object({
  reference: z.string(),
  scope: z.string(),
  justification: z.string(),
});

export const RfpAnalysisSchema = z.object({
  title: z.string(),
  client: z.string(),
  deadline: z.string().nullable(),
  summary: z.string(),
  background: z.string().optional(),
  diaryNumber: z.string().optional(),
  requirements: z.array(
    z.object({
      category: z.string(),
      description: z.string(),
      priority: PrioritySchema,
    })
  ),
  evaluationCriteria: z.array(
    z.object({
      name: z.string(),
      weight: z.number(),
      description: z.string(),
    })
  ),
  requiredCompetencies: z.array(z.string()),
  estimatedScope: z.string(),
  redFlags: z.array(z.string()),
  domain: z.string(),
  oslReference: z.string().nullable(),
  secrecyRows: z.array(SecrecyRowSchema),
});

// --- Consultant Matcher ---

export const ScoredMatchResultSchema = z.object({
  scoredConsultants: z.array(
    z.object({
      consultantId: z.string(),
      consultantName: z.string(),
      level: z.enum(["junior", "intermediate", "senior", "expert"]),
      score: z.number().min(0).max(100),
      reasoning: z.string(),
    })
  ),
});

// --- Go/No-Go Evaluator ---

export const GoNoGoResultSchema = z.object({
  mustRequirements: z.array(
    z.object({
      requirement: z.string(),
      met: z.boolean(),
      coveredBy: z.string().nullable(),
    })
  ),
  winProbability: z.number().min(0).max(100),
  winProbabilityReasoning: z.string(),
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  improvements: z.array(
    z.object({
      swap: z.object({ remove: z.string(), add: z.string() }),
      swapIds: z.object({ removeId: z.string(), addId: z.string() }),
      estimatedImpact: z.string(),
      reason: z.string(),
    })
  ),
  recommendation: z.enum(["go", "no-go", "go-with-reservations"]),
  reasoning: z.string(),
});

// --- Bid Generator: phases schema (v2) ---

export const PhasesV2Schema = z.object({
  phases: z.array(
    z.object({
      name: z.string(),
      objective: z.string(),
      activities: z.array(z.string()),
      deliverables: z.array(z.string()),
      duration: z.string(),
      risks: z.array(z.string()).optional(),
      hoursEstimate: z.number().optional(),
      period: z.string().optional(),
    })
  ),
});

// --- Consultant Extractor ---

export const ConsultantExtractionSchema = z.object({
  name: z.string(),
  level: z.enum(["junior", "intermediate", "senior", "expert"]),
  yearsExperience: z.number(),
  summary: z.string(),
  competencies: z.array(
    z.object({
      competency: z.string(),
      category: z.enum(["technical", "domain", "methodology", "certification"]),
    })
  ),
  references: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      year: z.number(),
      sector: z.enum(["public", "private"]),
    })
  ),
});

// --- Radar: Opportunity Scoring ---

export const OpportunityScoreSchema = z.object({
  relevanceScore: z.number().min(0).max(100),
  reasoning: z.string(),
});
