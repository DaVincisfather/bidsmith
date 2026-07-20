# Access-modell (invite-flow) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stäng Bidsmiths öppna signup och ersätt den med en invite-flow: bara mejladresser med en `app_users`-rad kan logga in, admins bjuder in fler, och en färsk installation bootstrappar sin första admin via `/setup`.

**Architecture:** En ny `app_users`-tabell (migration 013, redan skriven) bär roll + status. All skrivning går via service-rollen i server-side API-routes; klienten får bara läsa sin egen rad (RLS). En delad hjälpmodul (`src/lib/access.ts`) kapslar in alla app_users-operationer så setup-, callback- och admin-vägarna återanvänder samma primitiver.

**Tech Stack:** Next.js 16 (App Router), Supabase (`@supabase/ssr` + `@supabase/supabase-js` admin-API), Zod, vitest + @testing-library/react.

## Global Constraints

- **Next.js 16 är INTE träningsdatans Next.** Läs `node_modules/next/dist/docs/` vid behov och **spegla de befintliga route-/sidmönstren** i `src/app/api/**/route.ts` och `src/app/**/page.tsx` istället för att anta signaturer. Route-handlers: `export async function GET/POST(request: NextRequest)`.
- **Migrationer appliceras ALDRIG av implementeraren** — migration 013 klistras in manuellt i Supabase SQL Editor av Stefan. Koden ska funka mot en DB där tabellen redan finns.
- **Ny migration ⇒ `npm run gen:setup-sql` + committa `supabase/setup.sql`** (redan gjort för 013; drift-testet `src/lib/__tests__/setup-sql.test.ts` fäller sviten annars).
- **Alla app_users-SKRIVNINGAR går via `createServiceClient()`** (`src/lib/supabase.ts`) — aldrig via den session-bundna klienten. Rollen får aldrig kunna sättas från klienten.
- **Språk:** kod/kommentarer engelska, UI-copy svenska (matcha `login/page.tsx`).
- **TypeScript strikt** — inga `any` utan motiverande kommentar.
- **Testkommando:** `npx vitest run <path>`. Kör i worktreen `C:\Users\stefa\projects\bidsmith-access` (PowerShell — bash-sandboxen ser inte alltid färska filer).
- **Verifieringsgrind innan "klart":** `npm run lint`, `npx tsc --noEmit`, `npx vitest run` — visa output.

---

## Task 0: Migration 013 + setup.sql — ✅ KLAR

Redan gjord och committad (`143889a`):
- `supabase/migrations/013_access_control.sql` — `app_users` (id→auth.users, email, role admin|member, status invited|active, invited_by, timestamps), `trigger_set_updated_at`, RLS enabled, enda policy `app_users_self_read` (`for select to authenticated using (auth.uid() = id)`).
- `supabase/setup.sql` regenererad (13 migrationer), drift-test grönt.

Implementeraren ska **inte** röra dessa filer. Stefan applicerar migrationen i SQL Editor separat.

---

## Task 1: Access-hjälpmodul + Zod-scheman

**Files:**
- Create: `src/lib/access.ts`
- Create: `src/lib/__tests__/access.test.ts`
- Modify: `src/lib/api-schemas.ts` (lägg till två scheman i slutet)

**Interfaces:**
- Consumes: `createServiceClient` från `@/lib/supabase`, `getUserId`/`NotAuthenticatedError` från `@/lib/org`, `ParseResult` från `@/lib/api-helpers`, `SupabaseClient` från `@supabase/supabase-js`.
- Produces (senare tasks förlitar sig på exakt dessa signaturer):
  - `type AppUserRole = "admin" | "member"`
  - `type AppUserStatus = "invited" | "active"`
  - `interface AppUser { id: string; email: string; role: AppUserRole; status: AppUserStatus; invitedBy: string | null; createdAt: string; updatedAt: string }`
  - `mapAppUserRow(row: Record<string, unknown>): AppUser`
  - `countAppUsers(service: SupabaseClient): Promise<number>`
  - `getAppUser(service: SupabaseClient, userId: string): Promise<AppUser | null>`
  - `findAppUserByEmail(service: SupabaseClient, email: string): Promise<AppUser | null>`
  - `createInvite(service: SupabaseClient, args: { email: string; role: AppUserRole; invitedBy: string | null }): Promise<AppUser>`
  - `activateAppUser(service: SupabaseClient, userId: string): Promise<void>`
  - `requireAdmin(sessionClient: SupabaseClient, service: SupabaseClient): Promise<ParseResult<AppUser>>`
  - Zod: `SetupBootstrapSchema`, `AdminInviteSchema` (båda `{ email: string }` validerad som e-post)

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/access.test.ts`:

```ts
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
    expect(u.id).toBe("new-id");
  });
  it("throws and does NOT insert when the invite fails", async () => {
    const invite = vi.fn(() => Promise.resolve({ data: { user: null }, error: { message: "smtp down" } }));
    const insert = vi.fn();
    const service = serviceMock({ auth: { admin: { inviteUserByEmail: invite } }, from: () => ({ insert }) });
    await expect(createInvite(service, { email: "c@d.se", role: "member", invitedBy: null })).rejects.toThrow("smtp down");
    expect(insert).not.toHaveBeenCalled();
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/access.test.ts`
Expected: FAIL — `Cannot find module '../access'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/access.ts`:

```ts
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserId, NotAuthenticatedError } from "@/lib/org";
import type { ParseResult } from "@/lib/api-helpers";

export type AppUserRole = "admin" | "member";
export type AppUserStatus = "invited" | "active";

export interface AppUser {
  id: string;
  email: string;
  role: AppUserRole;
  status: AppUserStatus;
  invitedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

const APP_USER_SELECT = "id, email, role, status, invited_by, created_at, updated_at";

export function mapAppUserRow(row: Record<string, unknown>): AppUser {
  return {
    id: row.id as string,
    email: row.email as string,
    role: row.role as AppUserRole,
    status: row.status as AppUserStatus,
    invitedBy: (row.invited_by as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/** Total app_users rows. 0 ⇒ fresh install (setup not yet run). */
export async function countAppUsers(service: SupabaseClient): Promise<number> {
  const { count, error } = await service
    .from("app_users")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function getAppUser(
  service: SupabaseClient,
  userId: string,
): Promise<AppUser | null> {
  const { data, error } = await service
    .from("app_users")
    .select(APP_USER_SELECT)
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapAppUserRow(data as Record<string, unknown>) : null;
}

export async function findAppUserByEmail(
  service: SupabaseClient,
  email: string,
): Promise<AppUser | null> {
  const { data, error } = await service
    .from("app_users")
    .select(APP_USER_SELECT)
    .ilike("email", email)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapAppUserRow(data as Record<string, unknown>) : null;
}

/**
 * Creates the auth account AND sends the invite email in one Supabase admin
 * call, then records the app_users row. The invite is the source of truth: if
 * inviteUserByEmail fails we throw BEFORE inserting, so we never leave an
 * app_users row without a matching auth account. Caller is responsible for the
 * duplicate-email pre-check (findAppUserByEmail) — a unique auth account per
 * email is enforced by Supabase auth itself.
 */
export async function createInvite(
  service: SupabaseClient,
  args: { email: string; role: AppUserRole; invitedBy: string | null },
): Promise<AppUser> {
  const { data, error } = await service.auth.admin.inviteUserByEmail(args.email);
  if (error || !data?.user) {
    throw new Error(error?.message ?? "Invite failed: no user returned");
  }
  const { data: row, error: insertError } = await service
    .from("app_users")
    .insert({
      id: data.user.id,
      email: args.email,
      role: args.role,
      status: "invited",
      invited_by: args.invitedBy,
    })
    .select(APP_USER_SELECT)
    .single();
  if (insertError) throw new Error(insertError.message);
  return mapAppUserRow(row as Record<string, unknown>);
}

/** Flips invited→active on first successful login. No-op if already active. */
export async function activateAppUser(
  service: SupabaseClient,
  userId: string,
): Promise<void> {
  const { error } = await service
    .from("app_users")
    .update({ status: "active" })
    .eq("id", userId)
    .eq("status", "invited");
  if (error) throw new Error(error.message);
}

/**
 * Gate for admin-only routes. Identity comes from the session-bound client
 * (self-read RLS lets a user read their own row); the caller then uses the
 * service client for operations touching other rows. Returns a 401 when
 * unauthenticated, 403 when the caller lacks the admin role.
 */
export async function requireAdmin(
  sessionClient: SupabaseClient,
  service: SupabaseClient,
): Promise<ParseResult<AppUser>> {
  let userId: string;
  try {
    userId = await getUserId(sessionClient);
  } catch (err) {
    if (err instanceof NotAuthenticatedError) {
      return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
    }
    throw err;
  }
  const appUser = await getAppUser(service, userId);
  if (!appUser || appUser.role !== "admin") {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, data: appUser };
}
```

- [ ] **Step 4: Add the Zod schemas**

Append to `src/lib/api-schemas.ts`:

```ts
// --- Access: POST /api/setup/bootstrap & POST /api/admin/users ---
// Both take a single email. Kept as two named schemas so each endpoint's
// surface is explicit even though they currently coincide.
export const SetupBootstrapSchema = z.object({
  email: z.string().email(),
});

export const AdminInviteSchema = z.object({
  email: z.string().email(),
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/access.test.ts`
Expected: PASS (all describe-blocks green).

- [ ] **Step 6: Commit**

```bash
git add src/lib/access.ts src/lib/__tests__/access.test.ts src/lib/api-schemas.ts
git commit -m "feat: access helper module (app_users ops) + invite Zod schemas"
```

---

## Task 2: Setup API-routes + middleware public paths

**Files:**
- Create: `src/app/api/setup/status/route.ts`
- Create: `src/app/api/setup/bootstrap/route.ts`
- Create: `src/app/api/setup/__tests__/route.test.ts`
- Modify: `src/middleware.ts` (utöka `PUBLIC_PATHS`)

**Interfaces:**
- Consumes: `countAppUsers`, `createInvite` (Task 1), `createServiceClient` (`@/lib/supabase`), `parseBody` + `internalError` (`@/lib/api-helpers`), `SetupBootstrapSchema` (Task 1).
- Produces: `GET /api/setup/status` → `{ needsSetup: boolean }`; `POST /api/setup/bootstrap` → `201 { id }` eller `409 { error }` när setup redan skedd.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/setup/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

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

function jsonRequest(body: unknown): Request {
  return new Request("http://x/api/setup/bootstrap", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
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
    h.createInviteMock.mockResolvedValue({ id: "admin-id" });
    const res = await bootstrapPOST(jsonRequest({ email: "boss@firm.se" }));
    expect(res.status).toBe(201);
    expect(h.createInviteMock).toHaveBeenCalledWith(expect.anything(), { email: "boss@firm.se", role: "admin", invitedBy: null });
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/setup/__tests__/route.test.ts`
Expected: FAIL — cannot find `../status/route`.

- [ ] **Step 3: Implement the status route**

Create `src/app/api/setup/status/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { countAppUsers } from "@/lib/access";
import { internalError } from "@/lib/api-helpers";

// Public (see middleware PUBLIC_PATHS): the /setup page calls this BEFORE any
// session exists, to decide whether a fresh install still needs bootstrapping.
export async function GET() {
  try {
    const service = createServiceClient();
    const count = await countAppUsers(service);
    return NextResponse.json({ needsSetup: count === 0 });
  } catch (err) {
    return internalError(err);
  }
}
```

- [ ] **Step 4: Implement the bootstrap route**

Create `src/app/api/setup/bootstrap/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { countAppUsers, createInvite } from "@/lib/access";
import { parseBody, internalError } from "@/lib/api-helpers";
import { SetupBootstrapSchema } from "@/lib/api-schemas";

// Public. Creates the FIRST admin on a fresh install and is inert thereafter
// (409 once any app_users row exists). The re-check here is best-effort against
// a concurrent double-submit — the residual bootstrap race is an accepted risk
// (single-operator install), see the design doc.
export async function POST(request: NextRequest) {
  try {
    const parsed = await parseBody(request, SetupBootstrapSchema);
    if (!parsed.ok) return parsed.response;

    const service = createServiceClient();
    if ((await countAppUsers(service)) > 0) {
      return NextResponse.json(
        { error: "Setup är redan slutförd. Logga in via /login." },
        { status: 409 },
      );
    }

    const admin = await createInvite(service, {
      email: parsed.data.email,
      role: "admin",
      invitedBy: null,
    });
    return NextResponse.json({ id: admin.id }, { status: 201 });
  } catch (err) {
    return internalError(err);
  }
}
```

- [ ] **Step 5: Open the public paths in middleware**

In `src/middleware.ts`, extend `PUBLIC_PATHS`:

```ts
const PUBLIC_PATHS = [
  "/login",
  "/setup",
  "/api/setup",
  "/auth/callback",
  "/auth/signout",
  "/api/radar/fetch",
  "/api/radar/score",
];
```

(No other middleware change. `/api/setup` covers both `/api/setup/status` and `/api/setup/bootstrap` via the existing `startsWith(p + "/")` check.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/app/api/setup/__tests__/route.test.ts`
Expected: PASS (7 assertions across 5 tests).

- [ ] **Step 7: Commit**

```bash
git add src/app/api/setup src/middleware.ts
git commit -m "feat: /api/setup status+bootstrap routes; open setup paths in middleware"
```

---

## Task 3: /setup-sida (bootstrap-UI)

**Files:**
- Create: `src/app/setup/page.tsx`
- Create: `src/app/setup/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `GET /api/setup/status`, `POST /api/setup/bootstrap` (Task 2).
- Produces: en publik sida. När `needsSetup:false` → redirect till `/login` (inert). Mönster speglar `src/app/login/page.tsx` (client component, `useState`, fetch).

- [ ] **Step 1: Write the failing test**

Create `src/app/setup/__tests__/page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({ replaceMock: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: h.replaceMock }) }));

import SetupPage from "../page";

beforeEach(() => {
  h.replaceMock.mockReset();
  vi.restoreAllMocks();
});

describe("SetupPage", () => {
  it("redirects to /login when setup is already done", async () => {
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ needsSetup: false }) }),
    ) as never);
    render(<SetupPage />);
    await waitFor(() => expect(h.replaceMock).toHaveBeenCalledWith("/login"));
  });

  it("shows the email form on a fresh install", async () => {
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ needsSetup: true }) }),
    ) as never);
    render(<SetupPage />);
    await waitFor(() => expect(screen.getByLabelText(/E-post/)).toBeTruthy());
    expect(h.replaceMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/setup/__tests__/page.test.tsx`
Expected: FAIL — cannot find `../page`.

- [ ] **Step 3: Implement the page**

Create `src/app/setup/page.tsx` (spegla login-sidans struktur/klasser):

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function SetupPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/setup/status")
      .then((r) => r.json())
      .then((d: { needsSetup: boolean }) => {
        if (!active) return;
        if (!d.needsSetup) router.replace("/login");
        else setReady(true);
      })
      .catch(() => active && setReady(true));
    return () => {
      active = false;
    };
  }, [router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email) return;
    setStatus("sending");
    setErrorMessage(null);
    const res = await fetch("/api/setup/bootstrap", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setStatus("error");
      setErrorMessage(body.error ?? "Kunde inte slutföra setup.");
      return;
    }
    setStatus("sent");
  }

  if (!ready) return null;

  return (
    <main className="min-h-screen bg-paper flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-display font-normal mb-2">Kom igång</h1>
        <p className="text-sm text-ink-mute mb-8">
          Ange din e-postadress för att skapa administratörskontot. Du får en
          inloggningslänk. Det här steget kan bara göras en gång.
        </p>

        {status === "sent" ? (
          <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            Administratörskontot är skapat. Vi har skickat en inloggningslänk till{" "}
            <strong>{email}</strong>. Öppna mejlet och klicka på länken.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-1">
                E-post
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-rule px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-soft"
                placeholder="du@foretag.se"
                disabled={status === "sending"}
              />
            </div>

            {errorMessage && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={status === "sending"}
              className="w-full rounded-md bg-ink py-2 text-sm font-medium text-white hover:bg-accent-ink disabled:opacity-50"
            >
              {status === "sending" ? "Skapar…" : "Skapa administratörskonto"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/setup/__tests__/page.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/setup
git commit -m "feat: /setup page for first-admin bootstrap"
```

---

## Task 4: /login — stäng signup

**Files:**
- Modify: `src/app/login/page.tsx` (lägg `shouldCreateUser: false` + felmeddelande-mappning)
- Create: `src/app/login/__tests__/error-message.test.ts`

**Interfaces:**
- Produces: en ren funktion `messageForOtpError(raw: string): string` (exporterad från login-sidan) som mappar Supabas "signup-inte-tillåtet"-felet till svensk copy, annars generiskt. Test importerar den utan att rendera sidan.

- [ ] **Step 1: Write the failing test**

Create `src/app/login/__tests__/error-message.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { messageForOtpError } from "../page";

describe("messageForOtpError", () => {
  it("maps the signup-disabled error to the not-invited copy", () => {
    expect(messageForOtpError("Signups not allowed for otp")).toMatch(/inte inbjuden/i);
  });
  it("maps the disabled-variant too", () => {
    expect(messageForOtpError("Signup is disabled")).toMatch(/inte inbjuden/i);
  });
  it("falls back to the raw message for unknown errors", () => {
    expect(messageForOtpError("Rate limit exceeded")).toBe("Rate limit exceeded");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/login/__tests__/error-message.test.ts`
Expected: FAIL — `messageForOtpError` is not exported.

- [ ] **Step 3: Implement the change**

In `src/app/login/page.tsx`:

(a) Add the exported mapper above `LoginForm` (defensive substring match — Supabase has no dedicated code for this; fall back to the raw message so a changed error format never shows misleading text):

```ts
export function messageForOtpError(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes("signup") && (s.includes("not allowed") || s.includes("disabled"))) {
    return "Den här adressen är inte inbjuden. Kontakta din administratör.";
  }
  return raw;
}
```

(b) In `signInWithOtp`, add `shouldCreateUser: false` and route the error through the mapper:

```ts
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
    });

    if (error) {
      setStatus("error");
      setErrorMessage(messageForOtpError(error.message));
      return;
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/login/__tests__/error-message.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/login/page.tsx src/app/login/__tests__/error-message.test.ts
git commit -m "feat: close open signup on /login (shouldCreateUser:false + not-invited copy)"
```

---

## Task 5: /auth/callback — medlemskapsgrind

**Files:**
- Modify: `src/app/auth/callback/route.ts`
- Create: `src/app/auth/callback/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `getAppUser`, `activateAppUser` (Task 1), `createServiceClient` (`@/lib/supabase`), befintlig `createClient` (`@/lib/supabase/server`).
- Produces: efter lyckad `exchangeCodeForSession`: ingen app_users-rad ⇒ `signOut()` + redirect `/login?error=no_access`; rad med `status:"invited"` ⇒ `activateAppUser`; sedan redirect `next`.

- [ ] **Step 1: Write the failing test**

Create `src/app/auth/callback/__tests__/route.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/auth/callback/__tests__/route.test.ts`
Expected: FAIL — current route neither signs out nor calls getAppUser.

- [ ] **Step 3: Implement the change**

Replace `src/app/auth/callback/route.ts` with:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase";
import { getAppUser, activateAppUser } from "@/lib/access";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/login?error=no_user`);
  }

  // Membership gate: a session without an app_users row is denied, never given
  // default access. In normal operation this is unreachable (accounts are only
  // ever created via /setup or an admin invite, both of which insert the row in
  // the same call), so a missing row means an orphaned auth account — deny it.
  const service = createServiceClient();
  const appUser = await getAppUser(service, user.id);
  if (!appUser) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=no_access`);
  }
  if (appUser.status === "invited") {
    await activateAppUser(service, user.id);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/auth/callback/__tests__/route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/auth/callback/route.ts src/app/auth/callback/__tests__/route.test.ts
git commit -m "feat: enforce app_users membership in /auth/callback (deny orphans, activate on first login)"
```

---

## Task 6: /api/admin/users — lista + bjud in

**Files:**
- Create: `src/app/api/admin/users/route.ts`
- Create: `src/app/api/admin/users/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `requireAdmin`, `findAppUserByEmail`, `createInvite`, `mapAppUserRow`/`AppUser` (Task 1), `createServiceClient` (`@/lib/supabase`), `createClient` (`@/lib/supabase/server`), `parseBody`+`internalError` (`@/lib/api-helpers`), `AdminInviteSchema` (Task 1).
- Produces: `GET` → `{ users: AppUser[] }` (admin only). `POST { email }` → `201 { id }` / `403` icke-admin / `409` dubblett.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/admin/users/__tests__/route.test.ts`:

```ts
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
import { NextResponse } from "next/server";

function jsonReq(body: unknown): Request {
  return new Request("http://x/api/admin/users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
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
    expect(h.createInviteMock).toHaveBeenCalledWith(expect.anything(), { email: "new@firm.se", role: "member", invitedBy: "admin1" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/admin/users/__tests__/route.test.ts`
Expected: FAIL — cannot find `../route`.

- [ ] **Step 3: Implement the route**

Create `src/app/api/admin/users/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase";
import {
  requireAdmin,
  findAppUserByEmail,
  createInvite,
  mapAppUserRow,
} from "@/lib/access";
import { parseBody, internalError } from "@/lib/api-helpers";
import { AdminInviteSchema } from "@/lib/api-schemas";

export async function GET() {
  try {
    const sessionClient = await createClient();
    const service = createServiceClient();
    const auth = await requireAdmin(sessionClient, service);
    if (!auth.ok) return auth.response;

    const { data, error } = await service
      .from("app_users")
      .select("id, email, role, status, invited_by, created_at, updated_at")
      .order("created_at", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      users: (data ?? []).map((r) => mapAppUserRow(r as Record<string, unknown>)),
    });
  } catch (err) {
    return internalError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionClient = await createClient();
    const service = createServiceClient();
    const auth = await requireAdmin(sessionClient, service);
    if (!auth.ok) return auth.response;

    const parsed = await parseBody(request, AdminInviteSchema);
    if (!parsed.ok) return parsed.response;

    if (await findAppUserByEmail(service, parsed.data.email)) {
      return NextResponse.json(
        { error: "Adressen är redan inbjuden." },
        { status: 409 },
      );
    }

    const invited = await createInvite(service, {
      email: parsed.data.email,
      role: "member",
      invitedBy: auth.data.id,
    });
    return NextResponse.json({ id: invited.id }, { status: 201 });
  } catch (err) {
    return internalError(err);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/api/admin/users/__tests__/route.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/users
git commit -m "feat: /api/admin/users — admin-gated list + member invite"
```

---

## Task 7: Admin-sida under Inställningar

**Files:**
- Create: `src/app/arbetsyta/installningar/anvandare/page.tsx`
- Create: `src/app/arbetsyta/installningar/anvandare/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `GET/POST /api/admin/users` (Task 6).
- Produces: minimal admin-UI (mejlfält + lista med status). Visuell polish itereras separat med Stefan — håll det funktionellt.

**Note:** Verifiera hur befintliga `/arbetsyta/**`-sidor hämtar data och länkas i navigeringen (`git grep "arbetsyta/installningar"` och titta på en granndsida) innan du skriver — spegla mönstret. Om en Inställningar-landning finns, lägg en länk dit till `/arbetsyta/installningar/anvandare` (samma commit).

- [ ] **Step 1: Write the failing test**

Create `src/app/arbetsyta/installningar/anvandare/__tests__/page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import UsersPage from "../page";

beforeEach(() => vi.restoreAllMocks());

describe("UsersPage", () => {
  it("renders the invited users returned by the API", async () => {
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ users: [
          { id: "u1", email: "boss@firm.se", role: "admin", status: "active", invitedBy: null, createdAt: "t", updatedAt: "t" },
          { id: "u2", email: "kollega@firm.se", role: "member", status: "invited", invitedBy: "u1", createdAt: "t", updatedAt: "t" },
        ] }),
      }),
    ) as never);
    render(<UsersPage />);
    await waitFor(() => expect(screen.getByText("boss@firm.se")).toBeTruthy());
    expect(screen.getByText("kollega@firm.se")).toBeTruthy();
    expect(screen.getByText(/Inbjuden/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/arbetsyta/installningar/anvandare/__tests__/page.test.tsx`
Expected: FAIL — cannot find `../page`.

- [ ] **Step 3: Implement the page**

Create `src/app/arbetsyta/installningar/anvandare/page.tsx`:

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";

interface AppUserView {
  id: string;
  email: string;
  role: "admin" | "member";
  status: "invited" | "active";
}

export default function UsersPage() {
  const [users, setUsers] = useState<AppUserView[]>([]);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (!res.ok) return;
    const body = (await res.json()) as { users: AppUserView[] };
    setUsers(body.users);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function invite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email) return;
    setStatus("sending");
    setErrorMessage(null);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setStatus("error");
      setErrorMessage(body.error ?? "Kunde inte bjuda in.");
      return;
    }
    setEmail("");
    setStatus("idle");
    await load();
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-display font-normal mb-6">Användare</h1>

      <form onSubmit={invite} className="flex gap-2 mb-8">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 rounded-md border border-rule px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-soft"
          placeholder="kollega@foretag.se"
          disabled={status === "sending"}
        />
        <button
          type="submit"
          disabled={status === "sending"}
          className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-accent-ink disabled:opacity-50"
        >
          {status === "sending" ? "Bjuder in…" : "Bjud in"}
        </button>
      </form>

      {errorMessage && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 mb-4">
          {errorMessage}
        </div>
      )}

      <ul className="divide-y divide-rule">
        {users.map((u) => (
          <li key={u.id} className="flex items-center justify-between py-3 text-sm">
            <span>{u.email}</span>
            <span className="text-ink-mute">
              {u.role === "admin" ? "Administratör" : "Medlem"} ·{" "}
              {u.status === "invited" ? "Inbjuden" : "Aktiv"}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/arbetsyta/installningar/anvandare/__tests__/page.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/arbetsyta/installningar/anvandare
git commit -m "feat: admin users page (invite + list) under Installningar"
```

---

## Task 8: Full verifiering + live invite-smoke

**Files:** ingen (verifieringssteg).

- [ ] **Step 1: Lint, typecheck, hela testsviten**

Run (PowerShell i `bidsmith-access`):
```
npm run lint
npx tsc --noEmit
npx vitest run
```
Expected: lint 0 errors, tsc tyst, alla tester gröna (befintliga + de nya). Åtgärda ev. fynd innan nästa steg.

- [ ] **Step 2: Live invite-smoke mot dev-Supabase (Stefan/manuellt — kan inte enhetstestas)**

> **Kräver att migration 013 applicerats i Supabase SQL Editor och att appen kör mot dev-projektet.** Detta verifierar den integrationsnuans enhetstesterna inte kan täcka: att `inviteUserByEmail`-mejlet faktiskt levereras och att dess länk-token växlas korrekt i `/auth/callback`.

1. Färsk DB (0 app_users-rader): gå till `/setup`, ange din mejl, verifiera att inbjudningsmejlet kommer och att länken loggar in dig. Kontrollera i SQL Editor: din rad har `role='admin'`, `status='active'`.
2. Gå till `/setup` igen → ska redirecta till `/login` (inert).
3. Som admin: `/arbetsyta/installningar/anvandare`, bjud in en andra adress. Verifiera 201 + att raden syns som "Medlem · Inbjuden".
4. Logga in som den andra adressen via mejllänken → verifiera inloggning och att raden flippar till "Aktiv".
5. Försök logga in på `/login` med en adress som INTE är inbjuden → verifiera copyn "Den här adressen är inte inbjuden."
6. **Om länk-token inte är en `?code=`-parameter** (Supabase kan använda `token_hash`/`type=invite` beroende på projektets mejlmall/PKCE-läge — jfr det kända dev-login-krånglet): notera exakt query-format och utöka `/auth/callback` att hantera även den varianten (`verifyOtp({ token_hash, type })`) innan publicering. Detta är den enda punkten som kan kräva en kodjustering efter live-testet.

- [ ] **Step 3: Commit ev. callback-justering** (endast om steg 2.6 krävde det)

```bash
git add src/app/auth/callback/route.ts
git commit -m "fix: handle invite token_hash variant in /auth/callback (live-verified)"
```

---

## Task 9: ROADMAP-bokföring + PR

**Files:**
- Modify: `notes/ROADMAP.md`

- [ ] **Step 1: Uppdatera ROADMAP**

Uppdatera statushuvudet i `notes/ROADMAP.md`: access-modellen levererad (stängd signup, app_users-roll, invite-flow, /setup-bootstrap). Lägg backlog-posterna som lämnades utanför v1 (från specen): återkalla/inaktivera åtkomst från UI, byta roll efter skapande, återsända utgånget inbjudningsmejl, samt Supabase built-in-mejlets rate-limits vid högre invite-volym. Uppdatera "NÄSTA": video → publicering.

- [ ] **Step 2: Commit**

```bash
git add notes/ROADMAP.md
git commit -m "docs: roadmap tick — access model (invite-flow) delivered"
```

- [ ] **Step 3: Push + öppna PR mot bidsmith-remoten**

```bash
git push bidsmith feat/access-control
gh pr create --repo DaVincisfather/bidsmith --base main --head feat/access-control \
  --title "Access model: invite-flow (close open signup)" \
  --body "Stänger öppen signup. Ny app_users-tabell (013), /setup bootstrappar första admin, admins bjuder in via /arbetsyta/installningar/anvandare, /auth/callback nekar konton utan app_users-rad. Design: docs/superpowers/specs/2026-07-20-access-control-design.md. OBS: migration 013 måste appliceras i Supabase SQL Editor före deploy."
```

Vänta in CI + PR-review-routinens kommentar innan squash-merge (projektets PR-rutin).

---

## Self-review (ifylld)

- **Spec coverage:** Stängd signup → Task 4. Admin-roll i DB → Task 0 (migration) + Task 1. Setup-steg → Task 2+3. Invite via Supabase-mejl → Task 1 (`createInvite`) + Task 6. Callback-grind/status-flip → Task 5. Middleware → Task 2. Felhantering (orphan/dubbel/felmapp) → Task 5/6/4. Tester → varje task. v1-scope-undantag bokförs → Task 9. Alla spec-sektioner har en task.
- **Placeholder-scan:** inga TBD/TODO; live-smoken (Task 8) är medvetet manuell och fullt beskriven (kan inte enhetstestas).
- **Typkonsistens:** `AppUser`/`AppUserRole`/`AppUserStatus`, `createInvite(service, {email, role, invitedBy})`, `requireAdmin(sessionClient, service)`, `getAppUser`, `findAppUserByEmail`, `activateAppUser` används med samma signaturer i Task 2/5/6 som de definieras i Task 1.
