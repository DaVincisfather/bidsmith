export interface RfpRequirement {
  category: string;
  description: string;
  priority: "must" | "should" | "nice-to-have";
}

export interface EvaluationCriterion {
  name: string;
  weight: number; // percentage, 0-100
  description: string;
}

export interface RfpAnalysis {
  title: string;
  client: string;
  deadline: string | null;
  summary: string;
  requirements: RfpRequirement[];
  evaluationCriteria: EvaluationCriterion[];
  requiredCompetencies: string[];
  estimatedScope: string;
  redFlags: string[];
  domain: string;
}

export interface AnalysisRecord {
  id: string;
  fileName: string;
  fileUrl: string;
  analysis: RfpAnalysis;
  createdAt: string;
}

// --- M1: Consultant Profiles & Matching ---

export type ConsultantLevel = "junior" | "intermediate" | "senior" | "expert";
export type CompetencyCategory = "technical" | "domain" | "methodology" | "certification";
export type Sector = "public" | "private";

export interface ConsultantCompetency {
  id?: string;
  competency: string;
  category: CompetencyCategory;
}

export interface ConsultantReference {
  id?: string;
  title: string;
  description: string;
  year: number;
  sector: Sector;
}

export interface ConsultantExtraction {
  name: string;
  level: ConsultantLevel;
  yearsExperience: number;
  summary: string;
  competencies: ConsultantCompetency[];
  references: ConsultantReference[];
}

export interface Consultant {
  id: string;
  organizationId: string;
  name: string;
  level: ConsultantLevel;
  yearsExperience: number | null;
  summary: string | null;
  rawCvText: string | null;
  competencies: ConsultantCompetency[];
  references: ConsultantReference[];
  createdAt: string;
  updatedAt: string;
}

export interface ScoredConsultant {
  consultantId: string;
  consultantName: string;
  level: ConsultantLevel;
  score: number;
  reasoning: string;
}

export interface ScoredMatchResult {
  scoredConsultants: ScoredConsultant[];
}

export interface MatchRecord {
  id: string;
  analysisId: string;
  organizationId: string;
  scoredConsultants: ScoredConsultant[];
  createdAt: string;
}

// --- M1.5: Go/No-Go Agent ---

export interface MustRequirementCheck {
  requirement: string;
  met: boolean;
  coveredBy: string | null;
}

export interface ImprovementSuggestion {
  swap: { remove: string; add: string };
  swapIds: { removeId: string; addId: string };
  estimatedImpact: string;
  reason: string;
}

export type GoNoGoRecommendation = "go" | "no-go" | "go-with-reservations";

export interface GoNoGoResult {
  mustRequirements: MustRequirementCheck[];
  winProbability: number;
  winProbabilityReasoning: string;
  strengths: string[];
  gaps: string[];
  improvements: ImprovementSuggestion[];
  recommendation: GoNoGoRecommendation;
  reasoning: string;
}

export type GoNoGoDecision = "pending" | "go" | "no-go";

export interface GoNoGoAssessment {
  id: string;
  analysisId: string;
  organizationId: string;
  teamConsultantIds: string[];
  result: GoNoGoResult;
  decision: GoNoGoDecision;
  decisionAt: string | null;
  createdAt: string;
}
