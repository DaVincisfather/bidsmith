import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const h = vi.hoisted(() => {
  const state = {
    existingBids: [] as unknown[],
    updatePayloads: [] as Record<string, unknown>[],
    insertPayloads: [] as Record<string, unknown>[],
    afterCallbacks: [] as (() => unknown)[],
    replaceResult: { data: [{ id: "b-1" }], error: null } as {
      data: { id: string }[] | null;
      error: { message: string } | null;
    },
  };
  return { state };
});

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (fn: () => unknown) => h.state.afterCallbacks.push(fn) };
});

vi.mock("@/lib/supabase", () => ({
  EMPTY_GO_NO_GO: {},
  fetchConsultantsByIds: async () => [],
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === "bids") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => Promise.resolve({ data: h.state.existingBids, error: null }),
              }),
            }),
          }),
          insert: (payload: Record<string, unknown>) => {
            h.state.insertPayloads.push(payload);
            return {
              select: () => ({
                single: () => Promise.resolve({ data: { id: "b-new", ...payload }, error: null }),
              }),
            };
          },
          update: (payload: Record<string, unknown>) => {
            h.state.updatePayloads.push(payload);
            return {
              eq: () => ({
                eq: () => ({
                  select: () => Promise.resolve(h.state.replaceResult),
                }),
              }),
            };
          },
        };
      }
      // analyses / go_no_go_assessments / matches context fetches
      return {
        select: () => ({
          eq: (_col: string, _v: string) => ({
            single: () => Promise.resolve({ data: { analysis: { title: "T" } }, error: null }),
            order: () => ({
              limit: () => Promise.resolve({ data: [{ team_proposal: [] }], error: null }),
            }),
          }),
        }),
      };
    },
  }),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/org", () => ({ getUserId: async () => "user-1" }));
vi.mock("@/lib/org-profile", () => ({ loadActiveProfile: async () => null }));
vi.mock("@/lib/pptx-template/active-template", () => ({
  loadActiveTemplate: async () => ({ id: "tpl-1", manifest: { budgets: {}, fieldSlides: [] } }),
}));
vi.mock("@/lib/bid-generator/run-bid-generation", () => ({
  runBidGeneration: vi.fn(async () => undefined),
}));

import { POST } from "../route";

function makeRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

const BODY = { analysisId: "a-1", teamConsultantIds: ["c-1"] };

beforeEach(() => {
  h.state.existingBids = [];
  h.state.updatePayloads = [];
  h.state.insertPayloads = [];
  h.state.afterCallbacks = [];
  h.state.replaceResult = { data: [{ id: "b-1" }], error: null };
});

describe("POST /api/bids — one bid per analysis", () => {
  it("creates a new bid when the analysis has none", async () => {
    const res = await POST(makeRequest(BODY));
    expect(res.status).toBe(202);
    expect((await res.json()).id).toBe("b-new");
    expect(h.state.insertPayloads).toHaveLength(1);
    expect(h.state.updatePayloads).toHaveLength(0);
    expect(h.state.afterCallbacks).toHaveLength(1);
  });

  it("replaces a draft in place: same id, wiped sections/failures, regeneration queued", async () => {
    h.state.existingBids = [{ id: "b-1", status: "draft", exported_at: null, created_at: new Date().toISOString() }];
    const res = await POST(makeRequest(BODY));
    expect(res.status).toBe(202);
    expect((await res.json()).id).toBe("b-1");
    expect(h.state.insertPayloads).toHaveLength(0);
    expect(h.state.updatePayloads).toHaveLength(1);
    const payload = h.state.updatePayloads[0];
    expect(payload.sections).toEqual([]);
    expect(payload.failed_bundles).toEqual([]);
    expect(payload.generation_error).toBeNull();
    expect(payload.status).toBe("generating");
    expect(typeof payload.created_at).toBe("string");
    expect(payload.created_at).toBeTruthy();
    expect(h.state.afterCallbacks).toHaveLength(1);
  });

  it("replaces a failed bid the same way (rerun path)", async () => {
    h.state.existingBids = [{ id: "b-1", status: "failed", exported_at: null, created_at: new Date().toISOString() }];
    const res = await POST(makeRequest(BODY));
    expect(res.status).toBe(202);
    expect((await res.json()).id).toBe("b-1");
  });

  it("409s while a generation is running, touching nothing", async () => {
    h.state.existingBids = [{ id: "b-1", status: "generating", exported_at: null, created_at: new Date().toISOString() }];
    const res = await POST(makeRequest(BODY));
    expect(res.status).toBe(409);
    expect(h.state.updatePayloads).toHaveLength(0);
    expect(h.state.afterCallbacks).toHaveLength(0);
  });

  it("409s on an exported (frozen) bid, touching nothing", async () => {
    h.state.existingBids = [
      { id: "b-1", status: "exported", exported_at: "2026-08-01T10:00:00Z", created_at: new Date().toISOString() },
    ];
    const res = await POST(makeRequest(BODY));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("fryst");
    expect(h.state.updatePayloads).toHaveLength(0);
  });

  it("409s when the replace loses a concurrent race (zero rows matched)", async () => {
    h.state.existingBids = [{ id: "b-1", status: "draft", exported_at: null, created_at: new Date().toISOString() }];
    h.state.replaceResult = { data: [], error: null };
    const res = await POST(makeRequest(BODY));
    expect(res.status).toBe(409);
    expect(h.state.afterCallbacks).toHaveLength(0);
  });

  it("replaces a stale generating bid (dead job) instead of blocking", async () => {
    h.state.existingBids = [{
      id: "b-1", status: "generating", exported_at: null,
      created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    }];
    const res = await POST(makeRequest(BODY));
    expect(res.status).toBe(202);
    expect((await res.json()).id).toBe("b-1");
    expect(h.state.updatePayloads).toHaveLength(1);
    expect(h.state.afterCallbacks).toHaveLength(1);
  });
});
