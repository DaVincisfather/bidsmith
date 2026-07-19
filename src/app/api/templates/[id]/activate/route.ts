import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { requireUser, parseUuidParam } from "@/lib/api-helpers";
import { loadTemplateProfile } from "@/lib/pptx-template/profile-store";
import { activationBlockReason } from "@/lib/pptx-template/measure/template-defects";

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

  // Verifiera att mallen finns innan vi pekar workspace_settings på den —
  // active_template_id har en FK men ett 404 är ett tydligare svar än ett
  // rått constraint-fel.
  const { data: tpl } = await supabase
    .from("templates")
    .select("id, onboarding_status")
    .eq("id", id)
    .maybeSingle();
  if (!tpl) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }
  // En halvfärdig kundmall får inte bli aktiv — den kan inte rendera något.
  if (!["none", "onboarded"].includes(tpl.onboarding_status)) {
    return NextResponse.json(
      { error: "mallen är inte färdig-onboardad — slutför onboardingen först" },
      { status: 409 },
    );
  }

  // Hård aktiveringsgrind (onboarding-measure-designen): en foreign-mall utan
  // slutförd mätning eller med öppna malldefekter får inte aktiveras.
  // profile === null ⇒ den bundlade mallen utan profil-rad — släpp igenom,
  // dagens beteende.
  const profile = await loadTemplateProfile(id);
  if (profile) {
    const blocked = activationBlockReason(profile);
    if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });
  }

  // UPSERT: workspace_settings är en enradstabell vars rad KAN SAKNAS (färsk
  // install). En blank .update() träffar då noll rader och gör tyst ingenting —
  // läs ut ev. befintlig rad och välj update/insert därefter.
  const { data: existing } = await supabase
    .from("workspace_settings")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("workspace_settings")
      .update({ active_template_id: id })
      .eq("id", existing.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await supabase
      .from("workspace_settings")
      .insert({ active_template_id: id });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // clearTemplateCache() behövs inte — aktivering byter pekare, inte mallens
  // innehåll; cachen är keyad på id och förblir korrekt.
  return NextResponse.json({ activated: id });
}
