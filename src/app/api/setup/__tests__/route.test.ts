import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  countAppUsersMock: vi.fn(),
  createInviteMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({ createServiceClient: () => ({}) }));
vi.mock("@/lib/access", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/access")>();
  return { ...actual, countAppUsers: h.countAppUsersMock, createInvite: h.createInviteMock };
});

import { GET as statusGET } from "../status/route";
import { POST as bootstrapPOST } from "../bootstrap/route";

// Cast to NextRequest: bootstrapPOST is typed against NextRequest (App Router
// route handler convention), but a plain Request satisfies everything the
// handler actually calls (parseBody only reads .json()). Same pattern as
// consultants/upload/__tests__/route.test.ts's makeRequest.
function jsonRequest(body: unknown): NextRequest {
  return new Request("http://x/api/setup/bootstrap", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  h.countAppUsersMock.mockReset();
  h.createInviteMock.mockReset();
});

describe("GET /api/setup/status", () => {
  it("needsSetup:true when there are zero users", async () => {
    h.countAppUsersMock.mockResolvedValue(0);
    const res = await statusGET();
    expect(await res.json()).toEqual({ needsSetup: true });
  });
  it("needsSetup:false once a user exists", async () => {
    h.countAppUsersMock.mockResolvedValue(1);
    const res = await statusGET();
    expect(await res.json()).toEqual({ needsSetup: false });
  });
});

describe("POST /api/setup/bootstrap", () => {
  it("creates the first admin when the table is empty", async () => {
    h.countAppUsersMock.mockResolvedValue(0);
    h.createInviteMock.mockResolvedValue({ appUser: { id: "admin-id" }, adopted: false });
    const res = await bootstrapPOST(jsonRequest({ email: "boss@firm.se" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "admin-id", adopted: false });
    expect(h.createInviteMock).toHaveBeenCalledWith(expect.anything(), { email: "boss@firm.se", role: "admin", invitedBy: null, redirectTo: "http://x/auth/callback" });
  });
  it("flags adoption in the response when the email already had an auth account", async () => {
    h.countAppUsersMock.mockResolvedValue(0);
    h.createInviteMock.mockResolvedValue({ appUser: { id: "old-id" }, adopted: true });
    const res = await bootstrapPOST(jsonRequest({ email: "upgrade@firm.se" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "old-id", adopted: true });
  });
  it("409s and does not invite when setup already ran", async () => {
    h.countAppUsersMock.mockResolvedValue(1);
    const res = await bootstrapPOST(jsonRequest({ email: "late@firm.se" }));
    expect(res.status).toBe(409);
    expect(h.createInviteMock).not.toHaveBeenCalled();
  });
  it("400 on an invalid email", async () => {
    h.countAppUsersMock.mockResolvedValue(0);
    const res = await bootstrapPOST(jsonRequest({ email: "not-an-email" }));
    expect(res.status).toBe(400);
    expect(h.createInviteMock).not.toHaveBeenCalled();
  });
});
