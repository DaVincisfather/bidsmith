import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  findByEmailMock: vi.fn(),
  createInviteMock: vi.fn(),
  listMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/supabase", () => ({
  createServiceClient: () => ({
    from: () => ({ select: () => ({ order: h.listMock }) }),
  }),
}));
vi.mock("@/lib/access", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/access")>();
  return {
    ...actual,
    requireAdmin: h.requireAdminMock,
    findAppUserByEmail: h.findByEmailMock,
    createInvite: h.createInviteMock,
  };
});

import { GET, POST } from "../route";
import { NextResponse, type NextRequest } from "next/server";

function jsonReq(body: unknown): NextRequest {
  return new Request("http://x/api/admin/users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}
const okAdmin = { ok: true, data: { id: "admin1", role: "admin" } };

beforeEach(() => {
  Object.values(h).forEach((m) => m.mockReset());
});

describe("GET /api/admin/users", () => {
  it("403 for a non-admin", async () => {
    h.requireAdminMock.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
    const res = await GET();
    expect(res.status).toBe(403);
    expect(h.listMock).not.toHaveBeenCalled();
  });
  it("lists rows for an admin", async () => {
    h.requireAdminMock.mockResolvedValue(okAdmin);
    h.listMock.mockResolvedValue({ data: [{ id: "u1", email: "a@b.se", role: "admin", status: "active", invited_by: null, created_at: "t", updated_at: "t" }], error: null });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.users[0].email).toBe("a@b.se");
  });
});

describe("POST /api/admin/users", () => {
  it("403 for a non-admin, without inviting", async () => {
    h.requireAdminMock.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
    const res = await POST(jsonReq({ email: "new@firm.se" }));
    expect(res.status).toBe(403);
    expect(h.createInviteMock).not.toHaveBeenCalled();
  });
  it("409 when the email already exists", async () => {
    h.requireAdminMock.mockResolvedValue(okAdmin);
    h.findByEmailMock.mockResolvedValue({ id: "existing" });
    const res = await POST(jsonReq({ email: "dupe@firm.se" }));
    expect(res.status).toBe(409);
    expect(h.createInviteMock).not.toHaveBeenCalled();
  });
  it("invites a new member as role=member", async () => {
    h.requireAdminMock.mockResolvedValue(okAdmin);
    h.findByEmailMock.mockResolvedValue(null);
    h.createInviteMock.mockResolvedValue({ id: "member-id" });
    const res = await POST(jsonReq({ email: "new@firm.se" }));
    expect(res.status).toBe(201);
    expect(h.createInviteMock).toHaveBeenCalledWith(expect.anything(), { email: "new@firm.se", role: "member", invitedBy: "admin1", redirectTo: "http://x/auth/callback" });
  });
});
