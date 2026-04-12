import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { analyzeRfp } from "@/lib/rfp-analyzer";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServiceClient();

  // 1. Get the opportunity
  const { data: opp, error: oppError } = await supabase
    .from("rfp_opportunities")
    .select("id, title, summary, raw_xml, organization_id")
    .eq("id", id)
    .single();

  if (oppError || !opp) {
    return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
  }

  // 2. Determine input text — prefer summary, fallback to raw_xml
  let inputText = opp.summary;
  if (!inputText || inputText.length < 200) {
    inputText = opp.raw_xml
      ? opp.raw_xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
      : opp.summary ?? opp.title;
  }

  // 3. Create a document record (radar-sourced, no file upload)
  const { data: doc, error: docError } = await supabase
    .from("documents")
    .insert({
      file_name: `ted-${opp.title.slice(0, 50)}.txt`,
      file_url: `ted://notice/${id}`,
      raw_text: inputText,
      organization_id: opp.organization_id,
    })
    .select()
    .single();

  if (docError) {
    return NextResponse.json({ error: docError.message }, { status: 500 });
  }

  // 4. Run RFP analysis (same as manual upload flow)
  const analysis = await analyzeRfp(inputText);

  // 5. Save analysis
  const { data: analysisRecord, error: analysisError } = await supabase
    .from("analyses")
    .insert({
      document_id: doc.id,
      analysis,
      organization_id: opp.organization_id,
    })
    .select()
    .single();

  if (analysisError) {
    return NextResponse.json({ error: analysisError.message }, { status: 500 });
  }

  // 6. Update opportunity status + link to analysis
  await supabase
    .from("rfp_opportunities")
    .update({ status: "analyzing", analysis_id: analysisRecord.id })
    .eq("id", id);

  return NextResponse.json({
    analysisId: analysisRecord.id,
    documentId: doc.id,
  });
}
