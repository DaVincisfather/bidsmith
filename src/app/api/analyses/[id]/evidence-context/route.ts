import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseUuidParam, requireUser } from "@/lib/api-helpers";
import { locateEvidenceContext } from "@/lib/evidence-context";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// PII-tak (medvetet): rå källtext (documents.raw_text) lämnar ALDRIG servern i sin
// helhet. Endpointen exponerar bara ett ±WINDOW-teckens fönster runt ett citat som
// KLIENTEN redan har (det verifierade, redan exponerade citatet). q-längden kapas
// och fönstret sätts server-side — klienten kan inte begära mer text.
const MAX_Q = 500;
const WINDOW = 200;

/**
 * GET /api/analyses/[id]/evidence-context?q=<evidence>
 * Laddar analysraden, joinar documents.raw_text via document_id och returnerar
 * källkontexten runt citatet. 404 när analysen saknas, 200 {context:null} när
 * citatet inte kan lokaliseras (eller ingen raw_text finns).
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const supabase = await createClient();
  const auth = await requireUser(supabase);
  if (!auth.ok) return auth.response;

  const { id: rawId } = await params;
  const idResult = parseUuidParam(rawId, "analysis id");
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

  const { data, error } = await supabase
    .from("analyses")
    .select("id, documents(raw_text)")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
  }

  const doc = data.documents as unknown as { raw_text: string | null } | null;
  const rawText = doc?.raw_text ?? null;
  const context = rawText ? locateEvidenceContext(rawText, q, WINDOW) : null;
  return NextResponse.json({ context });
}
