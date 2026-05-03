import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { clearBudgetCache } from "@/lib/pptx-template/budget-loader";

/**
 * POST /api/admin/clear-budget-cache
 * Body: { name?: string }
 *
 * Clears the in-process FieldBudgets cache (all entries if no name, otherwise
 * just the named template). Required during T15 budget-calibration when Stefan
 * edits template_configs.budgets via Supabase SQL Editor — without this the
 * warm Vercel/Next.js instance keeps serving stale budgets until restart.
 *
 * Auth: any authenticated user. Acceptable for v1 (single dev). When multi-tenant
 * onboarding lands, scope to admin role.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { name?: unknown };
  const name = typeof body.name === "string" ? body.name : undefined;

  clearBudgetCache(name);

  return NextResponse.json({ ok: true, cleared: name ?? "all" });
}
