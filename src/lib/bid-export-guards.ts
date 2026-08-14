import { NextResponse } from "next/server";

// Shared readiness guards for the two export routes (export-md, the primary
// path, and the parked PPTX export). They were duplicated line for line and
// had begun to drift risk (routine suggestion on #100) — one place now owns
// the refusal semantics AND the copy.
//
// Mirrors the ParseResult discriminated union in api-helpers: callers do
// `if (!guard.ok) return guard.response` and get a properly narrowed bid —
// no non-null assertions. The submit route keeps its own guard chain
// deliberately: it has an extra already-submitted guard and
// submission-specific copy.
export type ExportGuardResult<T> =
  | { ok: true; bid: T }
  | { ok: false; response: NextResponse };

export function exportReadinessGuard<
  T extends { status: string; failed_bundles?: unknown },
>(bid: T | null, bidError: unknown): ExportGuardResult<T> {
  if (bidError || !bid) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Bid not found" }, { status: 404 }),
    };
  }

  if (bid.status === "generating") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Bid is still generating. Wait until status is 'draft'." },
        { status: 409 },
      ),
    };
  }

  if (bid.status === "failed") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Bid generation failed. Re-run generation before exporting." },
        { status: 409 },
      ),
    };
  }

  // A bid with failed bundle sections is partial — exporting it would hand
  // out an incomplete document (md) or a deck with raw {placeholder} tokens
  // visible (pptx).
  const failedBundles = (bid.failed_bundles as unknown[] | null) ?? [];
  if (failedBundles.length > 0) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Bid has failed sections. Re-run generation before exporting." },
        { status: 409 },
      ),
    };
  }

  return { ok: true, bid };
}
