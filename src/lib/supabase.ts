import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  Consultant,
  CompetencyCategory,
  Sector,
  GoNoGoResult,
  ConsultantExtraction,
} from "./types";
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

/**
 * Skapar eller uppdaterar en konsult ur en CV-extraktion, matchad på namn
 * (case-insensitivt). Finns namnet redan → uppdatera raden och ERSÄTT barnen
 * (kompetenser/referenser speglar det nya CV:t) i stället för att skapa en dubblett.
 * Namn har ingen unik DB-constraint → uppslag i app-lagret. Returnerar id + om det
 * var en uppdatering.
 */
export async function upsertConsultant(
  supabase: SupabaseClient,
  extraction: ConsultantExtraction,
  rawText: string,
): Promise<{ consultantId: string; updated: boolean }> {
  const row = {
    name: extraction.name,
    level: extraction.level,
    years_experience: extraction.yearsExperience,
    summary: extraction.summary,
    raw_cv_text: rawText,
  };

  // Matcha på namn case-insensitivt. Escapa LIKE-metatecken (%/_/\) så ett namn som
  // råkar innehålla dem inte matchar fel rad. limit(1) + äldsta först → maybeSingle
  // kastar inte om det redan finns dubbletter (legacy-data) utan uppdaterar en av dem.
  const likePattern = extraction.name.trim().replace(/[\\%_]/g, "\\$&");
  const { data: existing, error: lookupError } = await supabase
    .from("consultants")
    .select("id")
    .ilike("name", likePattern)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);

  let consultantId: string;
  let updated: boolean;

  if (existing) {
    consultantId = (existing as { id: string }).id;
    updated = true;
    const { error: updateError } = await supabase
      .from("consultants")
      .update(row)
      .eq("id", consultantId);
    if (updateError) throw new Error(updateError.message);
    // Ersätt barnen — CV:t skrivs om, gamla kompetenser/referenser ska inte ligga kvar.
    const { error: delCompError } = await supabase
      .from("consultant_competencies")
      .delete()
      .eq("consultant_id", consultantId);
    if (delCompError) throw new Error(delCompError.message);
    const { error: delRefError } = await supabase
      .from("consultant_references")
      .delete()
      .eq("consultant_id", consultantId);
    if (delRefError) throw new Error(delRefError.message);
  } else {
    const { data: inserted, error: insertError } = await supabase
      .from("consultants")
      .insert(row)
      .select()
      .single();
    if (insertError) throw new Error(insertError.message);
    consultantId = (inserted as { id: string }).id;
    updated = false;
  }

  if (extraction.competencies.length > 0) {
    const { error } = await supabase.from("consultant_competencies").insert(
      extraction.competencies.map((c) => ({
        consultant_id: consultantId,
        competency: c.competency,
        category: c.category,
        // Vaktens verifierade källcitat (migration 009). null = flaggad/obelagd —
        // källa-badgen och fas C:s matchnings-policy läser detta.
        evidence: c.evidence ?? null,
      })),
    );
    if (error) throw new Error(error.message);
  }
  if (extraction.references.length > 0) {
    const { error } = await supabase.from("consultant_references").insert(
      extraction.references.map((r) => ({
        consultant_id: consultantId,
        title: r.title,
        description: r.description,
        year: r.year,
        sector: r.sector,
        // Se kompetens-kommentaren ovan (migration 009).
        evidence: r.evidence ?? null,
      })),
    );
    if (error) throw new Error(error.message);
  }

  return { consultantId, updated };
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
