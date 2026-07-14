import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/api-helpers";
import { introspectTemplate } from "@/lib/pptx-template/introspect";
import type { TemplateManifest } from "@/lib/pptx-template/manifest-types";
import { readPptxSlides, type SlideShapes } from "@/lib/pptx-template/introspect/read-pptx";
import { isForeignPptx } from "@/lib/pptx-template/onboarding/detect-foreign";
import { foreignTemplatesEnabled } from "@/lib/pptx-template/onboarding/foreign-flag";
import { candidateSlots } from "@/lib/pptx-template/onboarding/propose-injection-plan";
import { TEMPLATE_BUCKET, clearTemplateCache } from "@/lib/pptx-template/template-store";
import { manifestToProfile } from "@/lib/pptx-template/manifest-to-profile";
import { saveTemplateProfile } from "@/lib/pptx-template/profile-store";

const MAX_TEMPLATE_SIZE = 20 * 1024 * 1024; // samma tak som document-parser

export async function GET() {
  const supabase = await createClient();
  const auth = await requireUser(supabase);
  if (!auth.ok) return auth.response;

  const { data, error } = await supabase
    .from("templates")
    .select("id, name, version, storage_path, manifest, created_at")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ templates: data });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const auth = await requireUser(supabase);
  if (!auth.ok) return auth.response;

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".pptx")) {
    return NextResponse.json({ error: "ladda upp en .pptx-fil" }, { status: 400 });
  }
  if (file.size > MAX_TEMPLATE_SIZE) {
    return NextResponse.json({ error: "max 20 MB" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const name = file.name
    .replace(/\.pptx$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9åäö]+/g, "-")
    .replace(/(^-|-$)/g, "");

  // Foreign-detektering FÖRE introspektion: en tokenlös kundmall kan aldrig
  // matcha slide-signaturerna — den ska in i onboarding, inte få 422.
  let slides: SlideShapes[];
  try {
    slides = await readPptxSlides(buffer);
  } catch (err) {
    return NextResponse.json(
      {
        error: `filen kunde inte läsas som pptx: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 422 }
    );
  }
  const foreign = isForeignPptx(slides);

  // Lanserings-grind (vägbeslutet 2026-07-14): foreign-vägen är opt-in tills
  // längdstyrningens v2 är klar. Vägran FÖRE storage/DB-skrivning — ingen rad
  // eller fil att städa.
  if (foreign && !foreignTemplatesEnabled()) {
    return NextResponse.json(
      {
        error:
          "mallen saknar {tokens} (kundmall) — onboarding av kundmallar är avstängd i den här installationen",
      },
      { status: 422 },
    );
  }

  let manifest: TemplateManifest | null = null;
  let warnings: string[] = [];
  if (!foreign) {
    try {
      ({ manifest, warnings } = await introspectTemplate(buffer, name));
    } catch (err) {
      return NextResponse.json(
        {
          error: `mallen kunde inte introspekteras: ${err instanceof Error ? err.message : String(err)}`,
        },
        { status: 422 }
      );
    }
  }

  // Append-only versionering — varje uppladdning blir en ny version, gamla bevaras
  // (bids refererar template_id och budgetarna beräknades för just den versionen).
  const service = createServiceClient();
  const { data: prev } = await service
    .from("templates")
    .select("version")
    .eq("name", name)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const version = (prev?.version ?? 0) + 1;

  const storagePath = `${name}/v${version}.pptx`;
  const { error: upErr } = await service.storage
    .from(TEMPLATE_BUCKET)
    .upload(storagePath, buffer, {
      contentType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: row, error: insErr } = await service
    .from("templates")
    .insert({
      name,
      version,
      storage_path: storagePath,
      manifest, // null för foreign — nullable sedan migration 012
      onboarding_status: foreign ? "needs_onboarding" : "none",
      // precount: startsidan visar omfång + kostnadsindikation utan att behöva
      // ladda ner och parsa pptx:en igen.
      onboarding_draft: foreign
        ? { precount: { slides: slides.length, candidates: candidateSlots(slides).length } }
        : null,
    })
    .select("id")
    .single();
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  // Foreign-mallar går till onboarding-wizarden — ingen manifest-profil att
  // härleda ännu. Task 8/10 (UI) konsumerar needsOnboarding + precount.
  if (foreign) {
    clearTemplateCache();
    return NextResponse.json({
      id: row.id,
      name,
      version,
      needsOnboarding: true,
      precount: { slides: slides.length, candidates: candidateSlots(slides).length },
    });
  }

  // Derive a starting profile from the introspected manifest so the template is
  // immediately renderable via the profile-driven path; onboarding (slice 5 UI)
  // refines it. Non-fatal: the template + storage are already committed, so a
  // profile-save failure must not fail the upload — surface a warning and let
  // it be regenerated.
  const allWarnings = [...warnings];
  // Endast icke-foreign når hit (foreign returnerade ovan); manifest är då satt.
  if (manifest) {
    try {
      await saveTemplateProfile(
        manifestToProfile(manifest, { templateId: row.id, version }),
      );
    } catch (err) {
      allWarnings.push(
        `mall-profil kunde inte sparas (kan regenereras): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Uppladdning aktiverar inte — preview först, aktivering är ett separat,
  // explicit anrop (POST /api/templates/[id]/activate).
  clearTemplateCache();
  return NextResponse.json({ id: row.id, name, version, manifest, warnings: allWarnings });
}
