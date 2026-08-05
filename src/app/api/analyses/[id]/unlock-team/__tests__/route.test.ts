import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const h = vi.hoisted(() => {
  const state = {
    bids: [] as unknown[],
    deletedFrom: [] as string[],
    deleteErrors: {} as Record<string, { message: string } | null>,
    deleteFilters: [] as { table: string; filters: [string, string, unknown][] }[],
  };
  return { state };
});

vi.mock("@/lib/supabase", () => ({
  createServiceClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => Promise.resolve({ data: h.state.bids, error: null }),
      }),
      delete: () => {
        const filters: [string, string, unknown][] = [];
        const chain = {
          eq: (c: string, v: unknown) => { filters.push(["eq", c, v]); return chain; },
          is: (c: string, v: unknown) => { filters.push(["is", c, v]); return chain; },
          neq: (c: string, v: unknown) => { filters.push(["neq", c, v]); return chain; },
          then: (
            resolve: (v: { error: { message: string } | null }) => void,
          ) => {
            h.state.deletedFrom.push(table);
            h.state.deleteFilters.push({ table, filters });
            resolve({ error: h.state.deleteErrors?.[table] ?? null });
          },
        };
        return chain;
      },
    }),
  }),
}));

import { POST } from "../route";

const VALID_ID = "11111111-1111-1111-1111-111111111111";

function makeRequest(): NextRequest {
  return {} as unknown as NextRequest;
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  h.state.bids = [];
  h.state.deletedFrom = [];
  h.state.deleteErrors = {};
  h.state.deleteFilters = [];
});

describe("POST /api/analyses/[id]/unlock-team — hard reset", () => {
  it("deletes assessments and draft bids for the analysis", async () => {
    h.state.bids = [{ id: "b-1", status: "draft", exported_at: null, created_at: new Date().toISOString() }];
    const res = await POST(makeRequest(), ctx(VALID_ID));
    expect(res.status).toBe(200);
    expect(h.state.deletedFrom).toEqual(["bids", "go_no_go_assessments"]);
    const bidsDelete = h.state.deleteFilters.find((d) => d.table === "bids");
    expect(bidsDelete?.filters).toContainEqual(["is", "exported_at", null]);
    expect(bidsDelete?.filters).toContainEqual(["neq", "status", "exported"]);
  });

  it("resets an analysis with an assessment but no bid yet", async () => {
    const res = await POST(makeRequest(), ctx(VALID_ID));
    expect(res.status).toBe(200);
    expect(h.state.deletedFrom).toEqual(["bids", "go_no_go_assessments"]);
  });

  it("409s when the bid is exported (frozen flow), deleting nothing", async () => {
    h.state.bids = [
      { id: "b-1", status: "exported", exported_at: "2026-08-01T10:00:00Z", created_at: new Date().toISOString() },
    ];
    const res = await POST(makeRequest(), ctx(VALID_ID));
    expect(res.status).toBe(409);
    expect(h.state.deletedFrom).toHaveLength(0);
  });

  it("409s while generation is running, deleting nothing", async () => {
    h.state.bids = [{ id: "b-1", status: "generating", exported_at: null, created_at: new Date().toISOString() }];
    const res = await POST(makeRequest(), ctx(VALID_ID));
    expect(res.status).toBe(409);
    expect(h.state.deletedFrom).toHaveLength(0);
  });

  it("deletes everything when the only generating bid is a stale dead job", async () => {
    h.state.bids = [{
      id: "b-1", status: "generating", exported_at: null,
      created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    }];
    const res = await POST(makeRequest(), ctx(VALID_ID));
    expect(res.status).toBe(200);
    expect(h.state.deletedFrom).toEqual(["bids", "go_no_go_assessments"]);
  });

  it("500s with retry copy when the assessments delete fails after bids were deleted", async () => {
    h.state.bids = [{ id: "b-1", status: "draft", exported_at: null, created_at: new Date().toISOString() }];
    h.state.deleteErrors = { go_no_go_assessments: { message: "connection lost" } };
    const res = await POST(makeRequest(), ctx(VALID_ID));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain("försök igen");
    expect(h.state.deletedFrom).toEqual(["bids", "go_no_go_assessments"]);
  });

  it("400s on a malformed id", async () => {
    const res = await POST(makeRequest(), ctx("not-a-uuid"));
    expect(res.status).toBe(400);
  });
});
