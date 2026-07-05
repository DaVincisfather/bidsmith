import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { requireUser, parseUuidParam } from "@/lib/api-helpers";
import { TEMPLATE_BUCKET, clearTemplateCache } from "@/lib/pptx-template/template-store";
import { instrumentTemplate } from "@/lib/pptx-template/instrument/instrument-template";
import { saveTemplateProfile } from "@/lib/pptx-template/profile-store";
import { parseOnboardingDraft } from "@/lib/pptx-template/onboarding/draft";
import { buildInjections, buildFinalProfile } from "@/lib/pptx-template/onboarding/draft-logic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteContext) {
  const authed = await createClient();
  const auth = await requireUser(authed);
  if (!auth.ok) return auth.response;

  const { id: rawId } = await params;
  const idResult = parseUuidParam(rawId, "template id");
  if (!idResult.ok) return idResult.response;
  const id = idResult.data;

  const supabase = createServiceClient();
  // DB-fel blir ett räknat JSON-500 i st.f. ett throw ur handlern (samma mönster
  // som systerroutens loadOnboardingRow, routine-fynd #65).
  const { data: row, error: readErr } = await supabase
    .from("templates")
    .select("id, name, version, storage_path, onboarding_status, onboarding_draft")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Template not found" }, { status: 404 });
  if (row.onboarding_status !== "draft") {
    return NextResponse.json(
      { error: `kan bara slutföra i status 'draft' (är '${row.onboarding_status}')` },
      { status: 409 },
    );
  }

  let draft;
  try {
    draft = parseOnboardingDraft(row.onboarding_draft);
  } catch {
    return NextResponse.json({ error: "utkastet är korrupt — kör om klassificeringen" }, { status: 409 });
  }

  // Validera FÖRE sidoeffekter — 422:orna ska inte lämna halvt tillstånd.
  let profile, injections;
  try {
    profile = buildFinalProfile(draft, { templateId: id, name: row.name, version: row.version });
    injections = buildInjections(draft);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 422 },
    );
  }

  if (!row.storage_path) {
    return NextResponse.json({ error: "mallen saknar lagrad fil att instrumentera" }, { status: 500 });
  }
  const { data: file, error: dlErr } = await supabase.storage
    .from(TEMPLATE_BUCKET)
    .download(row.storage_path);
  if (dlErr || !file) {
    return NextResponse.json({ error: dlErr?.message ?? "kunde inte ladda ner mallfilen" }, { status: 500 });
  }
  const original = Buffer.from(await file.arrayBuffer());

  let instrumented: Buffer;
  try {
    instrumented = await instrumentTemplate(original, injections);
  } catch (err) {
    return NextResponse.json(
      { error: `instrumentering misslyckades: ${err instanceof Error ? err.message : String(err)}` },
      { status: 422 },
    );
  }

  // Originalet BEHÅLLS på sin path (re-onboarding-merge är backloggad) — den
  // instrumenterade kopian blir mallens körbara fil. upsert: retry efter
  // partiellt fel ska kunna skriva om samma objekt.
  const instrumentedPath = `${row.name}/v${row.version}-instrumented.pptx`;
  const { error: upErr } = await supabase.storage
    .from(TEMPLATE_BUCKET)
    .upload(instrumentedPath, instrumented, {
      contentType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      upsert: true,
    });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // saveTemplateProfile KASTAR vid fel — fånga och mappa till JSON-500 så routen
  // håller JSON-kontraktet; status förblir 'draft' och complete kan köras om.
  try {
    await saveTemplateProfile(profile);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }

  // Status-flippen SIST och atomiskt med storage_path-bytet — ett fel innan
  // hit lämnar mallen i 'draft' och complete kan köras om.
  const { error: updErr } = await supabase
    .from("templates")
    .update({ storage_path: instrumentedPath, onboarding_status: "onboarded" })
    .eq("id", id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  clearTemplateCache();
  return NextResponse.json({ onboarded: true });
}
