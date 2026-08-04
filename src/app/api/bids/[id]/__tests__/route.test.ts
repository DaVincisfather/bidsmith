import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const h = vi.hoisted(() => {
  const state = {
    updateResult: { data: null as unknown, error: null as { message: string } | null },
    statusRow: { data: null as unknown, error: null },
    updateHadNeq: false,
    updatePayloads: [] as unknown[],
  };
  return { state };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      update: (payload: unknown) => {
        h.state.updatePayloads.push(payload);
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
      select: () => ({ eq: () => ({ single: async () => h.state.statusRow }) }),
    }),
  }),
}));

import { PATCH } from "../route";

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
  h.state.updateHadNeq = false;
  h.state.updatePayloads.length = 0;
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
