import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser, parseUuidParam, parseBody } from "@/lib/api-helpers";
import { DefectAcceptSchema } from "@/lib/api-schemas";
import { foreignTemplatesEnabled } from "@/lib/pptx-template/onboarding/foreign-flag";
import { loadTemplateProfile, saveTemplateProfile } from "@/lib/pptx-template/profile-store";
import { acceptDefect } from "@/lib/pptx-template/measure/template-defects";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Accepts a known template defect (operator sign-off from the health report)
 *  — flips its status to "accepted" so the activation gate (activationBlockReason)
 *  no longer blocks on it and future scans annotate instead of alarm. Routes stay
 *  thin: the signature-lookup + gate logic lives in template-defects.ts (unit-tested). */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const authed = await createClient();
  const auth = await requireUser(authed);
  if (!auth.ok) return auth.response;

  // Lanserings-grind (vägbeslutet 2026-07-14): samma som onboarding-routen.
  if (!foreignTemplatesEnabled()) {
    return NextResponse.json({ error: "onboarding av kundmallar är avstängd" }, { status: 404 });
  }

  const { id: rawId } = await params;
  const idResult = parseUuidParam(rawId, "template id");
  if (!idResult.ok) return idResult.response;

  const parsed = await parseBody(request, DefectAcceptSchema);
  if (!parsed.ok) return parsed.response;

  const profile = await loadTemplateProfile(idResult.data);
  if (!profile) return NextResponse.json({ error: "mallen saknar profil" }, { status: 409 });
  if (profile.measurement?.status !== "complete") {
    return NextResponse.json({ error: "mallen är inte mätt — kör onboarding:measure först" }, { status: 409 });
  }

  const result = acceptDefect(profile.knownDefects ?? [], parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });

  await saveTemplateProfile({ ...profile, knownDefects: result.defects });
  return NextResponse.json({ knownDefects: result.defects });
}
