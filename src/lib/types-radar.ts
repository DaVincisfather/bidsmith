export interface OrganizationCompetency {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  cpvCodes: string[];
  createdAt: string;
  updatedAt: string;
}

export type OpportunityStatus = "new" | "scored" | "dismissed" | "analyzing";

export interface RfpOpportunity {
  id: string;
  tedNoticeId: string;
  title: string;
  buyer: string | null;
  country: string;
  cpvCodes: string[];
  deadline: string | null;
  estimatedValue: number | null;
  summary: string | null;
  tedUrl: string | null;
  relevanceScore: number | null;
  relevanceReasoning: string | null;
  status: OpportunityStatus;
  analysisId: string | null;
  fetchedAt: string;
  scoredAt: string | null;
  createdAt: string;
}

export interface OpportunityScore {
  relevanceScore: number;
  reasoning: string;
}
