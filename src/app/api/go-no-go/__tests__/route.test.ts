import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const h = vi.hoisted(() => {
  const state = {
    analysisRow: { analysis: { title: "RFP" } } as unknown,
    matchRows: [{ team_proposal: [] }] as { team_proposal: unknown[] }[],
    inserted: [] as Record<string, unknown>[],
    unauthed: false,
  };
  return { state };
});

vi.mock("@/lib/supabase", () => ({
  createServiceClient: () => ({
    from: (table: string) => ({
      select: () => {
        if (table === "analyses") {
          return { eq: () => ({ single: () => Promise.resolve({ data: h.state.analysisRow, error: null }) }) };
        }
        // matches
        return { eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: h.state.matchRows, error: null }) }) }) };
      },
      insert: (payload: Record<string, unknown>) => {
        h.state.inserted.push(payload);
        return {
          select: () => ({
            single: () => Promise.resolve({ data: { id: "new-assessment-id" }, error: null }),
          }),
        };
      },
    }),
  }),
  fetchConsultantsByIds: async () => [],
}));

vi.mock("@/lib/go-no-go-evaluator", () => ({
  evaluateGoNoGo: async () => ({ winProbability: 55 }),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
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

import { POST } from "../route";

function makeRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

beforeEach(() => {
  h.state.analysisRow = { analysis: { title: "RFP" } };
  h.state.matchRows = [{ team_proposal: [] }];
  h.state.inserted = [];
  h.state.unauthed = false;
});

describe("POST /api/go-no-go", () => {
  it("401s an unauthenticated call without inserting anything", async () => {
    h.state.unauthed = true;
    const res = await POST(makeRequest({ analysisId: "11111111-1111-1111-1111-111111111111" }));
    expect(res.status).toBe(401);
    expect(h.state.inserted).toHaveLength(0);
  });

  it("400s on an invalid body", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });
});
