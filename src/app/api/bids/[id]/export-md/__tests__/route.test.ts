import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const h = vi.hoisted(() => {
  const singleMock = vi.fn();
  const updatePayloads: unknown[] = [];
  const state = { unauthed: false };
  return { singleMock, updatePayloads, state };
});

vi.mock("@/lib/supabase", () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ single: h.singleMock }) }),
      update: (payload: unknown) => {
        h.updatePayloads.push(payload);
        return { eq: () => Promise.resolve({ error: null }) };
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
const SECTIONS = [
  {
    type: "ai",
    key: "slot-1",
    title: "Om oss",
    content: { format: "generic-prose", placeholder: "p", text: "Vi är en konsultfirma." },
    generatedAt: "2026-08-03T00:00:00Z",
  },
];

function makeRequest(): NextRequest {
  return {} as unknown as NextRequest;
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function bidRow(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      sections: SECTIONS,
      status: "draft",
      failed_bundles: [],
      exported_at: null,
      ...overrides,
    },
    error: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.updatePayloads.length = 0;
  h.state.unauthed = false;
});

describe("POST /api/bids/[id]/export-md — pure download since the submission split", () => {
  // Export no longer mutates anything (submission moved to /submit, 2026-08-14),
  // but the route stays POST: the client already POSTs, and re-opening a GET
  // surface would re-litigate the prefetch/CSRF reasoning from #105 for zero
  // user value.
  it("exposes no GET handler", () => {
    expect("GET" in route).toBe(false);
  });

  it("401s an unauthenticated call instead of an unhandled 500 (requireUser, routine follow-up #116)", async () => {
    h.state.unauthed = true;

    const res = await route.POST(makeRequest(), ctx(VALID_ID));

    expect(res.status).toBe(401);
  });

  it("exports a draft as markdown WITHOUT touching status (submission is explicit)", async () => {
    h.singleMock.mockResolvedValue(bidRow());

    const res = await route.POST(makeRequest(), ctx(VALID_ID));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/markdown");
    expect(await res.text()).toContain("Vi är en konsultfirma.");
    expect(h.updatePayloads).toHaveLength(0);
  });

  it("re-exports an already submitted bid unchanged", async () => {
    h.singleMock.mockResolvedValue(
      bidRow({ status: "exported", exported_at: "2026-08-01T10:00:00Z" }),
    );

    const res = await route.POST(makeRequest(), ctx(VALID_ID));

    expect(res.status).toBe(200);
    expect(h.updatePayloads).toHaveLength(0);
  });

  it.each([
    ["generating", bidRow({ status: "generating" })],
    ["failed", bidRow({ status: "failed" })],
    ["partial (failed bundles)", bidRow({ failed_bundles: ["phases"] })],
  ])("refuses %s bids with 409", async (_label, row) => {
    h.singleMock.mockResolvedValue(row);

    const res = await route.POST(makeRequest(), ctx(VALID_ID));

    expect(res.status).toBe(409);
    expect(h.updatePayloads).toHaveLength(0);
  });

  it("404s when the bid does not exist", async () => {
    h.singleMock.mockResolvedValue({ data: null, error: { message: "not found" } });

    const res = await route.POST(makeRequest(), ctx(VALID_ID));

    expect(res.status).toBe(404);
    expect(h.updatePayloads).toHaveLength(0);
  });
});
