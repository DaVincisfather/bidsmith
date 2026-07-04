import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseUuidParam, requireUser } from "@/lib/api-helpers";
import { locateAllSpans } from "@/lib/evidence-context";
import { getDocumentSignedUrl } from "@/lib/storage-urls";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// MEDVETET PII-KONTRAKTSBYTE (källvyn, produktägar-beslutet "vi testar!"):
// Till skillnad från evidence-context-fönstret (borttaget) returnerar denna endpoint
// HELA documents.raw_text. Det är avsiktligt — källvyn ÄR täckningskartan: användaren
// ska landa direkt i källdokumentet med alla verifierade citat markerade. De tidigare
// "aldrig hela råtexten"-formuleringarna gällde DEFAULT-läsvägarna (analysvyn,
// konsultprofilen), som fortfarande INTE serialiserar raw_text. Här sker det bara
// bakom (a) auth och (b) ett explicit användarklick på en källa-chip. `spans` täcker
// ENBART lagrad evidens (samma rad-hämtning som fönster-endpointen hade).
export async function GET(request: NextRequest, { params }: RouteContext) {
  const supabase = await createClient();
  const auth = await requireUser(supabase);
  if (!auth.ok) return auth.response;

  const { id: rawId } = await params;
  const idResult = parseUuidParam(rawId, "analysis id");
  if (!idResult.ok) return idResult.response;
  const id = idResult.data;

  const { data, error } = await supabase
    .from("analyses")
    .select("id, analysis, documents(raw_text, file_path)")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
  }

  const doc = data.documents as unknown as {
    raw_text: string | null;
    file_path: string | null;
  } | null;
  const sourceText = doc?.raw_text ?? "";

  // Spann = ENBART lagrad evidens ur just denna analys — aldrig godtycklig text.
  const requirements =
    (data.analysis as { requirements?: { evidence?: string | null }[] } | null)
      ?.requirements ?? [];
  const evidences = requirements
    .map((r) => r.evidence)
    .filter((e): e is string => typeof e === "string" && e.trim() !== "");
  const spans = locateAllSpans(sourceText, evidences);

  // Originalfil-länk (D): documents.file_path pekar in i den privata rfp-documents-
  // bucketen → signerad URL. Saknas file_path (t.ex. TED-doc) eller signeringen
  // fallerar utelämnas fileUrl — källvyn visar ändå råtexten.
  let fileUrl: string | undefined;
  if (doc?.file_path) {
    try {
      fileUrl = await getDocumentSignedUrl(doc.file_path);
    } catch {
      fileUrl = undefined;
    }
  }

  return NextResponse.json({ sourceText, spans, fileUrl });
}
