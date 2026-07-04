import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseUuidParam, requireUser } from "@/lib/api-helpers";
import { locateAllSpans } from "@/lib/evidence-context";
import { getCvSignedUrl } from "@/lib/storage-urls";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// MEDVETET PII-KONTRAKTSBYTE (källvyn, produktägar-beslutet): denna endpoint
// returnerar HELA konsultens raw_cv_text — se den utförliga motiveringen i
// analyses/[id]/source-view/route.ts. Bakom auth + explicit källa-chip-klick.
// `spans` täcker enbart lagrad evidens (kompetenser + referenser).
//
// D-SYMMETRI (migration 010): consultants.cv_file_path pekar in i den privata
// `consultant-cvs`-bucketen → signerad URL för "Öppna originalet", exakt samma
// form som analys-källvyn (documents.file_path). Saknas cv_file_path (konsulter
// uppladdade före featuren) eller fallerar signeringen utelämnas fileUrl —
// källvyn visar ändå raw_cv_text.
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
      "raw_cv_text, cv_file_path, consultant_competencies (evidence), consultant_references (evidence)",
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

  // Originalfil-länk (D-symmetri): cv_file_path pekar in i den privata
  // consultant-cvs-bucketen → signerad URL. Saknas file_path eller fallerar
  // signeringen utelämnas fileUrl — källvyn visar ändå raw_cv_text.
  const cvFilePath = data.cv_file_path as string | null;
  let fileUrl: string | undefined;
  if (cvFilePath) {
    try {
      fileUrl = await getCvSignedUrl(cvFilePath);
    } catch {
      fileUrl = undefined;
    }
  }

  return NextResponse.json({ sourceText, spans, fileUrl });
}
