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
  diaryNumber?: string;
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
  /** Slide 7 — decisions the steering group makes at phase gate (slot cap 3) */
  decisions?: string[];
  /** Slide 6 — short subtitle for the phase card in phases-overview (Task 8) */
  shortDescription?: string;
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
  | { format: "gantt"; phases: ExecutionPhase[]; milestones?: { label: string; afterPhase: number }[] }
  // --- pptx-template pivot: slide-specific structured content ---
  /** Slide 3 — Kunden idag (Organisation/system/processer + Smärtpunkter) */
  | {
      format: "understanding-current";
      organisation: string;
      system: string;
      processer: string;
      smärtpunkter: string[]; // slot cap 4; unused slots replaced with ""
    }
  /** Slide 4 — Uppdragsbeskrivning (3 fixed paragraphs) */
  | {
      format: "understanding-assignment";
      stycken: string[]; // slot cap 3
    }
  /** Slide 5 — Utmaningar och värde */
  | {
      format: "understanding-vision";
      utmaningar: string[]; // slot cap 4
      värden: string[];     // slot cap 4
    }
  /** Slide 11 — Kvalitetssäkring */
  | {
      format: "quality-assurance";
      qaProcess: string[]; // slot cap 2 paragraphs
      qualityLead: {
        name: string;
        roleAndMandate: string;
        contact: string;
      };
      escalation: {
        process: string;
        reporting: string;
      };
      checkpoints: string[]; // slot cap 4
    }
  /** Slide 12 — team-pricing table (5 consultant rows + summary) */
  | {
      format: "team-pricing";
      members: Array<{
        name: string;
        role: string;
        omfattningPct: number;     // e.g. 50 for "50%"
        timpris: number;           // SEK per hour, e.g. 1850
        timmar: number;            // hours, e.g. 240
        total: number;             // computed: timpris * timmar (SEK)
      }>;
      // Summary row computed from members. Allow override if needed.
      summary?: { totalTimmar: number; totalPris: number };
    }
  /** Slide 13 — requirement-matrix table v2 (6 requirement rows) */
  | {
      format: "requirement-matrix-v2";
      rows: Array<{
        requirement: string;
        hurUppfylls: string;
        referens: string;
        met?: boolean;             // future use; default true
      }>;
    }
  /** Slide 14 — Reference (cloned per item) */
  | {
      format: "reference-v2";
      references: Array<{
        clientName: string;
        contextLine: string;
        organisation: string;
        startDate: string;          // "MM/ÅÅÅÅ"
        endDate: string;            // "MM/ÅÅÅÅ"
        scope: string;
        contact: { name: string; titlePhoneEmail: string };
        roleAndDelivery: string;
        result: string;
      }>;
    }
  /** Slide 16 — Confidentiality */
  | {
      format: "confidentiality";
      oslReference: string;         // e.g. "19 kap 3 §"
      secrecyRows: Array<{
        reference: string;          // e.g. "Bilaga 2"
        scope: string;
        justification: string;
      }>;                           // slot cap 4
    }
  /** Slide 17 — Certifications */
  | {
      format: "certifications";
      certs: Array<{
        name?: string;              // for card 4 only; cards 1-3 names are static in template
        description?: string;       // for card 4 only
        number: string;             // certificate number
        validUntil: string;         // "MM/ÅÅÅÅ"
      }>;                           // slot cap 4 (cards 1-3 are ISO 9001/27001/14001, card 4 is Övrig)
    };

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
