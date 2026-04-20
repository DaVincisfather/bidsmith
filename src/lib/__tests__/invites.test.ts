// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generateInviteToken,
  computeExpiresAt,
  createInvite,
  SeatLimitReachedError,
  DuplicateInviteError,
  AlreadyMemberError,
  DEFAULT_INVITE_TTL_DAYS,
} from "../invites";

describe("generateInviteToken", () => {
  it("returns a 48-char hex string (24 bytes)", () => {
    const token = generateInviteToken();
    expect(token).toMatch(/^[a-f0-9]{48}$/);
  });

  it("returns unique values across calls", () => {
    const tokens = new Set(Array.from({ length: 20 }, () => generateInviteToken()));
    expect(tokens.size).toBe(20);
  });
});

describe("computeExpiresAt", () => {
  it("returns an ISO timestamp N days in the future", () => {
    const now = new Date("2026-04-19T12:00:00.000Z");
    const expires = computeExpiresAt(now, 7);
    expect(expires).toBe("2026-04-26T12:00:00.000Z");
  });

  it("defaults to DEFAULT_INVITE_TTL_DAYS", () => {
    const now = new Date("2026-04-19T12:00:00.000Z");
    const expires = new Date(computeExpiresAt(now));
    const diffDays = (expires.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
    expect(diffDays).toBe(DEFAULT_INVITE_TTL_DAYS);
  });
});

type QueryChain = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  not: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  returns: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
};

function tableStub(overrides: Partial<QueryChain> = {}): QueryChain {
  const chain: QueryChain = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    is: vi.fn(() => chain),
    not: vi.fn(() => chain),
    single: vi.fn(async () => ({ data: null, error: null })),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    returns: vi.fn(() => chain),
    order: vi.fn(() => chain),
    ...overrides,
  };
  return chain;
}

function makeService(tables: Record<string, QueryChain>, extras: Partial<{
  listUsers: ReturnType<typeof vi.fn>;
  inviteUserByEmail: ReturnType<typeof vi.fn>;
}> = {}) {
  return {
    from: vi.fn((table: string) => tables[table] ?? tableStub()),
    auth: {
      admin: {
        listUsers:
          extras.listUsers ??
          vi.fn(async () => ({ data: { users: [] }, error: null })),
        inviteUserByEmail:
          extras.inviteUserByEmail ??
          vi.fn(async () => ({ data: {}, error: null })),
      },
    },
  } as unknown as SupabaseClient;
}

async function awaitChain<T>(chain: QueryChain, awaiter: (c: QueryChain) => Promise<T>): Promise<T> {
  return awaiter(chain);
}

describe("createInvite — seat limit enforcement", () => {
  it("throws SeatLimitReachedError when super_user count has reached limit", async () => {
    const profilesCount = tableStub();
    profilesCount.returns = vi.fn(async () => ({
      data: [
        { role: "super_user" },
        { role: "super_user" },
        { role: "super_user" },
        { role: "super_user" },
        { role: "super_user" },
      ],
      error: null,
    })) as unknown as typeof profilesCount.returns;

    const orgs = tableStub();
    orgs.single = vi.fn(async () => ({ data: { seat_limit: 5 }, error: null }));

    const invites = tableStub();

    const service = makeService({
      profiles: profilesCount,
      organizations: orgs,
      organization_invites: invites,
    });

    await expect(
      createInvite(
        {
          organizationId: "org-1",
          email: "new@example.com",
          role: "super_user",
          invitedBy: "user-1",
          redirectTo: "https://app/auth/callback",
        },
        { service }
      )
    ).rejects.toBeInstanceOf(SeatLimitReachedError);
  });

  it("allows new super_user when count is below limit", async () => {
    const profilesChain = tableStub();
    let profilesCall = 0;
    profilesChain.returns = vi.fn(async () => {
      profilesCall += 1;
      if (profilesCall === 1) return { data: [], error: null };
      return { data: [{ role: "super_user" }], error: null };
    }) as unknown as typeof profilesChain.returns;

    const orgs = tableStub();
    orgs.single = vi.fn(async () => ({ data: { seat_limit: 5 }, error: null }));

    const invites = tableStub();
    invites.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
    invites.single = vi.fn(async () => ({ data: { id: "invite-1" }, error: null }));

    const service = makeService({
      profiles: profilesChain,
      organizations: orgs,
      organization_invites: invites,
    });

    const result = await createInvite(
      {
        organizationId: "org-1",
        email: "new@example.com",
        role: "super_user",
        invitedBy: "user-1",
        redirectTo: "https://app/auth/callback",
      },
      { service }
    );

    expect(result.inviteId).toBe("invite-1");
    expect(result.token).toMatch(/^[a-f0-9]{48}$/);
  });

  it("does not check seat limit for role 'user'", async () => {
    const profilesChain = tableStub();
    profilesChain.returns = vi.fn(async () => ({ data: [], error: null })) as unknown as typeof profilesChain.returns;

    const orgs = tableStub();
    const getLimitSpy = vi.fn(async () => ({ data: { seat_limit: 5 }, error: null }));
    orgs.single = getLimitSpy;

    const invites = tableStub();
    invites.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
    invites.single = vi.fn(async () => ({ data: { id: "invite-2" }, error: null }));

    const service = makeService({
      profiles: profilesChain,
      organizations: orgs,
      organization_invites: invites,
    });

    await createInvite(
      {
        organizationId: "org-1",
        email: "reader@example.com",
        role: "user",
        invitedBy: "user-1",
        redirectTo: "https://app/auth/callback",
      },
      { service }
    );

    expect(getLimitSpy).not.toHaveBeenCalled();
  });
});

describe("createInvite — duplicate and already-member guards", () => {
  it("throws DuplicateInviteError when a pending invite exists", async () => {
    const profilesChain = tableStub();
    profilesChain.returns = vi.fn(async () => ({ data: [], error: null })) as unknown as typeof profilesChain.returns;

    const invites = tableStub();
    invites.maybeSingle = vi.fn(async () => ({
      data: { id: "old-invite", accepted_at: null },
      error: null,
    }));

    const service = makeService({
      profiles: profilesChain,
      organization_invites: invites,
    });

    await expect(
      createInvite(
        {
          organizationId: "org-1",
          email: "dup@example.com",
          role: "user",
          invitedBy: "user-1",
          redirectTo: "https://app/auth/callback",
        },
        { service }
      )
    ).rejects.toBeInstanceOf(DuplicateInviteError);
  });

  it("throws AlreadyMemberError when email matches an existing profile", async () => {
    const profilesChain = tableStub();
    profilesChain.returns = vi.fn(async () => ({
      data: [{ user_id: "existing-user", organization_id: "org-1" }],
      error: null,
    })) as unknown as typeof profilesChain.returns;

    const invites = tableStub();
    invites.maybeSingle = vi.fn(async () => ({ data: null, error: null }));

    const service = makeService(
      { profiles: profilesChain, organization_invites: invites },
      {
        listUsers: vi.fn(async () => ({
          data: {
            users: [{ id: "existing-user", email: "member@example.com" }],
          },
          error: null,
        })),
      }
    );

    await expect(
      createInvite(
        {
          organizationId: "org-1",
          email: "MEMBER@example.com",
          role: "user",
          invitedBy: "user-1",
          redirectTo: "https://app/auth/callback",
        },
        { service }
      )
    ).rejects.toBeInstanceOf(AlreadyMemberError);
  });
});

describe("createInvite — email normalization", () => {
  it("stores email lowercased and trimmed", async () => {
    const profilesChain = tableStub();
    profilesChain.returns = vi.fn(async () => ({ data: [], error: null })) as unknown as typeof profilesChain.returns;

    const invites = tableStub();
    invites.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
    const insertSpy = vi.fn(() => invites);
    invites.insert = insertSpy;
    invites.single = vi.fn(async () => ({ data: { id: "invite-3" }, error: null }));

    const service = makeService({ profiles: profilesChain, organization_invites: invites });

    await createInvite(
      {
        organizationId: "org-1",
        email: "  Mixed@Example.COM  ",
        role: "user",
        invitedBy: "user-1",
        redirectTo: "https://app/auth/callback",
      },
      { service }
    );

    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ email: "mixed@example.com" })
    );
  });
});

describe("createInvite — re-invite after member removal", () => {
  it("cleans up orphaned accepted invite rows before inserting the new one", async () => {
    // Scenario: Bob was invited, accepted, then removed from profiles. The
    // old invite row with accepted_at != null remains. Re-inviting Bob
    // must succeed, not fail with UNIQUE(organization_id, email).
    const profilesChain = tableStub();
    profilesChain.returns = vi.fn(async () => ({ data: [], error: null })) as unknown as typeof profilesChain.returns;

    const invites = tableStub();
    invites.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
    invites.single = vi.fn(async () => ({ data: { id: "invite-new" }, error: null }));

    const service = makeService({
      profiles: profilesChain,
      organization_invites: invites,
    });

    const result = await createInvite(
      {
        organizationId: "org-1",
        email: "bob@example.com",
        role: "user",
        invitedBy: "user-1",
        redirectTo: "https://app/auth/callback",
      },
      { service }
    );

    // Cleanup delete must have been invoked, filtering by accepted_at != null.
    expect(invites.delete).toHaveBeenCalled();
    expect(invites.not).toHaveBeenCalledWith("accepted_at", "is", null);
    // And the new insert must have succeeded.
    expect(invites.insert).toHaveBeenCalled();
    expect(result.inviteId).toBe("invite-new");
  });
});

// Silence awaitChain unused import in case we extend tests later
void awaitChain;
