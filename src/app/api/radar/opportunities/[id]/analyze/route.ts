import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseUuidParam } from "@/lib/api-helpers";
import { fetchTedXml } from "@/lib/safe-fetch";
import { getUserId } from "@/lib/org";
import { analyzeRfp } from "@/lib/rfp-analyzer";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await params;
  const idResult = parseUuidParam(rawId, "opportunity id");
  if (!idResult.ok) return idResult.response;
  const id = idResult.data;
  const supabase = await createClient();
  // Route is auth-gated by middleware; attribute the analysis cost to the
  // triggering user so it isn't bucketed as "Okänd" in workspace stats.
  const userId = await getUserId(supabase);

  // 1. Get the opportunity
  const { data: opp, error: oppError } = await supabase
    .from("rfp_opportunities")
    .select("id, title, summary, raw_xml")
    .eq("id", id)
    .single();

  if (oppError || !opp) {
    return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
  }

  // 2. Determine input text — prefer summary, fallback to fetching full notice XML
  let inputText = opp.summary;
  if (!inputText || inputText.length < 200) {
    // raw_xml stores the XML URL from TED, not content — fetch it on demand.
    // fetchTedXml enforces the TED host allowlist (SSRF guard) and rejects a
    // non-TED URL before any network call.
    if (opp.raw_xml) {
      try {
        const tedRes = await fetchTedXml(opp.raw_xml);
        if (tedRes.ok) {
          const xml = await tedRes.text();
          const stripped = xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
          if (stripped.length > 200) inputText = stripped;
        }
      } catch {
        // Fetch failed — fall through to summary/title
      }
    }
    if (!inputText || inputText.length < 200) {
      inputText = opp.summary ?? opp.title;
    }
  }

  // 3. Create a document record (radar-sourced, no file upload).
  // file_path stays NULL — there is no storage object for ted:// docs.
  const { data: doc, error: docError } = await supabase
    .from("documents")
    .insert({
      file_name: `ted-${opp.title.slice(0, 50)}.txt`,
      raw_text: inputText,
    })
    .select()
    .single();

  if (docError) {
    return NextResponse.json({ error: docError.message }, { status: 500 });
  }

  // 4. Run RFP analysis (same as manual upload flow)
  const analysis = await analyzeRfp(inputText, userId);

  // 5. Save analysis
  const { data: analysisRecord, error: analysisError } = await supabase
    .from("analyses")
    .insert({
      document_id: doc.id,
      analysis,
    })
    .select()
    .single();

  if (analysisError) {
    return NextResponse.json({ error: analysisError.message }, { status: 500 });
  }

  // 6. Update opportunity status + link to analysis
  await supabase
    .from("rfp_opportunities")
    .update({ status: "analyzed", analysis_id: analysisRecord.id })
    .eq("id", id);

  return NextResponse.json({
    analysisId: analysisRecord.id,
    documentId: doc.id,
  });
}
