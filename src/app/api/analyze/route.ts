import { NextRequest, NextResponse } from "next/server";
import {
  parseDocument,
  validateDocument,
  sanitizeFilename,
  MAX_UPLOAD_REQUEST_BYTES,
} from "@/lib/document-parser";
import { enforceContentLength } from "@/lib/api-helpers";
import { analyzeRfp } from "@/lib/rfp-analyzer";
import { createServiceClient } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/org";

export async function POST(request: NextRequest) {
  try {
    // Reject a pathological body before formData() buffers it into memory.
    const tooLarge = enforceContentLength(request, MAX_UPLOAD_REQUEST_BYTES);
    if (tooLarge) return tooLarge;

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const authed = await createClient();
    const userId = await getUserId(authed);
    const supabase = createServiceClient();

    const buffer = Buffer.from(await file.arrayBuffer());

    // Validate size + type BEFORE writing to Storage — an oversized or
    // unsupported file must not leave an orphan object behind, and this
    // surfaces as a 400 rather than a 500 from parseDocument later.
    try {
      validateDocument(buffer, file.name);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Invalid file" },
        { status: 400 }
      );
    }

    // Upload file to Supabase Storage. Path prefix = user_id for storage
    // organisation; bucket RLS policies scope reads/writes per user. The
    // filename is sanitised so an attacker-supplied name can't inject path
    // separators into the storage key (original name is stored on the row).
    const filePath = `${userId}/${Date.now()}-${sanitizeFilename(file.name)}`;

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
      })
      .select()
      .single();

    if (docError) {
      return NextResponse.json(
        { error: `Database error: ${docError.message}` },
        { status: 500 }
      );
    }

    // Analyze with Claude — pass userId for AI cost attribution
    const analysis = await analyzeRfp(rawText, userId);

    // Save analysis
    const { data: analysisRecord, error: analysisError } = await supabase
      .from("analyses")
      .insert({
        document_id: doc.id,
        analysis,
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
