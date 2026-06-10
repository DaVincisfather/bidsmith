import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Consultant, CompetencyCategory, Sector, GoNoGoResult } from "./types";
import { CONSULTANT_SELECT } from "./constants";

// Singleton — reuse across requests in the same process
let _client: SupabaseClient | null = null;

export function createServiceClient(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  _client = createClient(url, key);
  return _client;
}

export function mapConsultantRow(row: Record<string, unknown>): Consultant {
  return {
    id: row.id as string,
    name: row.name as string,
    level: row.level as Consultant["level"],
    yearsExperience: row.years_experience as number | null,
    summary: row.summary as string | null,
    rawCvText: null,
    competencies:
      (row.consultant_competencies as Array<{
        competency: string;
        category: CompetencyCategory;
      }>) || [],
    references:
      (row.consultant_references as Array<{
        title: string;
        description: string;
        year: number;
        sector: Sector;
      }>) || [],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function fetchConsultantsByIds(
  supabase: SupabaseClient,
  ids: string[]
): Promise<Consultant[]> {
  const { data, error } = await supabase
    .from("consultants")
    .select(CONSULTANT_SELECT)
    .in("id", ids);

  if (error || !data?.length) {
    throw new Error("Could not fetch consultants");
  }

  // .in() silently returns fewer rows when ids are stale (deleted consultant
  // still referenced by a team). A bid generated for a smaller team than
  // team_consultant_ids claims is worse than failing loudly here.
  const found = new Set(data.map((row: Record<string, unknown>) => row.id));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new Error(`Consultants not found: ${missing.join(", ")}`);
  }

  return data.map((row: Record<string, unknown>) => mapConsultantRow(row));
}

export const EMPTY_GO_NO_GO: GoNoGoResult = {
  mustRequirements: [],
  winProbability: 0,
  winProbabilityReasoning: "No Go/No-Go assessment available",
  strengths: [],
  gaps: [],
  improvements: [],
  recommendation: "go-with-reservations",
  reasoning: "No assessment performed",
};
