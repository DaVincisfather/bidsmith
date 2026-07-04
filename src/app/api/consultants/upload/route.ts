import { NextRequest, NextResponse } from "next/server";
import {
  parseDocument,
  getExtension,
  SUPPORTED_EXTENSIONS,
  MAX_UPLOAD_REQUEST_BYTES,
} from "@/lib/document-parser";
import { enforceContentLength } from "@/lib/api-helpers";
import { extractConsultant } from "@/lib/consultant-extractor";
import { createServiceClient, upsertConsultant } from "@/lib/supabase";
import { CV_BUCKET } from "@/lib/storage-urls";
import { createClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/org";

interface UploadResult {
  fileName: string;
  consultantId: string | null;
  error: string | null;
  // Icke-fatal varning: extraktionen + konsultraden är redan committade, men att
  // spara ORIGINALFILEN (D-symmetri med analys-källvyn) fallerade — CV:t fungerar,
  // bara "Öppna originalet"-länken saknas för just denna konsult.
  warning: string | null;
}

/**
 * Bygger storage-nyckeln för originalfilen: `${consultantId}/${slug}.${ext}`.
 * Slugar filnamnet exakt som mall-uploaden (gemener, åäö behålls, allt annat → "-")
 * och behåller den ursprungliga (whitelistade) extensionen. Returnerar null om
 * extensionen inte är parserns stödda uppsättning — då hoppas fil-uploaden över.
 */
function buildCvKey(consultantId: string, fileName: string): string | null {
  const ext = getExtension(fileName); // t.ex. ".pdf" (gemen)
  if (!SUPPORTED_EXTENSIONS.includes(ext)) return null;
  const base = fileName.slice(0, fileName.length - ext.length);
  const slug =
    base
      .toLowerCase()
      .replace(/[^a-z0-9åäö]+/g, "-")
      .replace(/(^-|-$)/g, "") || "cv";
  return `${consultantId}/${slug}${ext}`;
}

export async function POST(request: NextRequest) {
  try {
    // Reject a pathological body before formData() buffers every file into memory.
    const tooLarge = enforceContentLength(request, MAX_UPLOAD_REQUEST_BYTES);
    if (tooLarge) return tooLarge;

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

        // Persistera originalfilen så konsult-källvyns "Öppna originalet" fungerar
        // symmetriskt med analyser (D-symmetri). ICKE-FATAL: extraktionen + raden
        // är redan committade, så ett storage-/update-fel får INTE fälla uploaden —
        // vi loggar en varning och lämnar cv_file_path orört. upsert:true speglar
        // upsertConsultants ersätt-barnen-semantik: ett om-uppladdat CV skriver över.
        let warning: string | null = null;
        const cvKey = buildCvKey(consultantId, file.name);
        if (cvKey) {
          try {
            const { error: upErr } = await supabase.storage
              .from(CV_BUCKET)
              .upload(cvKey, buffer, {
                upsert: true,
                contentType: file.type || undefined,
              });
            if (upErr) throw new Error(upErr.message);

            const { error: updErr } = await supabase
              .from("consultants")
              .update({ cv_file_path: cvKey })
              .eq("id", consultantId);
            if (updErr) throw new Error(updErr.message);
          } catch (err) {
            warning = `originalfilen kunde inte sparas (extraktionen är sparad): ${err instanceof Error ? err.message : String(err)}`;
            console.warn(`CV-original för ${file.name}:`, warning);
          }
        }

        results.push({
          fileName: file.name,
          consultantId,
          error: null,
          warning,
        });
      } catch (err) {
        results.push({
          fileName: file.name,
          consultantId: null,
          error: err instanceof Error ? err.message : "Unknown error",
          warning: null,
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
