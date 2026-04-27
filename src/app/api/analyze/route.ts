import { NextRequest, NextResponse } from "next/server";
import { parseDocument } from "@/lib/document-parser";
import { analyzeRfp } from "@/lib/rfp-analyzer";
import { createServiceClient } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { getOrgId } from "@/lib/org";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const authed = await createClient();
    const orgId = await getOrgId(authed);
    const supabase = createServiceClient();

    // Upload file to Supabase Storage. Path prefix = org_id so the
    // bucket RLS policies (migration 013) can scope reads/writes.
    const filePath = `${orgId}/${Date.now()}-${file.name}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from("rfp-documents")
      .upload(filePath, buffer, {
        contentType: file.type,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: `Upload failed: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // Parse document to text
    const rawText = await parseDocument(buffer, file.name);

    // Save document record. file_url is legacy (kept nullable in 014)
    // and only file_path is consulted going forward; UI generates a
    // signed URL on demand via getDocumentSignedUrl.
    const { data: doc, error: docError } = await supabase
      .from("documents")
      .insert({
        file_name: file.name,
        file_path: filePath,
        raw_text: rawText,
        organization_id: orgId,
      })
      .select()
      .single();

    if (docError) {
      return NextResponse.json(
        { error: `Database error: ${docError.message}` },
        { status: 500 }
      );
    }

    // Analyze with Claude
    const analysis = await analyzeRfp(rawText, orgId);

    // Save analysis
    const { data: analysisRecord, error: analysisError } = await supabase
      .from("analyses")
      .insert({
        document_id: doc.id,
        analysis,
        organization_id: orgId,
      })
      .select()
      .single();

    if (analysisError) {
      return NextResponse.json(
        { error: `Analysis save failed: ${analysisError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      id: analysisRecord.id,
      documentId: doc.id,
      analysis,
    });
  } catch (error) {
    console.error("Analysis failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
