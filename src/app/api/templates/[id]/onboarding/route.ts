import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { requireUser, parseUuidParam, parseBody } from "@/lib/api-helpers";
import { OnboardingDecisionSchema } from "@/lib/api-schemas";
import { parseOnboardingDraft, extractPrecount } from "@/lib/pptx-template/onboarding/draft";
import { foreignTemplatesEnabled } from "@/lib/pptx-template/onboarding/foreign-flag";
import { applyDecision } from "@/lib/pptx-template/onboarding/draft-logic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface OnboardingRow {
  id: string;
  name: string;
  version: number;
  storage_path: string | null;
  onboarding_status: string;
  onboarding_draft: unknown;
}

/** Läser mall-raden. DB-fel blir ett räknat JSON-500 i st.f. ett throw ur
 *  handlern — ett ofångat undantag ger en icke-JSON-500 som klienten inte kan
 *  tolka (samma mönster som DELETE-handlerns guard-fel, routine-fynd #65). */
async function loadOnboardingRow(
  id: string,
): Promise<{ ok: true; row: OnboardingRow | null } | { ok: false; response: NextResponse }> {
  const supabase = createServiceClient();
  const { data: row, error } = await supabase
    .from("templates")
    .select("id, name, version, storage_path, onboarding_status, onboarding_draft")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return {
      ok: false,
      response: NextResponse.json({ error: error.message }, { status: 500 }),
    };
  }
  return { ok: true, row };
}

/** Normaliserar onboarding_draft-kolumnens payloads: utkast (schema-validerat),
 *  { error, precount? } (klassificeringsfel — precount kan bevaras med, se
 *  propose-routen), { precount } (satt av upload, före klassificering). Ett
 *  korrupt utkast (objekt som inte matchar något av dem) får INTE kasta
 *  ZodError ur handlern — det mappas till ett fel-payload.
 *  Nyckeldiskriminering (error först, sedan precount, sedan parse) måste
 *  bevaras — ett utkast får aldrig förväxlas med en precount/error-payload. */
function draftPayload(raw: unknown): {
  draft: ReturnType<typeof parseOnboardingDraft> | null;
  error?: string;
  precount?: { slides: number; candidates: number };
} {
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.error === "string") return { draft: null, error: obj.error, precount: extractPrecount(raw) };
    const precount = extractPrecount(raw);
    if (precount) return { draft: null, precount };
    try {
      return { draft: parseOnboardingDraft(raw) };
    } catch {
      return { draft: null, error: "utkastet är korrupt — kör om klassificeringen" };
    }
  }
  return { draft: null };
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const authed = await createClient();
  const auth = await requireUser(authed);
  if (!auth.ok) return auth.response;

  // Lanserings-grind (vägbeslutet 2026-07-14): foreign-onboardingen är opt-in.
  if (!foreignTemplatesEnabled()) {
    return NextResponse.json({ error: "onboarding av kundmallar är avstängd" }, { status: 404 });
  }

  const { id: rawId } = await params;
  const idResult = parseUuidParam(rawId, "template id");
  if (!idResult.ok) return idResult.response;

  const loaded = await loadOnboardingRow(idResult.data);
  if (!loaded.ok) return loaded.response;
  const row = loaded.row;
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

  // Lanserings-grind — samma som GET.
  if (!foreignTemplatesEnabled()) {
    return NextResponse.json({ error: "onboarding av kundmallar är avstängd" }, { status: 404 });
  }

  const { id: rawId } = await params;
  const idResult = parseUuidParam(rawId, "template id");
  if (!idResult.ok) return idResult.response;

  const parsed = await parseBody(request, OnboardingDecisionSchema);
  if (!parsed.ok) return parsed.response;

  const loaded = await loadOnboardingRow(idResult.data);
  if (!loaded.ok) return loaded.response;
  const row = loaded.row;
  if (!row) return NextResponse.json({ error: "Template not found" }, { status: 404 });
  if (row.onboarding_status !== "draft") {
    return NextResponse.json(
      { error: `mallen är i status '${row.onboarding_status}' — beslut kan bara tas i 'draft'` },
      { status: 409 },
    );
  }

  // Korrupt utkast ska svara med SIN orsak, inte det missvisande "utkast saknas".
  const { draft, error: draftError } = draftPayload(row.onboarding_draft);
  if (!draft) {
    return NextResponse.json({ error: draftError ?? "utkast saknas" }, { status: 409 });
  }

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
