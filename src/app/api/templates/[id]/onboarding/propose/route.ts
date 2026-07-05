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

  const { id: rawId } = await params;
  const idResult = parseUuidParam(rawId, "template id");
  if (!idResult.ok) return idResult.response;
  const id = idResult.data;

  const force = ((await request.json().catch(() => ({}))) as { force?: boolean }).force === true;

  const supabase = createServiceClient();
  const { data: row } = await supabase
    .from("templates")
    .select("id, name, version, storage_path, onboarding_status")
    .eq("id", id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Template not found" }, { status: 404 });

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

  await supabase
    .from("templates")
    .update({ onboarding_status: "classifying" })
    .eq("id", id);

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
      await supabase
        .from("templates")
        .update({
          onboarding_status: "needs_onboarding",
          onboarding_draft: { error: err instanceof Error ? err.message : String(err) },
        })
        .eq("id", id);
    }
  });

  return NextResponse.json({ status: "classifying" }, { status: 202 });
}
