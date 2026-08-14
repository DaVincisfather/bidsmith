// @vitest-environment node
import { describe, it, expect } from "vitest";
import { exportReadinessGuard } from "../bid-export-guards";

function bidRow(overrides: Record<string, unknown> = {}) {
  return { status: "draft", failed_bundles: [], ...overrides };
}

describe("exportReadinessGuard — shared refusal semantics for both export routes", () => {
  it("passes a clean draft through with the bid narrowed", () => {
    const row = bidRow();
    const guard = exportReadinessGuard(row, null);
    expect(guard.ok).toBe(true);
    if (guard.ok) expect(guard.bid).toBe(row);
  });

  it("passes an already submitted bid through (re-export is allowed)", () => {
    const guard = exportReadinessGuard(bidRow({ status: "exported" }), null);
    expect(guard.ok).toBe(true);
  });

  it.each([
    ["missing row", null, null, 404],
    ["query error", bidRow(), { message: "boom" }, 404],
    ["generating", bidRow({ status: "generating" }), null, 409],
    ["failed", bidRow({ status: "failed" }), null, 409],
    ["partial (failed bundles)", bidRow({ failed_bundles: ["phases"] }), null, 409],
  ] as const)("refuses %s", (_label, row, err, status) => {
    // A query error with a present row must still refuse — a 404 on error is
    // the fail-closed reading of "we don't know what state the bid is in".
    const guard = exportReadinessGuard(row, err);
    expect(guard.ok).toBe(false);
    if (!guard.ok) expect(guard.response.status).toBe(status);
  });
});
