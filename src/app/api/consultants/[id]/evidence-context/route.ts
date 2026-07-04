import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseUuidParam, requireUser } from "@/lib/api-helpers";
import { locateEvidenceContext } from "@/lib/evidence-context";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// PII-tak (medvetet): rå CV-text (consultants.raw_cv_text) lämnar ALDRIG servern i
// sin helhet. Endpointen exponerar bara ett ±WINDOW-teckens fönster runt ett citat
// klienten redan har (det verifierade, redan exponerade CV-citatet). q-längden kapas
// och fönstret sätts server-side.
const MAX_Q = 500;
const WINDOW = 200;

/**
 * GET /api/consultants/[id]/evidence-context?q=<evidence>
 * Lokaliserar citatet i konsultens raw_cv_text och returnerar ±WINDOW källkontext.
 * 404 när konsulten saknas, 200 {context:null} när citatet inte kan lokaliseras
 * (eller ingen raw_cv_text finns).
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const supabase = await createClient();
  const auth = await requireUser(supabase);
  if (!auth.ok) return auth.response;

  const { id: rawId } = await params;
  const idResult = parseUuidParam(rawId, "consultant id");
  if (!idResult.ok) return idResult.response;
  const id = idResult.data;

  const q = new URL(request.url).searchParams.get("q");
  if (!q || q.trim() === "") {
    return NextResponse.json({ error: "Missing q" }, { status: 400 });
  }
  if (q.length > MAX_Q) {
    return NextResponse.json(
      { error: `q too long (max ${MAX_Q} chars)` },
      { status: 400 },
    );
  }

  // Läser BARA raw_cv_text (PII) server-side — den serialiseras aldrig, bara fönstret.
  const { data, error } = await supabase
    .from("consultants")
    .select("raw_cv_text")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Consultant not found" }, { status: 404 });
  }

  const rawText = (data.raw_cv_text as string | null) ?? null;
  const context = rawText ? locateEvidenceContext(rawText, q, WINDOW) : null;
  return NextResponse.json({ context });
}
