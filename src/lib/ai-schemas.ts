import { z } from "zod";

// --- RFP Analyzer ---

export const RfpAnalysisSchema = z.object({
  title: z.string(),
  client: z.string(),
  deadline: z.string().nullable(),
  summary: z.string(),
  requirements: z.array(
    z.object({
      category: z.string(),
      description: z.string(),
      priority: z.enum(["must", "should", "nice-to-have"]),
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

// --- Bid Generator AI sections ---

export const ProseResponseSchema = z.object({
  text: z.string(),
});

export const BulletsResponseSchema = z.object({
  items: z.array(z.string()),
});

export const PhasesResponseSchema = z.object({
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

export const TeamResponseSchema = z.object({
  members: z.array(
    z.object({
      consultantId: z.string(),
      name: z.string(),
      role: z.string(),
      relevantExperience: z.string(),
      keyCompetencies: z.array(z.string()),
    })
  ),
});

export const ReferencesResponseSchema = z.object({
  references: z.array(
    z.object({
      title: z.string(),
      client: z.string(),
      year: z.number(),
      description: z.string(),
      relevance: z.string(),
    })
  ),
});

export const AI_SECTION_SCHEMAS: Record<string, z.ZodType> = {
  understanding: ProseResponseSchema,
  "value-proposition": BulletsResponseSchema,
  "execution-plan": PhasesResponseSchema,
  quality: ProseResponseSchema,
  risks: BulletsResponseSchema,
  team: TeamResponseSchema,
  references: ReferencesResponseSchema,
  summary: ProseResponseSchema,
};
