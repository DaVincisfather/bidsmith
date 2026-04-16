import { NextRequest, NextResponse } from "next/server";
import { parseDocument } from "@/lib/document-parser";
import { extractConsultant } from "@/lib/consultant-extractor";
import { createServiceClient } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { getOrgId } from "@/lib/org";

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
    const orgId = await getOrgId(authed);
    const supabase = createServiceClient();
    const results: UploadResult[] = [];

    for (const file of files) {
      try {
        const buffer = Buffer.from(await file.arrayBuffer());

        // Parse document text
        const rawText = await parseDocument(buffer, file.name);

        // Extract structured profile with Sonnet
        const extraction = await extractConsultant(rawText);

        // Insert consultant
        const { data: consultant, error: consultantError } = await supabase
          .from("consultants")
          .insert({
            organization_id: orgId,
            name: extraction.name,
            level: extraction.level,
            years_experience: extraction.yearsExperience,
            summary: extraction.summary,
            raw_cv_text: rawText,
          })
          .select()
          .single();

        if (consultantError) throw new Error(consultantError.message);

        // Insert competencies
        if (extraction.competencies.length > 0) {
          const { error: compError } = await supabase
            .from("consultant_competencies")
            .insert(
              extraction.competencies.map((c) => ({
                consultant_id: consultant.id,
                competency: c.competency,
                category: c.category,
              }))
            );
          if (compError) throw new Error(compError.message);
        }

        // Insert references
        if (extraction.references.length > 0) {
          const { error: refError } = await supabase
            .from("consultant_references")
            .insert(
              extraction.references.map((r) => ({
                consultant_id: consultant.id,
                title: r.title,
                description: r.description,
                year: r.year,
                sector: r.sector,
              }))
            );
          if (refError) throw new Error(refError.message);
        }

        results.push({
          fileName: file.name,
          consultantId: consultant.id,
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
