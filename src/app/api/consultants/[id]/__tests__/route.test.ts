import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const h = vi.hoisted(() => {
  const state = { unauthed: false };
  const dbCalls: string[] = [];
  return { state, dbCalls };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      h.dbCalls.push(table);
      const chain = {
        update: () => chain,
        delete: () => chain,
        eq: () => chain,
        select: () => Promise.resolve({ data: [], error: null }),
      };
      return chain;
    },
  }),
}));

vi.mock("@/lib/supabase", () => ({
  createServiceClient: () => ({
    storage: { from: () => ({ remove: async () => ({ error: null }) }) },
  }),
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

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function putRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.state.unauthed = false;
  h.dbCalls.length = 0;
});

describe("auth på konsult-mutationer (#103-regeln, audit 2026-08-17)", () => {
  it("PUT 401:ar oautentiserat anrop före all DB-åtkomst", async () => {
    h.state.unauthed = true;

    const res = await route.PUT(putRequest({ name: "X" }), ctx(VALID_ID));

    expect(res.status).toBe(401);
    expect(h.dbCalls).toHaveLength(0);
  });

  it("DELETE 401:ar oautentiserat anrop före all DB-åtkomst", async () => {
    h.state.unauthed = true;

    const res = await route.DELETE({} as NextRequest, ctx(VALID_ID));

    expect(res.status).toBe(401);
    expect(h.dbCalls).toHaveLength(0);
  });

  it("ogiltigt id ger 400 utan DB-åtkomst oavsett auth", async () => {
    const res = await route.PUT(putRequest({ name: "X" }), ctx("not-a-uuid"));

    expect(res.status).toBe(400);
    expect(h.dbCalls).toHaveLength(0);
  });
});
