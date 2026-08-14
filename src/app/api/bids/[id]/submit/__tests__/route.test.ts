import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const h = vi.hoisted(() => {
  const state = {
    bidRow: null as unknown,
    bidError: null as { message: string } | null,
    updatedRow: null as unknown,
    updateError: null as { message: string } | null,
    updateFilters: [] as [string, string, unknown][],
    updatePayloads: [] as unknown[],
    unauthed: false,
  };
  return { state };
});

vi.mock("@/lib/supabase", () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: h.state.bidRow, error: h.state.bidError }),
        }),
      }),
      update: (payload: unknown) => {
        h.state.updatePayloads.push(payload);
        const chain = {
          eq: (col: string, val: unknown) => {
            h.state.updateFilters.push(["eq", col, val]);
            return chain;
          },
          select: () => ({
            single: () =>
              Promise.resolve(
                h.state.updateError
                  ? { data: null, error: h.state.updateError }
                  : { data: h.state.updatedRow, error: null },
              ),
          }),
        };
        return chain;
      },
    }),
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({}),
}));

vi.mock("@/lib/org", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/org")>();
  return {
    ...actual,
    getUserId: async () => {
      if (h.state.unauthed) throw new actual.NotAuthenticatedError();
      return "user-1";
    },
  };
});

import * as route from "../route";

const VALID_ID = "11111111-1111-1111-1111-111111111111";

function makeRequest(): NextRequest {
  return {} as unknown as NextRequest;
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function bidRow(overrides: Record<string, unknown> = {}) {
  return {
    status: "draft",
    failed_bundles: [],
    exported_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  h.state.bidRow = bidRow();
  h.state.bidError = null;
  h.state.updatedRow = {
    id: VALID_ID,
    status: "exported",
    exported_at: "2026-08-14T10:00:00Z",
  };
  h.state.updateError = null;
  h.state.updateFilters = [];
  h.state.updatePayloads = [];
  h.state.unauthed = false;
});

describe("POST /api/bids/[id]/submit — explicit submission marker", () => {
  // The flip freezes the bid (one analysis = one bid, exported is frozen — #103)
  // and feeds outcome tracking, so it must never ride on a safe method.
  it("exposes no GET handler — a prefetch cannot submit the bid", () => {
    expect("GET" in route).toBe(false);
  });

  it("401s an unauthenticated call without touching the bid", async () => {
    h.state.unauthed = true;

    const res = await route.POST(makeRequest(), ctx(VALID_ID));

    expect(res.status).toBe(401);
    expect(h.state.updatePayloads).toHaveLength(0);
  });

  it("marks a draft as submitted with a CAS on status='draft'", async () => {
    const res = await route.POST(makeRequest(), ctx(VALID_ID));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("exported");
    expect(body.exportedAt).toBe("2026-08-14T10:00:00Z");

    expect(h.state.updatePayloads).toHaveLength(1);
    const payload = h.state.updatePayloads[0] as { status: string; exported_at: string };
    expect(payload.status).toBe("exported");
    expect(payload.exported_at).toBeTruthy();
    // CAS: only a row still in 'draft' may flip — two tabs cannot double-submit.
    expect(h.state.updateFilters).toContainEqual(["eq", "id", VALID_ID]);
    expect(h.state.updateFilters).toContainEqual(["eq", "status", "draft"]);
  });

  it.each([
    ["already submitted (status)", bidRow({ status: "exported" }), /redan markerat/i],
    ["already submitted (exported_at)", bidRow({ exported_at: "2026-08-01T10:00:00Z" }), /redan markerat/i],
    ["generating", bidRow({ status: "generating" }), /genereras/i],
    ["failed", bidRow({ status: "failed" }), /misslyckades/i],
    ["partial (failed bundles)", bidRow({ failed_bundles: ["phases"] }), /ofullständigt/i],
  ])("refuses %s with 409 and never flips", async (_label, row, copy) => {
    h.state.bidRow = row;

    const res = await route.POST(makeRequest(), ctx(VALID_ID));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(copy);
    expect(h.state.updatePayloads).toHaveLength(0);
  });

  it("409s honestly when the CAS loses the race (row changed between read and flip)", async () => {
    h.state.updateError = { message: "0 rows" };

    const res = await route.POST(makeRequest(), ctx(VALID_ID));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/ändrades samtidigt/i);
  });

  it("404s when the bid does not exist", async () => {
    h.state.bidRow = null;
    h.state.bidError = { message: "not found" };

    const res = await route.POST(makeRequest(), ctx(VALID_ID));

    expect(res.status).toBe(404);
    expect(h.state.updatePayloads).toHaveLength(0);
  });
});
