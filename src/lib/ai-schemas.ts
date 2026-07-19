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

// qualification = krav PÅ anbudsgivaren som bedöms/måste uppfyllas (kompetens, cert,
//   erfarenhet, uteslutningsgrunder, obligatoriska villkor) — bär priority ska/bör/kan.
// deliverable = det uppdraget ska PRODUCERA/leverera (rapporter, analyser, workshops).
// Separationen håller leverabler ute ur ska/bör-krav + kravmatrisen. kind är
// OBLIGATORISKT i modell-output (BUG-A: .default gjorde fältet utelämnbart i
// structured outputs — varje utelämnad/misslyckad klassning blev tyst
// "qualification" och leveranser läckte in i ska-kraven; required tvingar
// modellen att välja per krav). Läs-typen RfpRequirement.kind förblir valfri
// (lagrade legacy-analyser saknar fältet).
export const RfpRequirementSchema = z.object({
  category: z.string(),
  description: z.string(),
  priority: PrioritySchema,
  kind: z.enum(["qualification", "deliverable"]),
  // OBLIGATORISKT i modell-output (min(1)): varje krav MÅSTE bära ett ordagrant
  // källcitat så den mekaniska verifieraren (verify-evidence.ts) kan sträng-matcha
  // det mot källdokumentet. Läs-typen RfpRequirement.evidence är valfri (bakåtkompat
  // med analyser lagrade före fältet) — det är BARA modellens output som tvingas citera.
  evidence: z.string().min(1),
});

export const RfpAnalysisSchema = z.object({
  title: z.string(),
  client: z.string(),
  deadline: z.string().nullable(),
  summary: z.string(),
  background: z.string().optional(),
  diaryNumber: z.string().optional(),
  // min(1): en RFP utan krav existerar inte — noll extraherade krav är per
  // definition ett degenererat svar. Belagt i noll-hallucinationsloopens varv 1
  // (2026-07-03): samma 54k-token-dokument gav 235 output-tokens (0 krav) i en
  // körning och 4876 (20 krav) i nästa — Sonnet 5 saknar temperature-styrning,
  // så variansen måste fångas. Zod-missen blir ResponseFormatError →
  // callClaudes format-retry re-promptar automatiskt.
  requirements: z.array(RfpRequirementSchema).min(1),
  evaluationCriteria: z.array(
    z.object({
      name: z.string(),
      // null = källan anger ingen procentvikt (rangordning/prisavdrag är vanligt
      // i svenska upphandlingar) — ett number-krav tvingar modellen att fabricera
      weight: z.number().nullable(),
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
      // Nullable throughout: when there's no concrete swap to suggest (strong
      // team / "go"), the model returns either swap:null or an object with null
      // leaves (e.g. { remove: null, add: null }). The evaluator drops these
      // post-parse, so only actionable swaps reach the UI.
      swap: z
        .object({ remove: z.string().nullable(), add: z.string().nullable() })
        .nullable(),
      swapIds: z
        .object({ removeId: z.string().nullable(), addId: z.string().nullable() })
        .nullable(),
      estimatedImpact: z.string(),
      reason: z.string(),
    })
  ),
  recommendation: z.enum(["go", "no-go", "go-with-reservations"]),
  reasoning: z.string(),
});

// AI-svarsformatet för go/no-go (latensfix): modellen återger inte varje
// ska-kravs text — den svarar med index in i den numrerade kravlistan
// evaluatorn bygger i userContent. Evaluatorn hydrerar tillbaka till
// GoNoGoResultSchema (requirement = kravtext) efter parse. Se
// go-no-go-evaluator.ts.
export const GoNoGoAiResponseSchema = GoNoGoResultSchema.extend({
  mustRequirements: z.array(
    z.object({
      index: z.number().int().positive(),
      met: z.boolean(),
      coveredBy: z.string().nullable(),
    })
  ),
});

// --- Consultant Extractor ---

export const ConsultantExtractionSchema = z.object({
  name: z.string(),
  level: z.enum(["junior", "intermediate", "senior", "expert"]),
  yearsExperience: z.number(),
  summary: z.string(),
  // evidence (min(1)): OBLIGATORISKT i modell-output på matchnings-KRITISKA påståenden
  // (kompetenser, referensuppdrag) — en hallucinerad kompetens är den direkta
  // falsk-match-vägen i matchern. Verify-evidence.ts sträng-matchar citatet mot
  // CV-texten (fas B). Läs-typerna (ConsultantCompetency/Reference.evidence) är
  // valfria: äldre lagrade konsulter parsar oförändrat, och runtime-vakten strippar
  // overifierbara citat till undefined. level/yearsExperience/summary bär INTE citat —
  // de är sanktionerade bedömningar (promptens "rimlig bedömning" gäller bara dem).
  competencies: z
    .array(
      z.object({
        competency: z.string(),
        category: z.enum(["technical", "domain", "methodology", "certification"]),
        evidence: z.string().min(1),
      })
    )
    // min(1): ett CV utan en enda kompetens är ett degenererat svar (samma
    // rationale som requirements.min(1)) → ResponseFormatError + format-retry.
    .min(1),
  // references får vara tom: ett junior-CV utan listade uppdrag är legitimt.
  references: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      year: z.number(),
      sector: z.enum(["public", "private"]),
      evidence: z.string().min(1),
    })
  ),
});

// --- Radar: Opportunity Scoring ---

export const OpportunityScoreSchema = z.object({
  relevanceScore: z.number().min(0).max(100),
  reasoning: z.string(),
});

// --- Auto-korta fält: POST /api/bids/[id]/shorten ---

export const ShortenedTextSchema = z.object({
  text: z.string().min(1),
});
