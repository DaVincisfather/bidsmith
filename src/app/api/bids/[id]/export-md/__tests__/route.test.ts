import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const h = vi.hoisted(() => {
  const singleMock = vi.fn();
  const updatePayloads: unknown[] = [];
  const state = { updateError: null as { message: string } | null };
  return { singleMock, updatePayloads, state };
});

vi.mock("@/lib/supabase", () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ single: h.singleMock }) }),
      update: (payload: unknown) => {
        h.updatePayloads.push(payload);
        return { eq: () => Promise.resolve({ error: h.state.updateError }) };
      },
    }),
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({}),
}));

vi.mock("@/lib/org", () => ({
  getUserId: async () => "user-1",
}));

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
  h.state.updateError = null;
});

describe("POST /api/bids/[id]/export-md — the formal export (flips status)", () => {
  // The flip freezes the bid (one analysis = one bid, exported is frozen — #103),
  // so it must never ride on a safe method: a browser prefetch, a link preview
  // unfurl or an antivirus scanner following the URL would freeze a user's draft
  // and count it as submitted in the outcome stats.
  it("exposes no GET handler — a prefetch cannot flip the bid", () => {
    expect("GET" in route).toBe(false);
  });

  it("exports a draft as markdown AND marks the bid exported", async () => {
    h.singleMock.mockResolvedValue(bidRow());

    const res = await route.POST(makeRequest(), ctx(VALID_ID));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/markdown");
    expect(await res.text()).toContain("Vi är en konsultfirma.");
    expect(h.updatePayloads).toHaveLength(1);
    const payload = h.updatePayloads[0] as { status: string; exported_at: string };
    expect(payload.status).toBe("exported");
    expect(payload.exported_at).toBeTruthy();
  });

  it("preserves the original exported_at on re-export (stats bucket by first submission)", async () => {
    h.singleMock.mockResolvedValue(
      bidRow({ status: "exported", exported_at: "2026-08-01T10:00:00Z" }),
    );

    const res = await route.POST(makeRequest(), ctx(VALID_ID));

    expect(res.status).toBe(200);
    const payload = h.updatePayloads[0] as { exported_at: string };
    expect(payload.exported_at).toBe("2026-08-01T10:00:00Z");
  });

  it("returns 500 and no file when the status flip fails (never a silent draft)", async () => {
    h.singleMock.mockResolvedValue(bidRow());
    h.state.updateError = { message: "connection lost" };

    const res = await route.POST(makeRequest(), ctx(VALID_ID));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("Export could not be recorded");
  });

  it.each([
    ["generating", bidRow({ status: "generating" })],
    ["failed", bidRow({ status: "failed" })],
    ["partial (failed bundles)", bidRow({ failed_bundles: ["phases"] })],
  ])("refuses %s bids with 409 and never touches status", async (_label, row) => {
    h.singleMock.mockResolvedValue(row);

    const res = await route.POST(makeRequest(), ctx(VALID_ID));

    expect(res.status).toBe(409);
    expect(h.updatePayloads).toHaveLength(0);
  });

  it("404s when the bid does not exist, without touching status", async () => {
    h.singleMock.mockResolvedValue({ data: null, error: { message: "not found" } });

    const res = await route.POST(makeRequest(), ctx(VALID_ID));

    expect(res.status).toBe(404);
    expect(h.updatePayloads).toHaveLength(0);
  });
});
