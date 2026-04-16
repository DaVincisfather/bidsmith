import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("consultants")
    .select(`
      *,
      consultant_competencies (id, competency, category),
      consultant_references (id, title, description, year, sector)
    `)
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createClient();
  const body = await request.json();

  // Update consultant base fields
  const { error: updateError } = await supabase
    .from("consultants")
    .update({
      name: body.name,
      level: body.level,
      years_experience: body.yearsExperience,
      summary: body.summary,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Replace competencies if provided
  if (body.competencies) {
    await supabase
      .from("consultant_competencies")
      .delete()
      .eq("consultant_id", id);

    if (body.competencies.length > 0) {
      const { error: compError } = await supabase
        .from("consultant_competencies")
        .insert(
          body.competencies.map((c: { competency: string; category: string }) => ({
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

  // Replace references if provided
  if (body.references) {
    await supabase
      .from("consultant_references")
      .delete()
      .eq("consultant_id", id);

    if (body.references.length > 0) {
      const { error: refError } = await supabase
        .from("consultant_references")
        .insert(
          body.references.map(
            (r: { title: string; description: string; year: number; sector: string }) => ({
              consultant_id: id,
              title: r.title,
              description: r.description,
              year: r.year,
              sector: r.sector,
            })
          )
        );
      if (refError) {
        return NextResponse.json({ error: refError.message }, { status: 500 });
      }
    }
  }

  // Return updated consultant
  const { data } = await supabase
    .from("consultants")
    .select(`
      *,
      consultant_competencies (id, competency, category),
      consultant_references (id, title, description, year, sector)
    `)
    .eq("id", id)
    .single();

  return NextResponse.json(data);
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createClient();

  const { error } = await supabase.from("consultants").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
