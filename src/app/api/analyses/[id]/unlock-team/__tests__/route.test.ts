import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const h = vi.hoisted(() => {
  const state = {
    bids: [] as unknown[],
    deletedFrom: [] as string[],
  };
  return { state };
});

vi.mock("@/lib/supabase", () => ({
  createServiceClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => Promise.resolve({ data: h.state.bids, error: null }),
      }),
      delete: () => ({
        eq: () => {
          h.state.deletedFrom.push(table);
          return Promise.resolve({ error: null });
        },
      }),
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
});

describe("POST /api/analyses/[id]/unlock-team — hard reset", () => {
  it("deletes assessments and draft bids for the analysis", async () => {
    h.state.bids = [{ id: "b-1", status: "draft", exported_at: null }];
    const res = await POST(makeRequest(), ctx(VALID_ID));
    expect(res.status).toBe(200);
    expect(h.state.deletedFrom).toContain("bids");
    expect(h.state.deletedFrom).toContain("go_no_go_assessments");
  });

  it("resets an analysis with an assessment but no bid yet", async () => {
    const res = await POST(makeRequest(), ctx(VALID_ID));
    expect(res.status).toBe(200);
    expect(h.state.deletedFrom).toContain("go_no_go_assessments");
  });

  it("409s when the bid is exported (frozen flow), deleting nothing", async () => {
    h.state.bids = [
      { id: "b-1", status: "exported", exported_at: "2026-08-01T10:00:00Z" },
    ];
    const res = await POST(makeRequest(), ctx(VALID_ID));
    expect(res.status).toBe(409);
    expect(h.state.deletedFrom).toHaveLength(0);
  });

  it("409s while generation is running, deleting nothing", async () => {
    h.state.bids = [{ id: "b-1", status: "generating", exported_at: null }];
    const res = await POST(makeRequest(), ctx(VALID_ID));
    expect(res.status).toBe(409);
    expect(h.state.deletedFrom).toHaveLength(0);
  });

  it("400s on a malformed id", async () => {
    const res = await POST(makeRequest(), ctx("not-a-uuid"));
    expect(res.status).toBe(400);
  });
});
