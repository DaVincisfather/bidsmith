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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates a route path param that must be a UUID.
 *
 * Why: a malformed id otherwise reaches Postgres, which throws
 * "invalid input syntax for type uuid" — a raw DB error leaked to the
 * client with the wrong status code (500 instead of 400).
 */
export function parseUuidParam(id: string, name = "id"): ParseResult<string> {
  if (UUID_RE.test(id)) return { ok: true, data: id };
  return {
    ok: false,
    response: NextResponse.json(
      { error: `Invalid ${name}: expected a UUID` },
      { status: 400 }
    ),
  };
}
