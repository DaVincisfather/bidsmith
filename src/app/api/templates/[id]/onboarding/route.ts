import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { requireUser, parseUuidParam, parseBody } from "@/lib/api-helpers";
import { OnboardingDecisionSchema } from "@/lib/api-schemas";
import { parseOnboardingDraft } from "@/lib/pptx-template/onboarding/draft";
import { applyDecision } from "@/lib/pptx-template/onboarding/draft-logic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Läser mall-raden och normaliserar onboarding_draft-kolumnens tre payloads:
 *  utkast (schema-validerat), { error } (klassificeringsfel), { precount }
 *  (satt av upload, före klassificering). */
async function loadOnboardingRow(id: string) {
  const supabase = createServiceClient();
  const { data: row, error } = await supabase
    .from("templates")
    .select("id, name, version, storage_path, onboarding_status, onboarding_draft")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return row;
}

function draftPayload(raw: unknown): {
  draft: ReturnType<typeof parseOnboardingDraft> | null;
  error?: string;
  precount?: { slides: number; candidates: number };
} {
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.error === "string") return { draft: null, error: obj.error };
    if (obj.precount) return { draft: null, precount: obj.precount as { slides: number; candidates: number } };
    return { draft: parseOnboardingDraft(raw) };
  }
  return { draft: null };
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const authed = await createClient();
  const auth = await requireUser(authed);
  if (!auth.ok) return auth.response;

  const { id: rawId } = await params;
  const idResult = parseUuidParam(rawId, "template id");
  if (!idResult.ok) return idResult.response;

  const row = await loadOnboardingRow(idResult.data);
  if (!row) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  return NextResponse.json({
    status: row.onboarding_status,
    name: row.name,
    version: row.version,
    ...draftPayload(row.onboarding_draft),
  });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const authed = await createClient();
  const auth = await requireUser(authed);
  if (!auth.ok) return auth.response;

  const { id: rawId } = await params;
  const idResult = parseUuidParam(rawId, "template id");
  if (!idResult.ok) return idResult.response;

  const parsed = await parseBody(request, OnboardingDecisionSchema);
  if (!parsed.ok) return parsed.response;

  const row = await loadOnboardingRow(idResult.data);
  if (!row) return NextResponse.json({ error: "Template not found" }, { status: 404 });
  if (row.onboarding_status !== "draft") {
    return NextResponse.json(
      { error: `mallen är i status '${row.onboarding_status}' — beslut kan bara tas i 'draft'` },
      { status: 409 },
    );
  }

  const { draft } = draftPayload(row.onboarding_draft);
  if (!draft) return NextResponse.json({ error: "utkast saknas" }, { status: 409 });

  const result = applyDecision(draft, parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("templates")
    .update({ onboarding_draft: result.draft })
    .eq("id", idResult.data);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ draft: result.draft });
}
