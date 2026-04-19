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
  background?: string;
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

// --- M2: Bid Generation ---

export interface ExecutionPhase {
  name: string;
  objective: string;
  activities: string[];
  deliverables: string[];
  duration: string;
  risks?: string[];
  hoursEstimate?: number;
  period?: string;
}

export interface TeamPresentation {
  consultantId: string;
  name: string;
  role: string;
  relevantExperience: string;
  keyCompetencies: string[];
}

export interface BidReference {
  title: string;
  client: string;
  year: number;
  description: string;
  relevance: string;
}

export interface RequirementRow {
  requirement: string;
  priority: "must" | "should" | "nice-to-have";
  coverage: Record<string, boolean>;
}

export type BidSectionContent =
  | { format: "prose"; text: string }
  | { format: "bullets"; items: string[] }
  | { format: "phases"; phases: ExecutionPhase[] }
  | { format: "team"; members: TeamPresentation[] }
  | { format: "references"; references: BidReference[] }
  | { format: "requirement-matrix"; rows: RequirementRow[]; consultantNames: Record<string, string> }
  | { format: "cover"; title: string; client: string; date: string }
  | { format: "placeholder"; instruction: string }
  | { format: "section-divider"; sectionNumber: number; subtitle: string }
  | { format: "three-column"; columns: { title: string; icon: string; body: string }[] }
  | { format: "gantt"; phases: ExecutionPhase[]; milestones?: { label: string; afterPhase: number }[] };

export interface BidSection {
  type: "ai" | "data" | "placeholder";
  key: string;
  title: string;
  content: BidSectionContent;
  generatedAt: string;
}

export type BidStatus = "generating" | "draft" | "exported";
export type BidOutcome = "won" | "lost" | "no-bid" | "cancelled";

export interface Bid {
  id: string;
  analysisId: string;
  assessmentId: string | null;
  organizationId: string;
  teamConsultantIds: string[];
  sections: BidSection[];
  status: BidStatus;
  outcome: BidOutcome | null;
  exportedAt: string | null;
  createdAt: string;
}

export interface StyleGuide {
  colors: {
    primary: string;
    primaryLight: string;
    secondary: string;
    secondaryLight: string;
    accent: string;
    dark: string;
    light: string;
    muted: string;
  };
  font: string;
  logoUrl: string;
}

// --- RFP Dashboard types ---

export type Urgency = "urgent" | "soon" | "later";
export type LossReason = "pris" | "erfarenhet" | "team" | "kvalitet" | "relation" | "annat";

export interface PipelineItem {
  id: string;                     // opportunityId OR documentId
  source: "ted" | "upload";
  title: string;
  deadline: string;               // ISO date
  daysLeft: number;
  urgency: Urgency;
  relevanceScore: number | null;  // TED only
  analysisId: string | null;      // exists once analyzed (upload always, TED after analyze)
  tedUrl: string | null;          // TED only
}

export interface BidSummary {
  id: string;
  title: string;
  exportedAt: string;
  teamNames: string[];
  outcome: BidOutcome | null;
  outcomeLoggedAt: string | null;
  competitorName: string | null;
  lossReason: LossReason | null;
  lossComment: string | null;
}

export interface PipelineStats {
  awaitingCount: number;
  loggedCount: number;
  wonCount: number;
  lostCount: number;
}

export interface OutcomePatch {
  outcome: BidOutcome;
  competitorName?: string;
  lossReason?: LossReason;
  lossComment?: string;
}
