import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { requireUser, parseUuidParam } from "@/lib/api-helpers";
import { TEMPLATE_BUCKET } from "@/lib/pptx-template/template-store";
import { readPptxSlides } from "@/lib/pptx-template/introspect/read-pptx";
import { proposeInjectionPlan } from "@/lib/pptx-template/onboarding/propose-injection-plan";
import { readSlideSize } from "@/lib/pptx-template/onboarding/slide-size";
import { buildDraft } from "@/lib/pptx-template/onboarding/draft-logic";
import { extractPrecount, extractScreen } from "@/lib/pptx-template/onboarding/draft";
import { foreignTemplatesEnabled } from "@/lib/pptx-template/onboarding/foreign-flag";

// 50–100+ klassificeringsanrop (chunkade om 6) överlever inte default-timeouten.
// Samma mönster och tak som bid-genereringen (Vercel Hobby-taket).
export const maxDuration = 300;

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const authed = await createClient();
  const auth = await requireUser(authed);
  if (!auth.ok) return auth.response;
  const userId = auth.data;

  // Lanserings-grind (vägbeslutet 2026-07-14): foreign-onboardingen är opt-in.
  if (!foreignTemplatesEnabled()) {
    return NextResponse.json({ error: "onboarding av kundmallar är avstängd" }, { status: 404 });
  }

  const { id: rawId } = await params;
  const idResult = parseUuidParam(rawId, "template id");
  if (!idResult.ok) return idResult.response;
  const id = idResult.data;

  const force = ((await request.json().catch(() => ({}))) as { force?: boolean }).force === true;

  const supabase = createServiceClient();
  const { data: row } = await supabase
    .from("templates")
    .select("id, name, version, storage_path, onboarding_status, onboarding_draft")
    .eq("id", id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  // Bevaras genom CAS:en/klassificeringsfelet — annars tappar retry-vyn
  // omfångs-/kostnadsraden resp. de preliminära geometriflaggorna (båda satta
  // av upload, aldrig ombyggda av propose).
  const precount = extractPrecount(row.onboarding_draft);
  const screen = extractScreen(row.onboarding_draft);

  // needs_onboarding är normalstarten; draft/classifying kräver force (omkörning
  // slänger beslut resp. kan dubbelköra ett hängt jobb — explicit avsikt krävs).
  const allowed =
    row.onboarding_status === "needs_onboarding" ||
    (force && ["draft", "classifying"].includes(row.onboarding_status));
  if (!allowed) {
    return NextResponse.json(
      { error: `kan inte klassificera i status '${row.onboarding_status}'${force ? "" : " utan force"}` },
      { status: 409 },
    );
  }
  if (!row.storage_path) {
    return NextResponse.json({ error: "mallen saknar storage-fil" }, { status: 409 });
  }

  // Compare-and-set på statusen vi läste: två samtidiga POST (t.ex. dubbelklick
  // på force) skulle annars båda passera grinden ovan och starta dubbla
  // after()-jobb = dubbla AI-kostnader. Bara den som träffar raden i oförändrad
  // status vinner; förloraren får noll träffade rader → 409. onboarding_draft
  // rensas till (högst) precount+screen i samma update — annars kan GET under
  // pågående omkörning visa det gamla utkastet/fel-payloaden bredvid status
  // 'classifying'. precount/screen är INTE ett utkast — de överlever medvetet.
  const { data: claimed, error: casError } = await supabase
    .from("templates")
    .update({
      onboarding_status: "classifying",
      onboarding_draft: precount ? { precount, ...(screen ? { screen } : {}) } : null,
    })
    .eq("id", id)
    .eq("onboarding_status", row.onboarding_status)
    .select("id");
  if (casError) {
    return NextResponse.json({ error: casError.message }, { status: 500 });
  }
  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ error: "en klassificering pågår redan" }, { status: 409 });
  }

  after(async () => {
    try {
      const { data: file, error: dlErr } = await supabase.storage
        .from(TEMPLATE_BUCKET)
        .download(row.storage_path);
      if (dlErr || !file) throw new Error(dlErr?.message ?? "kunde inte ladda ner mallfilen");
      const buffer = Buffer.from(await file.arrayBuffer());

      const [slides, slideSize, proposal] = await Promise.all([
        readPptxSlides(buffer),
        readSlideSize(buffer),
        proposeInjectionPlan(buffer, {
          templateId: id,
          name: row.name,
          version: row.version,
          userId,
        }),
      ]);
      const draft = buildDraft(proposal.slots, slides, slideSize);

      await supabase
        .from("templates")
        .update({ onboarding_draft: draft, onboarding_status: "draft" })
        .eq("id", id);
    } catch (err) {
      // Felet ytas på startsidan; needs_onboarding gör retry-knappen giltig igen.
      // precount/screen hänger med så omfångs-/kostnadsraden resp. de
      // preliminära geometriflaggorna inte försvinner vid retry.
      await supabase
        .from("templates")
        .update({
          onboarding_status: "needs_onboarding",
          onboarding_draft: {
            error: err instanceof Error ? err.message : String(err),
            ...(precount ? { precount } : {}),
            ...(screen ? { screen } : {}),
          },
        })
        .eq("id", id);
    }
  });

  return NextResponse.json({ status: "classifying" }, { status: 202 });
}
