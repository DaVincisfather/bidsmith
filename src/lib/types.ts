export interface RfpRequirement {
  category: string;
  description: string;
  priority: "must" | "should" | "nice-to-have";
  // qualification = krav på anbudsgivaren (bär priority); deliverable = leverans uppdraget
  // ska producera. Håller leverabler ute ur ska/bör-krav + kravmatrisen. Valfritt i typen
  // (Zod-schemat defaultar till "qualification" vid parse); saknat värde ⇒ qualification.
  kind?: "qualification" | "deliverable";
  /**
   * Ordagrant citat ur källdokumentet som grundar kravet (evidens-förankring).
   * Modellen TVINGAS alltid citera (obligatoriskt i output-schemat), men läs-typen
   * är valfri så tidigare lagrade analyser — skrivna innan fältet fanns — fortsatt parsar.
   */
  evidence?: string;
}

export interface EvaluationCriterion {
  name: string;
  weight: number | null; // percentage 0-100, or null when the source gives no percent weighting
  description: string;
}

export interface SecrecyRow {
  reference: string;      // e.g. "Bilaga 2"
  scope: string;
  justification: string;
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
  oslReference: string | null;      // NEW — OSL paragraph (e.g. "19 kap 3 §") or null
  secrecyRows: SecrecyRow[];        // NEW — what the RFP asks to be classified (may be empty)
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
  /**
   * Ordagrant citat ur CV-texten som grundar kompetensen (evidens-förankring,
   * fas B). Modellen TVINGAS citera (obligatoriskt i output-schemat), men läs-typen
   * är valfri: konsulter lagrade före fältet parsar oförändrat, och runtime-vakten
   * kan STRIPPA ett overifierbart citat (undefined = flaggat, kompetensen behålls).
   */
  evidence?: string;
}

export interface ConsultantReference {
  id?: string;
  title: string;
  description: string;
  year: number;
  sector: Sector;
  /** Ordagrant CV-citat som grundar referensuppdraget (fas B). Se ConsultantCompetency.evidence. */
  evidence?: string;
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
  name: string;
  level: ConsultantLevel;
  yearsExperience: number | null;
  summary: string | null;
  rawCvText: string | null;
  competencies: ConsultantCompetency[];
  references: ConsultantReference[];
  // Extraktions-generation (migration 011). null = extraherad före evidens-featuren
  // (äkta legacy); non-null = evidens-förankrade generationen → grundnings-grinden är
  // ALLTID på för raden (all-strippad ≠ legacy). Se extraction-version.ts. Valfri i
  // typen (additivt, bakåtkompat) — mapConsultantRow sätter den alltid (null vid legacy),
  // äldre fixtures/anropare som utelämnar den behandlas som legacy (== null).
  extractionVersion?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScoredConsultant {
  consultantId: string;
  consultantName: string;
  level: ConsultantLevel;
  score: number;
  reasoning: string;
  // Set when the prefilter model omitted this consultant and the score is a
  // defensive default (0), not a real assessment. Lets UI/evals tell a real
  // zero from an unscored one.
  prefilterMiss?: boolean;
}

export interface ScoredMatchResult {
  scoredConsultants: ScoredConsultant[];
}

export interface MatchRecord {
  id: string;
  analysisId: string;
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
  // Nullable throughout when the suggestion isn't a concrete consultant swap;
  // the evaluator filters these out so persisted/rendered improvements always
  // have a real remove/add pair.
  swap: { remove: string | null; add: string | null } | null;
  swapIds: { removeId: string | null; addId: string | null } | null;
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

// --- Removed: TeamPresentation, BidReference, RequirementRow — v1 formats removed in M2. ---

export type BidSectionContent =
  | { format: "cover"; title: string; client: string; date: string }
  | { format: "phases"; phases: ExecutionPhase[] }
  | {
      format: "understanding-current";
      organisation: string;
      system: string;
      processer: string;
      smärtpunkter: string[]; // slot cap 4
    }
  | {
      format: "understanding-assignment";
      stycken: string[]; // slot cap 3
    }
  | {
      format: "understanding-vision";
      utmaningar: string[]; // slot cap 4
      värden: string[];     // slot cap 4
    }
  | {
      format: "quality-assurance";
      qaProcess: string[]; // slot cap 2
      qualityLead: { name: string; roleAndMandate: string; contact: string };
      escalation: { process: string; reporting: string };
      checkpoints: string[]; // slot cap 4
    }
  | {
      format: "team-pricing";
      members: Array<{
        name: string;
        role: string;
        omfattningPct: number;
        timpris: number | null;   // null until company fills in
        timmar: number;
        total: number | null;     // timpris * timmar, or null when timpris is null
      }>;
      summary?: { totalTimmar: number; totalPris: number | null };
    }
  | {
      format: "requirement-matrix-v2";
      rows: Array<{
        requirement: string;
        hurUppfylls: string;
        referens: string;
        coverage: Array<{
          consultantName: string;
          status: "JA" | "NEJ" | "DELVIS";
          evidence: string;
        }>;
        met?: boolean;
      }>;
    }
  | {
      format: "reference-v2";
      references: Array<{
        clientName: string;
        contextLine: string;
        organisation: string;
        startDate: string;
        endDate: string;
        scope: string;
        contact: { name: string; titlePhoneEmail: string };
        roleAndDelivery: string;
        result: string;
      }>;
    }
  | {
      format: "confidentiality";
      oslReference: string;
      secrecyRows: Array<{
        reference: string;
        scope: string;
        justification: string;
      }>; // slot cap 4
    }
  | {
      format: "certifications";
      certs: Array<{
        name?: string;
        description?: string;
        number: string;
        validUntil: string;
      }>; // slot cap 4
    }
  | {
      // Fallback prose for a template slot we have no specialised generator for
      // (template-upload slice 4). Carries its own placeholder so the
      // profile-driven renderer matches the section to the exact slot it fills.
      format: "generic-prose";
      placeholder: string;
      text: string;
    };

export interface BidSection {
  type: "ai" | "data" | "placeholder";
  key: string;
  title: string;
  content?: BidSectionContent;
  generatedAt: string;
}

export type BidStatus = "generating" | "draft" | "exported" | "failed";
export type BidOutcome = "won" | "lost" | "no-bid" | "cancelled";

export interface Bid {
  id: string;
  analysisId: string;
  assessmentId: string | null;
  createdBy: string | null;
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
  /** ISO date; null when the analysis carries no extractable deadline (BUG-B:
   *  deadline-less analyses must still surface in the pipe, sorted last). */
  deadline: string | null;
  daysLeft: number | null;
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
