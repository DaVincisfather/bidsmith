// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
    }),
}));

const mockClearBudgetCache = vi.fn();
vi.mock("@/lib/pptx-template/budget-loader", () => ({
  clearBudgetCache: (...args: unknown[]) => mockClearBudgetCache(...args),
}));

import { POST } from "../route";

beforeEach(() => {
  mockGetUser.mockReset();
  mockClearBudgetCache.mockReset();
});

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/clear-budget-cache", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/clear-budget-cache", () => {
  it("returns 401 when no user is authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeRequest({ name: "anbudsmall-v2" }));
    expect(res.status).toBe(401);
    expect(mockClearBudgetCache).not.toHaveBeenCalled();
  });

  it("clears the named template cache when authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await POST(makeRequest({ name: "anbudsmall-v2" }));
    expect(res.status).toBe(200);
    expect(mockClearBudgetCache).toHaveBeenCalledWith("anbudsmall-v2");
    const body = await res.json();
    expect(body).toEqual({ ok: true, cleared: "anbudsmall-v2" });
  });

  it("clears all entries when no name in body", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(200);
    expect(mockClearBudgetCache).toHaveBeenCalledWith(undefined);
    const body = await res.json();
    expect(body).toEqual({ ok: true, cleared: "all" });
  });

  it("ignores non-string name and treats as no-name", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await POST(makeRequest({ name: 123 }));
    expect(res.status).toBe(200);
    expect(mockClearBudgetCache).toHaveBeenCalledWith(undefined);
  });
});
