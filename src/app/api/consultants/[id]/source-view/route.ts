import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseUuidParam, requireUser } from "@/lib/api-helpers";
import { locateAllSpans } from "@/lib/evidence-context";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// MEDVETET PII-KONTRAKTSBYTE (källvyn, produktägar-beslutet): denna endpoint
// returnerar HELA konsultens raw_cv_text — se den utförliga motiveringen i
// analyses/[id]/source-view/route.ts. Bakom auth + explicit källa-chip-klick.
// `spans` täcker enbart lagrad evidens (kompetenser + referenser).
//
// D-ASYMMETRI: consultants-tabellen lagrar INGEN originalfil (bara raw_cv_text) —
// CV-uploaden persisterar aldrig råfilen till storage. Därför INGEN fileUrl här;
// "Öppna originalet"-länken gäller bara analyser. (Analyser: documents.file_path.)
export async function GET(request: NextRequest, { params }: RouteContext) {
  const supabase = await createClient();
  const auth = await requireUser(supabase);
  if (!auth.ok) return auth.response;

  const { id: rawId } = await params;
  const idResult = parseUuidParam(rawId, "consultant id");
  if (!idResult.ok) return idResult.response;
  const id = idResult.data;

  const { data, error } = await supabase
    .from("consultants")
    .select(
      "raw_cv_text, consultant_competencies (evidence), consultant_references (evidence)",
    )
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Consultant not found" }, { status: 404 });
  }

  const sourceText = (data.raw_cv_text as string | null) ?? "";

  // Spann = ENBART lagrad evidens för denna konsult (kompetenser + referenser).
  const evidences = [
    ...((data.consultant_competencies as { evidence: string | null }[] | null) ??
      []),
    ...((data.consultant_references as { evidence: string | null }[] | null) ??
      []),
  ]
    .map((r) => r.evidence)
    .filter((e): e is string => typeof e === "string" && e.trim() !== "");
  const spans = locateAllSpans(sourceText, evidences);

  // Ingen fileUrl (se D-asymmetri ovan).
  return NextResponse.json({ sourceText, spans });
}
