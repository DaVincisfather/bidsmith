import { describe, it, expect, vi } from "vitest";
import {
  mapAppUserRow,
  countAppUsers,
  getAppUser,
  findAppUserByEmail,
  createInvite,
  activateAppUser,
  requireAdmin,
} from "../access";

// Minimal chainable Supabase mock builder. Each test wires the leaf it needs.
function serviceMock(over: Record<string, unknown> = {}) {
  return over as never;
}

describe("mapAppUserRow", () => {
  it("maps snake_case row to AppUser", () => {
    const u = mapAppUserRow({
      id: "u1", email: "a@b.se", role: "admin", status: "active",
      invited_by: null, created_at: "t1", updated_at: "t2",
    });
    expect(u).toEqual({
      id: "u1", email: "a@b.se", role: "admin", status: "active",
      invitedBy: null, createdAt: "t1", updatedAt: "t2",
    });
  });
});

describe("countAppUsers", () => {
  it("returns the head-count", async () => {
    const service = serviceMock({
      from: () => ({ select: () => Promise.resolve({ count: 3, error: null }) }),
    });
    expect(await countAppUsers(service)).toBe(3);
  });
  it("throws on error", async () => {
    const service = serviceMock({
      from: () => ({ select: () => Promise.resolve({ count: null, error: { message: "boom" } }) }),
    });
    await expect(countAppUsers(service)).rejects.toThrow("boom");
  });
});

describe("getAppUser", () => {
  it("returns null when no row", async () => {
    const service = serviceMock({
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }),
    });
    expect(await getAppUser(service, "u1")).toBeNull();
  });
  it("maps the row when found", async () => {
    const row = { id: "u1", email: "a@b.se", role: "member", status: "invited", invited_by: "x", created_at: "t", updated_at: "t" };
    const service = serviceMock({
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }) }) }),
    });
    expect((await getAppUser(service, "u1"))?.role).toBe("member");
  });
});

describe("findAppUserByEmail", () => {
  it("looks up case-insensitively and returns null when absent", async () => {
    const ilike = vi.fn(() => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }));
    const service = serviceMock({ from: () => ({ select: () => ({ ilike }) }) });
    expect(await findAppUserByEmail(service, "A@B.se")).toBeNull();
    expect(ilike).toHaveBeenCalledWith("email", "A@B.se");
  });
  it("escapes ILIKE metacharacters so an underscore in the local-part is literal", async () => {
    const ilike = vi.fn(() => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }));
    const service = serviceMock({ from: () => ({ select: () => ({ ilike }) }) });
    expect(await findAppUserByEmail(service, "jo_n@x.se")).toBeNull();
    expect(ilike).toHaveBeenCalledWith("email", "jo\\_n@x.se");
  });
});

describe("createInvite", () => {
  it("invites via admin API then inserts the row", async () => {
    const invite = vi.fn(() => Promise.resolve({ data: { user: { id: "new-id" } }, error: null }));
    const single = vi.fn(() => Promise.resolve({
      data: { id: "new-id", email: "c@d.se", role: "member", status: "invited", invited_by: "admin1", created_at: "t", updated_at: "t" },
      error: null,
    }));
    const insert = vi.fn(() => ({ select: () => ({ single }) }));
    const service = serviceMock({
      auth: { admin: { inviteUserByEmail: invite } },
      from: () => ({ insert }),
    });
    const u = await createInvite(service, { email: "c@d.se", role: "member", invitedBy: "admin1" });
    expect(invite).toHaveBeenCalledWith("c@d.se");
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ id: "new-id", email: "c@d.se", role: "member", status: "invited", invited_by: "admin1" }));
    expect(u.appUser.id).toBe("new-id");
    expect(u.adopted).toBe(false);
  });
  it("throws and does NOT insert when the invite fails", async () => {
    const invite = vi.fn(() => Promise.resolve({ data: { user: null }, error: { message: "smtp down" } }));
    const insert = vi.fn();
    const service = serviceMock({ auth: { admin: { inviteUserByEmail: invite } }, from: () => ({ insert }) });
    await expect(createInvite(service, { email: "c@d.se", role: "member", invitedBy: null })).rejects.toThrow("smtp down");
    expect(insert).not.toHaveBeenCalled();
  });
  it("adopts an existing auth account (case-insensitively) when the invite fails with email_exists", async () => {
    const invite = vi.fn(() => Promise.resolve({
      data: { user: null },
      error: { code: "email_exists", message: "A user with this email address has already been registered" },
    }));
    const listUsers = vi.fn(() => Promise.resolve({
      data: { users: [{ id: "other", email: "x@y.se" }, { id: "old-id", email: "C@d.se" }] },
      error: null,
    }));
    const single = vi.fn(() => Promise.resolve({
      data: { id: "old-id", email: "c@d.se", role: "admin", status: "invited", invited_by: null, created_at: "t", updated_at: "t" },
      error: null,
    }));
    const insert = vi.fn(() => ({ select: () => ({ single }) }));
    const service = serviceMock({
      auth: { admin: { inviteUserByEmail: invite, listUsers } },
      from: () => ({ insert }),
    });
    const r = await createInvite(service, { email: "c@d.se", role: "admin", invitedBy: null });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ id: "old-id", email: "c@d.se", role: "admin", status: "invited" }));
    expect(r.adopted).toBe(true);
    expect(r.appUser.id).toBe("old-id");
  });
  it("throws and does NOT insert when email_exists but no auth account matches the email", async () => {
    const invite = vi.fn(() => Promise.resolve({
      data: { user: null },
      error: { code: "email_exists", message: "A user with this email address has already been registered" },
    }));
    const listUsers = vi.fn(() => Promise.resolve({
      data: { users: [{ id: "other", email: "x@y.se" }] },
      error: null,
    }));
    const insert = vi.fn();
    const service = serviceMock({
      auth: { admin: { inviteUserByEmail: invite, listUsers } },
      from: () => ({ insert }),
    });
    await expect(createInvite(service, { email: "c@d.se", role: "member", invitedBy: null })).rejects.toThrow(/hittades inte/i);
    expect(insert).not.toHaveBeenCalled();
  });
  it("passes redirectTo to inviteUserByEmail so the invite link lands on the callback", async () => {
    const invite = vi.fn(() => Promise.resolve({ data: { user: { id: "new-id" } }, error: null }));
    const single = vi.fn(() => Promise.resolve({
      data: { id: "new-id", email: "c@d.se", role: "member", status: "invited", invited_by: "admin1", created_at: "t", updated_at: "t" },
      error: null,
    }));
    const insert = vi.fn(() => ({ select: () => ({ single }) }));
    const service = serviceMock({
      auth: { admin: { inviteUserByEmail: invite } },
      from: () => ({ insert }),
    });
    await createInvite(service, { email: "c@d.se", role: "member", invitedBy: "admin1", redirectTo: "http://x/auth/callback" });
    expect(invite).toHaveBeenCalledWith("c@d.se", { redirectTo: "http://x/auth/callback" });
  });
});

describe("activateAppUser", () => {
  it("flips invited→active for the user", async () => {
    const statusEq = vi.fn(() => Promise.resolve({ error: null }));
    const idEq = vi.fn(() => ({ eq: statusEq }));
    const update = vi.fn(() => ({ eq: idEq }));
    const service = serviceMock({ from: () => ({ update }) });
    await activateAppUser(service, "u1");
    expect(update).toHaveBeenCalledWith({ status: "active" });
    expect(idEq).toHaveBeenCalledWith("id", "u1");
    expect(statusEq).toHaveBeenCalledWith("status", "invited");
  });
});

describe("requireAdmin", () => {
  it("401 when no session", async () => {
    const session = serviceMock({ auth: { getUser: () => Promise.resolve({ data: { user: null } }) } });
    const res = await requireAdmin(session, serviceMock());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.response.status).toBe(401);
  });
  it("403 when the caller is not admin", async () => {
    const session = serviceMock({ auth: { getUser: () => Promise.resolve({ data: { user: { id: "u1" } } }) } });
    const service = serviceMock({
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: "u1", email: "a@b.se", role: "member", status: "active", invited_by: null, created_at: "t", updated_at: "t" }, error: null }) }) }) }),
    });
    const res = await requireAdmin(session, service);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.response.status).toBe(403);
  });
  it("ok with the AppUser when admin", async () => {
    const session = serviceMock({ auth: { getUser: () => Promise.resolve({ data: { user: { id: "u1" } } }) } });
    const service = serviceMock({
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: "u1", email: "a@b.se", role: "admin", status: "active", invited_by: null, created_at: "t", updated_at: "t" }, error: null }) }) }) }),
    });
    const res = await requireAdmin(session, service);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.role).toBe("admin");
  });
});
