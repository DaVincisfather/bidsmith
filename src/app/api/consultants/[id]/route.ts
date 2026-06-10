import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseBody, parseUuidParam } from "@/lib/api-helpers";
import { ConsultantUpdateSchema } from "@/lib/api-schemas";
import { CONSULTANT_API_SELECT } from "@/lib/constants";

interface RouteContext {
  params: Promise<{ id: string }>;
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

  if (body.competencies) {
    await supabase
      .from("consultant_competencies")
      .delete()
      .eq("consultant_id", id);

    if (body.competencies.length > 0) {
      const { error: compError } = await supabase
        .from("consultant_competencies")
        .insert(
          body.competencies.map((c) => ({
            consultant_id: id,
            competency: c.competency,
            category: c.category,
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
      const { error: refError } = await supabase
        .from("consultant_references")
        .insert(
          body.references.map((r) => ({
            consultant_id: id,
            title: r.title,
            description: r.description,
            year: r.year,
            sector: r.sector,
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
