import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { requireUser, parseUuidParam } from "@/lib/api-helpers";
import { TEMPLATE_BUCKET, clearTemplateCache } from "@/lib/pptx-template/template-store";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const authed = await createClient();
  const auth = await requireUser(authed);
  if (!auth.ok) return auth.response;

  const { id: rawId } = await params;
  const idResult = parseUuidParam(rawId, "template id");
  if (!idResult.ok) return idResult.response;
  const id = idResult.data;

  const supabase = createServiceClient();

  // Verifiera existens FÖRE raderingen — ett 404 är tydligare än en tyst no-op,
  // och storage_path måste läsas ut innan raden försvinner (mallfilen städas nedan).
  const { data: tpl, error: tplErr } = await supabase
    .from("templates")
    .select("id, storage_path")
    .eq("id", id)
    .maybeSingle();
  // Guard-fel får INTE falla igenom till raderingen — då svarar FK:n med ett
  // rått constraint-fel i st.f. de avsedda 409:orna (routine-fynd #65).
  if (tplErr) {
    return NextResponse.json({ error: tplErr.message }, { status: 500 });
  }
  if (!tpl) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  // Vägra radera BUNDLADE mallar (storage_path null — seedade via migration, kan
  // inte återskapas via UI:t; uppladdning skapar storage-mallar, inte disk-bundlade).
  if (tpl.storage_path === null) {
    return NextResponse.json(
      { error: "bundlad mall kan inte raderas — den kan inte återskapas via appen" },
      { status: 409 }
    );
  }

  // Vägra radera den AKTIVA mallen — säkrare än att tyst nolla pekaren, som skulle
  // lämna arbetsytan utan mall. Användaren aktiverar en annan mall först.
  const { data: activeWs, error: wsErr } = await supabase
    .from("workspace_settings")
    .select("id")
    .eq("active_template_id", id)
    .maybeSingle();
  if (wsErr) {
    return NextResponse.json({ error: wsErr.message }, { status: 500 });
  }
  if (activeWs) {
    return NextResponse.json(
      { error: "mallen är aktiv — aktivera en annan mall först" },
      { status: 409 }
    );
  }

  // Vägra radera en mall som anbud refererar. Append-only-versioneringen finns
  // just för att ett anbuds budgetar beräknades mot PRECIS den mallversionen —
  // export/redigering av de anbuden bryts om mallen försvinner. (bids.template_id
  // saknar ON DELETE CASCADE, så Postgres skulle ändå avvisa raderingen — men ett
  // räknat 409 ger ett begripligt svar i st.f. ett rått constraint-fel.)
  const { count: bidCount, error: bidErr } = await supabase
    .from("bids")
    .select("id", { count: "exact", head: true })
    .eq("template_id", id);
  if (bidErr) {
    return NextResponse.json({ error: bidErr.message }, { status: 500 });
  }
  if (bidCount && bidCount > 0) {
    return NextResponse.json(
      { error: `mallen används av ${bidCount} anbud` },
      { status: 409 }
    );
  }

  // Radera raden. template_profiles-raden kaskaderar via FK (migration 008:
  // template_id ... on delete cascade).
  const { error } = await supabase.from("templates").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Städa mallfilen ur storage. Icke-fatalt (samma husmönster som CV-originalen i
  // consultants/[id]): raden är redan borta och en kvarlämnad fil får inte
  // förvandla en lyckad radering till ett fel. Bundlad mall (storage_path null)
  // har ingen fil att städa.
  const storagePath = (tpl as { storage_path?: string | null }).storage_path;
  if (storagePath) {
    const { error: rmErr } = await supabase.storage.from(TEMPLATE_BUCKET).remove([storagePath]);
    if (rmErr) console.warn(`kunde inte städa mallfil ${storagePath}: ${rmErr.message}`);
  }

  clearTemplateCache(id);
  return NextResponse.json({ deleted: true });
}
