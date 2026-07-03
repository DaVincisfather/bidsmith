import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/api-helpers";
import { introspectTemplate } from "@/lib/pptx-template/introspect";
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

  let manifest, warnings;
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
    .insert({ name, version, storage_path: storagePath, manifest })
    .select("id")
    .single();
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  // Derive a starting profile from the introspected manifest so the template is
  // immediately renderable via the profile-driven path; onboarding (slice 5 UI)
  // refines it. Non-fatal: the template + storage are already committed, so a
  // profile-save failure must not fail the upload — surface a warning and let
  // it be regenerated.
  const allWarnings = [...warnings];
  try {
    await saveTemplateProfile(manifestToProfile(manifest, { templateId: row.id }));
  } catch (err) {
    allWarnings.push(
      `mall-profil kunde inte sparas (kan regenereras): ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Uppladdning aktiverar inte — preview först, aktivering är ett separat,
  // explicit anrop (POST /api/templates/[id]/activate).
  clearTemplateCache();
  return NextResponse.json({ id: row.id, name, version, manifest, warnings: allWarnings });
}
