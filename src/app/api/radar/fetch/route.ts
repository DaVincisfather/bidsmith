import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { fetchTedNotices } from "@/lib/ted-client";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();

    // 1. Get CPV codes from competencies (single workspace — no org filter)
    const { data: competencies, error: compError } = await supabase
      .from("organization_competencies")
      .select("cpv_codes");

    if (compError) {
      return NextResponse.json({ error: compError.message }, { status: 500 });
    }

    const allCpvCodes = competencies.flatMap((c: { cpv_codes: string[] }) => c.cpv_codes);
    const uniqueCpv = [...new Set(allCpvCodes)];

    if (uniqueCpv.length === 0) {
      return NextResponse.json({ message: "No CPV codes configured", fetched: 0 });
    }

    // 2. Fetch from TED
    const notices = await fetchTedNotices(uniqueCpv);

    if (notices.length === 0) {
      return NextResponse.json({ message: "No new notices from TED", fetched: 0 });
    }

    // 3. Dedup — get existing TED notice IDs
    const tedIds = notices.map((n) => n.tedNoticeId);
    const { data: existing } = await supabase
      .from("rfp_opportunities")
      .select("ted_notice_id")
      .in("ted_notice_id", tedIds);

    const existingIds = new Set((existing ?? []).map((e: { ted_notice_id: string }) => e.ted_notice_id));
    const newNotices = notices.filter((n) => !existingIds.has(n.tedNoticeId));

    if (newNotices.length === 0) {
      return NextResponse.json({ message: "All notices already exist", fetched: 0 });
    }

    // 4. Insert new opportunities
    const rows = newNotices.map((n) => ({
      ted_notice_id: n.tedNoticeId,
      title: n.title,
      buyer: n.buyer,
      country: n.country,
      cpv_codes: n.cpvCodes,
      deadline: n.deadline,
      estimated_value: n.estimatedValue,
      summary: n.summary,
      ted_url: n.tedUrl,
      raw_xml: n.rawXml,
      status: "new",
    }));

    const { error: insertError } = await supabase
      .from("rfp_opportunities")
      .insert(rows);

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ message: "Fetch complete", fetched: newNotices.length });
  } catch (error) {
    console.error("Radar fetch failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
