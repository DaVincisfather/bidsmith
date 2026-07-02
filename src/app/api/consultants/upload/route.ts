import { NextRequest, NextResponse } from "next/server";
import { parseDocument } from "@/lib/document-parser";
import { extractConsultant } from "@/lib/consultant-extractor";
import { createServiceClient, upsertConsultant } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/org";

interface UploadResult {
  fileName: string;
  consultantId: string | null;
  error: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    const authed = await createClient();
    const userId = await getUserId(authed);
    const supabase = createServiceClient();
    const results: UploadResult[] = [];

    for (const file of files) {
      try {
        const buffer = Buffer.from(await file.arrayBuffer());

        // Parse document text
        const rawText = await parseDocument(buffer, file.name);

        // Extract structured profile with Sonnet — pass userId for AI cost attribution
        const extraction = await extractConsultant(rawText, userId);

        // Upserta på namn: samma konsult som redan finns uppdateras (CV skrivs om)
        // i stället för att bli en dubblett.
        const { consultantId } = await upsertConsultant(supabase, extraction, rawText);

        results.push({
          fileName: file.name,
          consultantId,
          error: null,
        });
      } catch (err) {
        results.push({
          fileName: file.name,
          consultantId: null,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    const successful = results.filter((r) => r.consultantId !== null);
    const failed = results.filter((r) => r.error !== null);

    return NextResponse.json({
      total: files.length,
      successful: successful.length,
      failed: failed.length,
      results,
    });
  } catch (error) {
    console.error("Upload failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
