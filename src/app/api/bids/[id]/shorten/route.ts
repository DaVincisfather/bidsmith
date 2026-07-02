import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseBody, parseUuidParam, requireUser } from "@/lib/api-helpers";
import { ShortenRequestSchema } from "@/lib/api-schemas";
import { ShortenedTextSchema } from "@/lib/ai-schemas";
import { callClaude } from "@/lib/ai-client";
import { MODELS } from "@/lib/models";
import { shortenField } from "@/lib/bid-generator/shorten-field";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Skriver om ett enskilt flaggat fälts text till ≤ budget via writingSupport (Sonnet).
// Tunn wrapper: auth + validering + shortenField (retry/best-effort-logiken bor i libbet).
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id: rawId } = await params;
  const idResult = parseUuidParam(rawId, "bid id");
  if (!idResult.ok) return idResult.response;
  const bidId = idResult.data;

  const supabase = await createClient();
  const auth = await requireUser(supabase);
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(request, ShortenRequestSchema);
  if (!parsed.ok) return parsed.response;
  const { text, budget, fieldLabel } = parsed.data;

  try {
    const result = await shortenField({ text, budget, fieldLabel }, ({ system, userContent }) =>
      callClaude({
        model: MODELS.writingSupport,
        maxTokens: 1024,
        system,
        userContent,
        schema: ShortenedTextSchema,
        label: "shorten-field",
        bidId,
        userId: auth.data,
        temperature: 0,
      }),
    );
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Kortningen misslyckades" },
      { status: 500 },
    );
  }
}
