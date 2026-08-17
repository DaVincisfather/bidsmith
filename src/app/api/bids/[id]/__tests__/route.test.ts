import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const h = vi.hoisted(() => {
  const state = {
    updateResult: { data: null as unknown, error: null as { message: string } | null },
    statusRow: { data: null as unknown, error: null },
    updateHadNeq: false,
    updatePayloads: [] as unknown[],
    bidRow: { data: null as unknown, error: null },
    watchdogUpdatePayloads: [] as unknown[],
  };
  return { state };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      update: (payload: unknown) => {
        h.state.updatePayloads.push(payload);
        h.state.watchdogUpdatePayloads.push(payload);
        const chain = {
          eq: () => chain,
          neq: () => {
            h.state.updateHadNeq = true;
            return chain;
          },
          select: () => ({ single: async () => h.state.updateResult }),
        };
        return chain;
      },
      select: (columns?: string) => ({
        eq: () => ({
          single: async () => {
            // GET uses select("*"), PATCH status lookup uses select("status")
            if (columns === "*") {
              return h.state.bidRow;
            }
            return h.state.statusRow;
          },
        }),
      }),
    }),
  }),
}));

// Route-nivå-auth sedan #103-svepet (audit 2026-08-17) — dessa test täcker
// edit-locken/watchdogen, så sessionen mockas giltig. 401-vägen testas i
// src/app/api/__tests__/require-user-sweep.test.ts.
vi.mock("@/lib/org", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/org")>();
  return { ...actual, getUserId: async () => "user-1" };
});

import { GET, PATCH } from "../route";

const VALID_ID = "11111111-1111-1111-1111-111111111111";

function makeRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  h.state.updateResult = { data: null, error: null };
  h.state.statusRow = { data: null, error: null };
  h.state.bidRow = { data: null, error: null };
  h.state.updateHadNeq = false;
  h.state.updatePayloads.length = 0;
  h.state.watchdogUpdatePayloads.length = 0;
});

describe("PATCH /api/bids/[id] — server-side edit lock", () => {
  it("rejects a sections write while the bid is generating with 409", async () => {
    // Guarded update matches no row (status filter), status lookup says generating.
    h.state.statusRow = { data: { status: "generating" }, error: null };

    const res = await PATCH(makeRequest({ sections: [] }), ctx(VALID_ID));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("genereras");
    expect(h.state.updateHadNeq).toBe(true);
  });

  it("accepts a sections write on a draft bid", async () => {
    h.state.updateResult = {
      data: { id: VALID_ID, sections: [], outcome: null, status: "draft" },
      error: null,
    };

    const res = await PATCH(makeRequest({ sections: [] }), ctx(VALID_ID));

    expect(res.status).toBe(200);
    expect(h.state.updateHadNeq).toBe(true);
  });

  it("does not status-guard an outcome-only update", async () => {
    h.state.updateResult = {
      data: { id: VALID_ID, sections: [], outcome: "won", status: "exported" },
      error: null,
    };

    const res = await PATCH(makeRequest({ outcome: "won" }), ctx(VALID_ID));

    expect(res.status).toBe(200);
    expect(h.state.updateHadNeq).toBe(false);
  });

  it("returns 404 for a sections write on a missing bid (not 409)", async () => {
    // Update matches nothing and the status lookup finds no row either.
    const res = await PATCH(makeRequest({ sections: [] }), ctx(VALID_ID));

    expect(res.status).toBe(404);
  });
});

describe("GET /api/bids/[id] — stale-generating watchdog", () => {
  it("returns a fresh generating bid untouched", async () => {
    const freshTime = new Date().toISOString();
    h.state.bidRow = {
      data: {
        id: VALID_ID,
        status: "generating",
        created_at: freshTime,
        analysis_id: "a-1",
        assessment_id: null,
        team_consultant_ids: ["c-1"],
        sections: [],
        outcome: null,
        exported_at: null,
        failed_bundles: [],
        generation_error: null,
      },
      error: null,
    };

    const res = await GET(makeRequest(null), ctx(VALID_ID));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("generating");
    // No update should have been issued for a fresh bid
    expect(h.state.watchdogUpdatePayloads).toHaveLength(0);
  });

  it("flips a stale generating bid to failed (dead job)", async () => {
    const staleTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    h.state.bidRow = {
      data: {
        id: VALID_ID,
        status: "generating",
        created_at: staleTime,
        analysis_id: "a-1",
        assessment_id: null,
        team_consultant_ids: ["c-1"],
        sections: [],
        outcome: null,
        exported_at: null,
        failed_bundles: [],
        generation_error: null,
      },
      error: null,
    };
    // After the watchdog update, the bid row reflects the new status
    h.state.updateResult = {
      data: {
        id: VALID_ID,
        status: "failed",
        created_at: staleTime,
        analysis_id: "a-1",
        assessment_id: null,
        team_consultant_ids: ["c-1"],
        sections: [],
        outcome: null,
        exported_at: null,
        failed_bundles: [],
        generation_error: "Genereringen tog för lång tid och avbröts.",
      },
      error: null,
    };

    const res = await GET(makeRequest(null), ctx(VALID_ID));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("failed");
    expect(body.generationError).toBe("Genereringen tog för lång tid och avbröts.");
    // Watchdog should have issued an update with the exact fields
    expect(h.state.watchdogUpdatePayloads).toHaveLength(1);
    const payload = h.state.watchdogUpdatePayloads[0] as Record<string, unknown>;
    expect(payload.status).toBe("failed");
    expect(payload.generation_error).toBe("Genereringen tog för lång tid och avbröts.");
  });

  it("leaves non-generating statuses alone regardless of age", async () => {
    const oldTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    h.state.bidRow = {
      data: {
        id: VALID_ID,
        status: "draft",
        created_at: oldTime,
        analysis_id: "a-1",
        assessment_id: null,
        team_consultant_ids: ["c-1"],
        sections: [],
        outcome: null,
        exported_at: null,
        failed_bundles: [],
        generation_error: null,
      },
      error: null,
    };

    const res = await GET(makeRequest(null), ctx(VALID_ID));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("draft");
    // No update should have been issued for a non-generating bid
    expect(h.state.watchdogUpdatePayloads).toHaveLength(0);
  });
});
