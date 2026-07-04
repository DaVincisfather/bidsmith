import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseUuidParam, requireUser } from "@/lib/api-helpers";
import { locateEvidenceContext } from "@/lib/evidence-context";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// PII-tak (HÅRT, routine-fynd #61): q måste vara ett LAGRAT evidence-citat för
// exakt denna konsult — annars kunde en autentiserad klient rekonstruera hela
// raw_cv_text genom fönster-vandring (upprepade anrop med kanten av föregående
// kontext). Endpointens kontrakt är "kontext för ett VERIFIERAT citat", inte
// godtycklig textsökning. MAX_Q är därmed bara en sanity-bound före DB-slaget
// (lagrad evidence är i praktiken ≤~50 ord; 2000 stänger inte ute långa citat —
// fynd 2: 500 gjorde featuren tyst avstängd för de längsta).
const MAX_Q = 2000;
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
    .select("raw_cv_text, consultant_competencies (evidence), consultant_references (evidence)")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Consultant not found" }, { status: 404 });
  }

  // Hårda PII-taket: q måste ordagrant matcha ett lagrat evidence för konsulten.
  const stored = new Set(
    [
      ...((data.consultant_competencies as { evidence: string | null }[] | null) ?? []),
      ...((data.consultant_references as { evidence: string | null }[] | null) ?? []),
    ]
      .map((r) => r.evidence)
      .filter((e): e is string => e != null),
  );
  if (!stored.has(q)) {
    // Samma graciösa svar som "kan inte lokaliseras" — klienten faller tillbaka
    // till rena citatblocket; ingen orakel-signal om vad som finns i källan.
    return NextResponse.json({ context: null });
  }

  const rawText = (data.raw_cv_text as string | null) ?? null;
  const context = rawText ? locateEvidenceContext(rawText, q, WINDOW) : null;
  return NextResponse.json({ context });
}
