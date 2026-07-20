import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  exchangeMock: vi.fn(),
  getUserMock: vi.fn(),
  signOutMock: vi.fn(() => Promise.resolve({ error: null })),
  getAppUserMock: vi.fn(),
  activateMock: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: {
      exchangeCodeForSession: h.exchangeMock,
      getUser: h.getUserMock,
      signOut: h.signOutMock,
    },
  }),
}));
vi.mock("@/lib/supabase", () => ({ createServiceClient: () => ({}) }));
vi.mock("@/lib/access", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/access")>();
  return { ...actual, getAppUser: h.getAppUserMock, activateAppUser: h.activateMock };
});

import { GET } from "../route";

function req(url: string) {
  return new NextRequest(new Request(url));
}

beforeEach(() => {
  Object.values(h).forEach((m) => "mockReset" in m && m.mockReset());
  h.signOutMock.mockResolvedValue({ error: null });
  h.activateMock.mockResolvedValue(undefined);
});

describe("GET /auth/callback", () => {
  it("denies and signs out when there is no app_users row", async () => {
    h.exchangeMock.mockResolvedValue({ error: null });
    h.getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    h.getAppUserMock.mockResolvedValue(null);
    const res = await GET(req("http://x/auth/callback?code=abc"));
    expect(h.signOutMock).toHaveBeenCalled();
    expect(res.headers.get("location")).toContain("/login?error=no_access");
  });

  it("activates an invited user and redirects to next", async () => {
    h.exchangeMock.mockResolvedValue({ error: null });
    h.getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    h.getAppUserMock.mockResolvedValue({ id: "u1", email: "a@b.se", role: "member", status: "invited", invitedBy: null, createdAt: "t", updatedAt: "t" });
    const res = await GET(req("http://x/auth/callback?code=abc&next=/arbetsyta"));
    expect(h.activateMock).toHaveBeenCalledWith(expect.anything(), "u1");
    expect(res.headers.get("location")).toContain("/arbetsyta");
  });

  it("collapses a protocol-relative or absolute next to / (open-redirect guard)", async () => {
    h.exchangeMock.mockResolvedValue({ error: null });
    h.getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    h.getAppUserMock.mockResolvedValue({ id: "u1", email: "a@b.se", role: "admin", status: "active", invitedBy: null, createdAt: "t", updatedAt: "t" });

    const res = await GET(req("http://x/auth/callback?code=abc&next=//evil.com"));
    expect(res.headers.get("location")).toBe("http://x/");

    const res2 = await GET(req("http://x/auth/callback?code=abc&next=https://evil.com"));
    expect(res2.headers.get("location")).toBe("http://x/");
  });

  it("does not re-activate an already active user", async () => {
    h.exchangeMock.mockResolvedValue({ error: null });
    h.getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    h.getAppUserMock.mockResolvedValue({ id: "u1", email: "a@b.se", role: "admin", status: "active", invitedBy: null, createdAt: "t", updatedAt: "t" });
    const res = await GET(req("http://x/auth/callback?code=abc"));
    expect(h.activateMock).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBe("http://x/");
  });

  it("redirects to login with the error when the code exchange fails", async () => {
    h.exchangeMock.mockResolvedValue({ error: { message: "bad code" } });
    const res = await GET(req("http://x/auth/callback?code=abc"));
    expect(res.headers.get("location")).toContain("/login?error=");
    expect(h.getAppUserMock).not.toHaveBeenCalled();
  });
});
