import { NextRequest, NextResponse } from "next/server";
import { parseDocument } from "@/lib/document-parser";
import { analyzeRfp } from "@/lib/rfp-analyzer";
import { createServiceClient } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Upload file to Supabase Storage
    const fileName = `${Date.now()}-${file.name}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from("rfp-documents")
      .upload(fileName, buffer, {
        contentType: file.type,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: `Upload failed: ${uploadError.message}` },
        { status: 500 }
      );
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("rfp-documents").getPublicUrl(fileName);

    // Parse document to text
    const rawText = await parseDocument(buffer, file.name);

    // Save document record
    const { data: doc, error: docError } = await supabase
      .from("documents")
      .insert({
        file_name: file.name,
        file_url: publicUrl,
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

    // Analyze with Claude
    const analysis = await analyzeRfp(rawText);

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
