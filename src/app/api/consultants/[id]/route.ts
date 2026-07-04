import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseBody, parseUuidParam } from "@/lib/api-helpers";
import { ConsultantUpdateSchema } from "@/lib/api-schemas";
import { CONSULTANT_API_SELECT } from "@/lib/constants";
import { verifyEvidence } from "@/lib/verify-evidence";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Re-verifierar klient-inskickade citat mot konsultens EGEN lagrade CV-text och
 * returnerar det värde som ska persisteras per post: verifierat citat → som det är,
 * allt annat (utelämnat, overifierbart/fabricerat, eller inget raw_cv_text) → null.
 *
 * VARFÖR re-verifiera i st.f. att lita på klienten: extraktionens mekaniska garanti
 * (verify-evidence.ts) är att inget OVERIFIERAT citat får persisteras. En buggig eller
 * illvillig klient kan plantera ett påhittat citat i PUT-bodyn — skulle vi persistera
 * det rakt av vore garantin bruten. `verifyEvidence` är ren sträng-matchning (INGA
 * API-anrop, deterministisk): ett orört (redan verifierat) citat matchar fortfarande
 * → round-trip förblir förlustfri; ett redigerat/nytt/fabricerat citat matchar inte
 * → blir ärligt null (obelagt). Så manuell redigering kan aldrig UPPGRADERA ett
 * påstående till "belagt" utan att citatet faktiskt finns ordagrant i CV:t.
 */
function reverifyEvidence(
  items: Array<{ evidence?: string }>,
  rawCvText: string | null,
): Array<string | null> {
  // Ingen CV-text på raden (t.ex. äldre/manuellt skapad konsult) → inget att
  // matcha mot, allt blir obelagt.
  if (!rawCvText) return items.map(() => null);
  const misses = verifyEvidence(
    "consultant-edit",
    rawCvText,
    // description spelar ingen roll för matchningen — bara evidence sträng-matchas.
    items.map((it) => ({ description: "", evidence: it.evidence })),
  );
  const failed = new Set(misses.map((m) => m.index));
  return items.map((it, i) => (failed.has(i) ? null : (it.evidence as string)));
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { id: rawId } = await params;
  const idResult = parseUuidParam(rawId, "consultant id");
  if (!idResult.ok) return idResult.response;
  const id = idResult.data;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("consultants")
    .select(CONSULTANT_API_SELECT)
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json({ error: "Consultant not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const { id: rawId } = await params;
  const idResult = parseUuidParam(rawId, "consultant id");
  if (!idResult.ok) return idResult.response;
  const id = idResult.data;
  const parsed = await parseBody(request, ConsultantUpdateSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const supabase = await createClient();

  const { data: updatedRows, error: updateError } = await supabase
    .from("consultants")
    .update({
      name: body.name,
      level: body.level,
      years_experience: body.yearsExperience,
      summary: body.summary,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id");

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Postgres updates of a non-existent row are not an error — they match
  // zero rows. Without this check, PUT on an unknown id returned 200 with
  // a null body.
  if (!updatedRows || updatedRows.length === 0) {
    return NextResponse.json({ error: "Consultant not found" }, { status: 404 });
  }

  // Hämta konsultens lagrade CV-text för att RE-VERIFIERA inskickade citat mot den
  // (se reverifyEvidence). Server-side-läsning — raw_cv_text är PII och når aldrig
  // klienten. Undviks helt om varken kompetenser eller referenser ska ersättas.
  let rawCvText: string | null = null;
  if (body.competencies || body.references) {
    const { data: cvRow } = await supabase
      .from("consultants")
      .select("raw_cv_text")
      .eq("id", id)
      .single();
    rawCvText = (cvRow?.raw_cv_text as string | null) ?? null;
  }

  if (body.competencies) {
    await supabase
      .from("consultant_competencies")
      .delete()
      .eq("consultant_id", id);

    if (body.competencies.length > 0) {
      const compEvidence = reverifyEvidence(body.competencies, rawCvText);
      const { error: compError } = await supabase
        .from("consultant_competencies")
        .insert(
          body.competencies.map((c, i) => ({
            consultant_id: id,
            competency: c.competency,
            category: c.category,
            evidence: compEvidence[i],
          }))
        );
      if (compError) {
        return NextResponse.json({ error: compError.message }, { status: 500 });
      }
    }
  }

  if (body.references) {
    await supabase
      .from("consultant_references")
      .delete()
      .eq("consultant_id", id);

    if (body.references.length > 0) {
      const refEvidence = reverifyEvidence(body.references, rawCvText);
      const { error: refError } = await supabase
        .from("consultant_references")
        .insert(
          body.references.map((r, i) => ({
            consultant_id: id,
            title: r.title,
            description: r.description,
            year: r.year,
            sector: r.sector,
            evidence: refEvidence[i],
          }))
        );
      if (refError) {
        return NextResponse.json({ error: refError.message }, { status: 500 });
      }
    }
  }

  // Return updated consultant
  const { data } = await supabase
    .from("consultants")
    .select(CONSULTANT_API_SELECT)
    .eq("id", id)
    .single();

  return NextResponse.json(data);
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const { id: rawId } = await params;
  const idResult = parseUuidParam(rawId, "consultant id");
  if (!idResult.ok) return idResult.response;
  const id = idResult.data;
  const supabase = await createClient();

  const { data: deletedRows, error } = await supabase
    .from("consultants")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!deletedRows || deletedRows.length === 0) {
    return NextResponse.json({ error: "Consultant not found" }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}
