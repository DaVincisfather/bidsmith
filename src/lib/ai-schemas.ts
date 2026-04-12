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

export const ThreeColumnResponseSchema = z.object({
  columns: z.tuple([
    z.object({ title: z.string(), icon: z.string(), body: z.string() }),
    z.object({ title: z.string(), icon: z.string(), body: z.string() }),
    z.object({ title: z.string(), icon: z.string(), body: z.string() }),
  ]),
});

// Map from AI-generating section kind to its response schema.
// Non-AI kinds (cover, toc, divider, gantt, requirement-matrix, placeholder)
// are deterministic and do not appear here.
export const FORMAT_SCHEMAS = {
  prose: ProseResponseSchema,
  bullets: BulletsResponseSchema,
  "three-column": ThreeColumnResponseSchema,
  phases: PhasesResponseSchema,
  team: TeamResponseSchema,
  references: ReferencesResponseSchema,
} as const;

// --- Bid Planner ---

export const PlannedSectionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("cover"),
    semanticKey: z.string().optional(),
  }),
  z.object({
    kind: z.literal("toc"),
    title: z.string(),
    semanticKey: z.string().optional(),
  }),
  z.object({
    kind: z.literal("divider"),
    number: z.number(),
    title: z.string(),
    subtitle: z.string(),
    semanticKey: z.string().optional(),
  }),
  z.object({
    kind: z.literal("prose"),
    title: z.string(),
    promptHint: z.string(),
    semanticKey: z.string().optional(),
  }),
  z.object({
    kind: z.literal("bullets"),
    title: z.string(),
    promptHint: z.string(),
    minItems: z.number().optional(),
    semanticKey: z.string().optional(),
  }),
  z.object({
    kind: z.literal("three-column"),
    title: z.string(),
    columnHints: z.tuple([z.string(), z.string(), z.string()]),
    semanticKey: z.string().optional(),
  }),
  z.object({
    kind: z.literal("phases"),
    title: z.string(),
    promptHint: z.string(),
    semanticKey: z.string().optional(),
  }),
  z.object({
    kind: z.literal("gantt"),
    title: z.string(),
    semanticKey: z.string().optional(),
  }),
  z.object({
    kind: z.literal("team"),
    title: z.string(),
    preferredSize: z.number().optional(),
    semanticKey: z.string().optional(),
  }),
  z.object({
    kind: z.literal("requirement-matrix"),
    title: z.string(),
    semanticKey: z.string().optional(),
  }),
  z.object({
    kind: z.literal("references"),
    title: z.string(),
    minCount: z.number().optional(),
    semanticKey: z.string().optional(),
  }),
  z.object({
    kind: z.literal("placeholder"),
    title: z.string(),
    instruction: z.string(),
    reason: z.enum(["manual-fill", "unmapped-requirement"]).optional(),
    semanticKey: z.string().optional(),
  }),
]);

export const BidPlanSchema = z.object({
  language: z.enum(["sv", "en"]),
  sections: z.array(PlannedSectionSchema),
  unmappedRequirements: z.array(z.string()).optional(),
  rationale: z.string().optional(),
});
