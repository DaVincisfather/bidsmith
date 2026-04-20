import { z } from "zod";

// --- Analyzer fixture ---

export const AnalyzerGoldenSchema = z.object({
  title: z.string(),
  client: z.string(),
  deadline: z.string().nullable(),
  summary: z.string(),
  domain: z.string(),
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
  oslReference: z.string().nullable().default(null),
  secrecyRows: z.array(z.object({
    reference: z.string(),
    scope: z.string(),
    justification: z.string(),
  })).default([]),
});

export const AnalyzerFixtureSchema = z.object({
  id: z.string(),
  source_url: z.string().optional(),
  notes: z.string().optional(),
  rfp_text: z.string(),
  golden: AnalyzerGoldenSchema,
});

export type AnalyzerFixture = z.infer<typeof AnalyzerFixtureSchema>;

// --- Synthetic consultant pool ---

export const ParsedProfileSchema = z.object({
  name: z.string(),
  level: z.enum(["junior", "intermediate", "senior", "expert"]),
  yearsExperience: z.number(),
  summary: z.string(),
  competencies: z.array(z.string()),
  projects: z.array(
    z.object({
      client: z.string(),
      role: z.string(),
      years: z.string(),
      description: z.string(),
    })
  ),
});

export const SyntheticConsultantSchema = z.object({
  id: z.string(),
  match_profile: z.object({
    intent: z.string(),
    cv_format: z.string(),
    must_haves_demonstrated: z.array(z.string()),
  }),
  cv_text: z.string(),
  parsed_profile: ParsedProfileSchema,
});

export const ConsultantPoolSchema = z.object({
  consultants: z.array(SyntheticConsultantSchema),
});

export type SyntheticConsultant = z.infer<typeof SyntheticConsultantSchema>;

// --- Matcher fixture ---

export const MatcherFixtureSchema = z.object({
  id: z.string(),
  analyzer_fixture: z.string(),
  consultant_ids: z.array(z.string()),
  mode: z.enum(["isolated", "end_to_end"]).default("isolated"),
  golden: z.object({
    evaluation_method: z.enum(["top_k", "full_rank"]),
    expected_top_k: z.object({
      k: z.number(),
      must_contain: z.array(z.string()),
    }),
    must_have_coverage: z.object({
      enabled: z.boolean(),
      judge_model: z.string().default("claude-sonnet-4-6"),
      required_threshold: z.number().min(0).max(1).default(0.8),
    }),
    reasoning_rubric: z.string().optional(),
  }),
});

export type MatcherFixture = z.infer<typeof MatcherFixtureSchema>;
