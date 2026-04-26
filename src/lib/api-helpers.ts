import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

/**
 * Parses and validates a JSON request body against a Zod schema.
 *
 * Why: routes used to do `body as { ... }` casts plus hand-rolled enum/required
 * checks. Centralising this gives uniform 400 responses and prevents drift.
 *
 * Returns a discriminated union — caller does `if (!result.ok) return result.response`.
 */
export async function parseBody<T>(
  request: NextRequest | Request,
  schema: z.ZodType<T>
): Promise<ParseResult<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      ),
    };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first.path.length ? first.path.join(".") + ": " : "";
    return {
      ok: false,
      response: NextResponse.json(
        { error: `${path}${first.message}`, issues: parsed.error.issues },
        { status: 400 }
      ),
    };
  }

  return { ok: true, data: parsed.data };
}
